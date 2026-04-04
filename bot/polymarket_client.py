"""Polymarket CLOB API client for Bitcoin 5-minute prediction markets.

Uses the REST API directly without py-clob-client dependency.
"""

import hashlib
import hmac
import logging
import time
from base64 import b64encode
from dataclasses import dataclass

import requests

from config import PolymarketConfig

logger = logging.getLogger(__name__)

CLOB_BASE_URL = "https://clob.polymarket.com"
GAMMA_BASE_URL = "https://gamma-api.polymarket.com"

BITCOIN_5MIN_SLUG = "bitcoin-5-minute"
BITCOIN_KEYWORDS = ["bitcoin", "btc"]
FIVE_MIN_KEYWORDS = ["5-minute", "5 minute", "5min", "five minute"]


@dataclass
class Market:
    condition_id: str
    question: str
    token_id_yes: str
    token_id_no: str
    end_date: str
    active: bool
    best_ask_yes: float
    best_ask_no: float


@dataclass
class TradeResult:
    success: bool
    order_id: str | None
    side: str  # "YES" or "NO"
    price: float
    amount: float
    message: str


class PolymarketClient:
    """Client to interact with Polymarket CLOB for Bitcoin 5-min markets."""

    def __init__(self, config: PolymarketConfig):
        self.config = config
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
        })

    def _get_auth_headers(self, method: str, path: str, body: str = "") -> dict:
        """Generate HMAC authentication headers for CLOB API."""
        timestamp = str(int(time.time()))
        message = timestamp + method.upper() + path + body
        signature = b64encode(
            hmac.new(
                self.config.api_secret.encode(),
                message.encode(),
                hashlib.sha256,
            ).digest()
        ).decode()

        return {
            "POLY-API-KEY": self.config.api_key,
            "POLY-SIGNATURE": signature,
            "POLY-TIMESTAMP": timestamp,
            "POLY-PASSPHRASE": self.config.api_passphrase,
        }

    def find_active_btc_5min_markets(self) -> list[Market]:
        """Find active Bitcoin 5-minute prediction markets via Gamma API."""
        markets = []

        try:
            # Search for Bitcoin 5-minute markets
            resp = self.session.get(
                f"{GAMMA_BASE_URL}/markets",
                params={
                    "closed": "false",
                    "limit": 100,
                },
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()

            for market_data in data:
                if self._is_btc_5min_market(market_data):
                    market = self._parse_market(market_data)
                    if market and market.active:
                        markets.append(market)

        except Exception as e:
            logger.error("Error fetching markets: %s", e)

        # Also try searching by tag
        if not markets:
            try:
                resp = self.session.get(
                    f"{GAMMA_BASE_URL}/markets",
                    params={
                        "closed": "false",
                        "tag": "bitcoin",
                        "limit": 50,
                    },
                    timeout=15,
                )
                resp.raise_for_status()
                data = resp.json()

                for market_data in data:
                    if self._is_btc_5min_market(market_data):
                        market = self._parse_market(market_data)
                        if market and market.active:
                            markets.append(market)

            except Exception as e:
                logger.error("Error fetching markets by tag: %s", e)

        logger.info("Found %d active BTC 5-min markets", len(markets))
        return markets

    def find_current_btc_5min_market(self) -> Market | None:
        """Find the most recent active Bitcoin 5-min market."""
        markets = self.find_active_btc_5min_markets()
        if not markets:
            return None
        return sorted(markets, key=lambda m: m.end_date, reverse=True)[0]

    def get_orderbook(self, token_id: str) -> dict:
        """Get the order book for a specific token from CLOB."""
        try:
            resp = self.session.get(
                f"{CLOB_BASE_URL}/book",
                params={"token_id": token_id},
                timeout=10,
            )
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.error("Error fetching orderbook for %s: %s", token_id, e)
            return {}

    def get_best_prices(self, market: Market) -> tuple[float, float]:
        """Get best ask prices for YES and NO tokens."""
        try:
            book_yes = self.get_orderbook(market.token_id_yes)
            book_no = self.get_orderbook(market.token_id_no)

            asks_yes = book_yes.get("asks", [])
            asks_no = book_no.get("asks", [])

            yes_price = float(asks_yes[0]["price"]) if asks_yes else 0.5
            no_price = float(asks_no[0]["price"]) if asks_no else 0.5

            return yes_price, no_price
        except (IndexError, KeyError, TypeError):
            return 0.5, 0.5

    def buy_yes(
        self, market: Market, amount_usdc: float, price: float
    ) -> TradeResult:
        """Buy YES tokens (betting BTC goes UP)."""
        return self._place_order(
            token_id=market.token_id_yes,
            side="BUY",
            amount=amount_usdc,
            price=price,
            label="YES",
        )

    def buy_no(
        self, market: Market, amount_usdc: float, price: float
    ) -> TradeResult:
        """Buy NO tokens (betting BTC goes DOWN)."""
        return self._place_order(
            token_id=market.token_id_no,
            side="BUY",
            amount=amount_usdc,
            price=price,
            label="NO",
        )

    def _place_order(
        self,
        token_id: str,
        side: str,
        amount: float,
        price: float,
        label: str,
    ) -> TradeResult:
        """Place a limit order on Polymarket CLOB API."""
        try:
            size = amount / price

            order_payload = {
                "tokenID": token_id,
                "price": str(price),
                "size": str(size),
                "side": side,
                "type": "GTC",
            }

            import json
            body = json.dumps(order_payload)
            path = "/order"
            headers = self._get_auth_headers("POST", path, body)

            resp = self.session.post(
                f"{CLOB_BASE_URL}{path}",
                json=order_payload,
                headers=headers,
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()

            order_id = data.get("orderID", "")
            success = bool(order_id)

            result = TradeResult(
                success=success,
                order_id=order_id,
                side=label,
                price=price,
                amount=amount,
                message=f"Order placed: {label} @ {price}" if success else f"Order failed: {data}",
            )

            if success:
                logger.info(
                    "Trade executed: %s %s @ $%.4f ($%.2f USDC)",
                    side, label, price, amount,
                )
            else:
                logger.warning("Trade failed: %s", data)

            return result

        except Exception as e:
            logger.error("Error placing %s order: %s", label, e)
            return TradeResult(
                success=False,
                order_id=None,
                side=label,
                price=price,
                amount=amount,
                message=str(e),
            )

    def _is_btc_5min_market(self, market_data: dict) -> bool:
        """Check if a market is a Bitcoin 5-minute prediction market."""
        question = market_data.get("question", "").lower()
        description = market_data.get("description", "").lower()
        slug = market_data.get("slug", "").lower()
        tags_raw = market_data.get("tags", [])
        tags = [t.lower() for t in tags_raw] if isinstance(tags_raw, list) else []

        has_btc = any(kw in question or kw in description for kw in BITCOIN_KEYWORDS)
        has_5min = any(kw in question or kw in description for kw in FIVE_MIN_KEYWORDS)
        is_slug_match = BITCOIN_5MIN_SLUG in slug

        is_tagged = any(
            "bitcoin" in t or "btc" in t or "crypto" in t for t in tags
        )

        return (has_btc and has_5min) or is_slug_match or (is_tagged and has_5min)

    def _parse_market(self, market_data: dict) -> Market | None:
        """Parse raw market data into a Market object."""
        try:
            tokens = market_data.get("tokens", [])
            if len(tokens) < 2:
                return None

            token_yes = tokens[0]
            token_no = tokens[1]

            return Market(
                condition_id=market_data.get("condition_id", market_data.get("conditionId", "")),
                question=market_data.get("question", ""),
                token_id_yes=token_yes.get("token_id", token_yes.get("tokenId", "")),
                token_id_no=token_no.get("token_id", token_no.get("tokenId", "")),
                end_date=market_data.get("end_date_iso", market_data.get("endDate", "")),
                active=market_data.get("active", not market_data.get("closed", False)),
                best_ask_yes=float(token_yes.get("price", 0.5)),
                best_ask_no=float(token_no.get("price", 0.5)),
            )
        except (KeyError, IndexError, ValueError) as e:
            logger.warning("Failed to parse market: %s", e)
            return None
