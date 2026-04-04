"""Configuration for the Polymarket Bitcoin 5-min trading bot."""

import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


@dataclass
class PolymarketConfig:
    api_key: str
    api_secret: str
    api_passphrase: str
    private_key: str
    host: str = "https://clob.polymarket.com"
    chain_id: int = 137  # Polygon mainnet


@dataclass
class TradingConfig:
    trade_amount_usdc: float = 5.0
    max_daily_trades: int = 50
    max_daily_loss_usdc: float = 25.0
    poll_interval_seconds: int = 30
    dry_run: bool = True


@dataclass
class StrategyConfig:
    rsi_period: int = 14
    rsi_overbought: float = 70.0
    rsi_oversold: float = 30.0
    momentum_window: int = 5
    confidence_threshold: float = 0.15


def load_polymarket_config() -> PolymarketConfig:
    api_key = os.getenv("POLYMARKET_API_KEY", "")
    api_secret = os.getenv("POLYMARKET_API_SECRET", "")
    api_passphrase = os.getenv("POLYMARKET_API_PASSPHRASE", "")
    private_key = os.getenv("PRIVATE_KEY", "")

    if not all([api_key, api_secret, api_passphrase, private_key]):
        raise ValueError(
            "Missing Polymarket credentials. "
            "Set POLYMARKET_API_KEY, POLYMARKET_API_SECRET, "
            "POLYMARKET_API_PASSPHRASE, and PRIVATE_KEY in .env"
        )

    return PolymarketConfig(
        api_key=api_key,
        api_secret=api_secret,
        api_passphrase=api_passphrase,
        private_key=private_key,
    )


def load_trading_config() -> TradingConfig:
    return TradingConfig(
        trade_amount_usdc=float(os.getenv("TRADE_AMOUNT_USDC", "5.0")),
        max_daily_trades=int(os.getenv("MAX_DAILY_TRADES", "50")),
        max_daily_loss_usdc=float(os.getenv("MAX_DAILY_LOSS_USDC", "25.0")),
        poll_interval_seconds=int(os.getenv("POLL_INTERVAL_SECONDS", "30")),
        dry_run=os.getenv("DRY_RUN", "true").lower() == "true",
    )


def load_strategy_config() -> StrategyConfig:
    return StrategyConfig(
        rsi_period=int(os.getenv("RSI_PERIOD", "14")),
        rsi_overbought=float(os.getenv("RSI_OVERBOUGHT", "70")),
        rsi_oversold=float(os.getenv("RSI_OVERSOLD", "30")),
        momentum_window=int(os.getenv("MOMENTUM_WINDOW", "5")),
        confidence_threshold=float(os.getenv("CONFIDENCE_THRESHOLD", "0.15")),
    )
