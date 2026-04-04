"""Polymarket CLOB API client for Bitcoin 5-minute prediction markets."""

import logging
import time
from dataclasses import dataclass

from py_clob_client.client import ClobClient
from py_clob_client.clob_types import OrderArgs, OrderType
from py_clob_client.order_builder.constants import BUY, SELL

from config import PolymarketConfig

logger = logging.getLogger(__name__)

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
        self.client = ClobClient(
            host=config.host,
            key=config.api_key,
            chain_id=config.chain_id,
            signature_type=2,
            funder=config.private_key,
        )
        self._api_creds = None
        self._init_client()

    def _init_client(self):
        """Initialize API credentials and derive keys."""
        try:
            self.client.set_api_creds(
                self.client.create_or_derive_api_creds()
            )
            logger.info("Polymarket client initialized successfully")
        except Exception as e:
            logger.error("Failed to initialize Polymarket client: %s", e)
            raise

    def find_active_btc_5min_markets(self) -> list[Market]:
        """Find active Bitcoin 5-minute prediction markets."""
        markets = []
        next_cursor = ""

        for _ in range(10):  # Max 10 pages
            try:
                resp = self.client.get_markets(next_cursor=next_cursor)
            except Exception as e:
                logger.error("Error fetching markets: %s", e)
                break

            for market_data in resp.get("data", []):
                if self._is_btc_5min_market(market_data):
                    market = self._parse_market(market_data)
                    if market and market.active:
                        markets.append(market)

            next_cursor = resp.get("next_cursor", "")
            if not next_cursor or next_cursor == "LTE=":
                break

        logger.info("Found %d active BTC 5-min markets", len(markets))
        return markets

    def find_current_btc_5min_market(self) -> Market | None:
        """Find the most recent active Bitcoin 5-min market."""
        markets = self.find_active_btc_5min_markets()
        if not markets:
            return None
        # Return the market with the latest end date
        return sorted(markets, key=lambda m: m.end_date, reverse=True)[0]

    def get_market_orderbook(self, token_id: str) -> dict:
        """Get the order book for a specific token."""
        try:
            return self.client.get_order_book(token_id)
        except Exception as e:
            logger.error("Error fetching orderbook for %s: %s", token_id, e)
            return {}

    def get_best_prices(self, market: Market) -> tuple[float, float]:
        """Get best ask prices for YES and NO tokens.

        Returns:
            Tuple of (yes_price, no_price)
        """
        try:
            book_yes = self.client.get_order_book(market.token_id_yes)
            book_no = self.client.get_order_book(market.token_id_no)

            yes_price = float(book_yes.get("asks", [{}])[0].get("price", 0.5))
            no_price = float(book_no.get("asks", [{}])[0].get("price", 0.5))

            return yes_price, no_price
        except (IndexError, KeyError, TypeError):
            return 0.5, 0.5

    def buy_yes(
        self, market: Market, amount_usdc: float, price: float
    ) -> TradeResult:
        """Buy YES tokens (betting BTC goes UP)."""
        return self._place_order(
            token_id=market.token_id_yes,
            side=BUY,
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
            side=BUY,
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
        """Place a limit order on Polymarket."""
        try:
            order_args = OrderArgs(
                price=price,
                size=amount / price,  # Convert USDC amount to token quantity
                side=side,
                token_id=token_id,
            )

            signed_order = self.client.create_order(order_args)
            resp = self.client.post_order(signed_order, OrderType.GTC)

            order_id = resp.get("orderID", "")
            success = bool(order_id)

            result = TradeResult(
                success=success,
                order_id=order_id,
                side=label,
                price=price,
                amount=amount,
                message=f"Order placed: {label} @ {price}" if success else f"Order failed: {resp}",
            )

            if success:
                logger.info(
                    "Trade executed: %s %s @ $%.4f ($%.2f USDC)",
                    side, label, price, amount,
                )
            else:
                logger.warning("Trade failed: %s", resp)

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

    def get_balance(self) -> float:
        """Get USDC balance on Polymarket."""
        try:
            balance = self.client.get_balance()
            return float(balance) if balance else 0.0
        except Exception as e:
            logger.error("Error getting balance: %s", e)
            return 0.0

    def _is_btc_5min_market(self, market_data: dict) -> bool:
        """Check if a market is a Bitcoin 5-minute prediction market."""
        question = market_data.get("question", "").lower()
        description = market_data.get("description", "").lower()
        slug = market_data.get("slug", "").lower()
        tags = [t.lower() for t in market_data.get("tags", [])]

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

            # Tokens: index 0 = YES, index 1 = NO
            token_yes = tokens[0]
            token_no = tokens[1]

            return Market(
                condition_id=market_data.get("condition_id", ""),
                question=market_data.get("question", ""),
                token_id_yes=token_yes.get("token_id", ""),
                token_id_no=token_no.get("token_id", ""),
                end_date=market_data.get("end_date_iso", ""),
                active=market_data.get("active", False),
                best_ask_yes=float(token_yes.get("price", 0.5)),
                best_ask_no=float(token_no.get("price", 0.5)),
            )
        except (KeyError, IndexError, ValueError) as e:
            logger.warning("Failed to parse market: %s", e)
            return None
