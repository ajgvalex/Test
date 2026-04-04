"""Main bot orchestrator for Polymarket Bitcoin 5-minute trading."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

from config import (
    PolymarketConfig,
    StrategyConfig,
    TradingConfig,
    load_polymarket_config,
    load_strategy_config,
    load_trading_config,
)
from polymarket_client import Market, PolymarketClient, TradeResult
from strategy import BTCStrategy, Signal

logger = logging.getLogger(__name__)


@dataclass
class BotStats:
    """Track bot trading statistics."""

    trades_today: int = 0
    wins: int = 0
    losses: int = 0
    total_profit_usdc: float = 0.0
    total_spent_usdc: float = 0.0
    start_time: str = ""
    last_trade_time: str = ""
    trade_history: list[dict] = field(default_factory=list)

    @property
    def win_rate(self) -> float:
        total = self.wins + self.losses
        return (self.wins / total * 100) if total > 0 else 0.0

    def record_trade(self, result: TradeResult, signal: Signal):
        self.trades_today += 1
        self.total_spent_usdc += result.amount
        self.last_trade_time = datetime.now(timezone.utc).isoformat()
        self.trade_history.append({
            "time": self.last_trade_time,
            "side": result.side,
            "signal": signal.value,
            "price": result.price,
            "amount": result.amount,
            "order_id": result.order_id,
        })


class TradingBot:
    """Polymarket Bitcoin 5-minute prediction trading bot."""

    def __init__(
        self,
        polymarket_config: PolymarketConfig | None = None,
        trading_config: TradingConfig | None = None,
        strategy_config: StrategyConfig | None = None,
    ):
        self.trading_config = trading_config or load_trading_config()
        self.strategy_config = strategy_config or load_strategy_config()

        self.strategy = BTCStrategy(self.strategy_config)
        self.stats = BotStats(
            start_time=datetime.now(timezone.utc).isoformat()
        )

        if not self.trading_config.dry_run:
            pm_config = polymarket_config or load_polymarket_config()
            self.pm_client = PolymarketClient(pm_config)
        else:
            self.pm_client = None

        self._running = False

    def start(self):
        """Start the trading bot main loop."""
        self._running = True
        mode = "DRY RUN" if self.trading_config.dry_run else "LIVE"
        logger.info("=" * 60)
        logger.info("Polymarket BTC 5-Min Trading Bot - %s MODE", mode)
        logger.info("=" * 60)
        logger.info("Trade amount: $%.2f USDC", self.trading_config.trade_amount_usdc)
        logger.info("Max daily trades: %d", self.trading_config.max_daily_trades)
        logger.info("Max daily loss: $%.2f", self.trading_config.max_daily_loss_usdc)
        logger.info("Poll interval: %ds", self.trading_config.poll_interval_seconds)
        logger.info("Confidence threshold: %.2f", self.strategy_config.confidence_threshold)
        logger.info("=" * 60)

        while self._running:
            try:
                self._tick()
            except KeyboardInterrupt:
                logger.info("Bot stopped by user")
                break
            except Exception as e:
                logger.error("Error in bot loop: %s", e, exc_info=True)

            time.sleep(self.trading_config.poll_interval_seconds)

        self._print_summary()

    def stop(self):
        """Stop the bot."""
        self._running = False

    def _tick(self):
        """Execute one trading cycle."""
        logger.info("-" * 40)
        logger.info("Tick @ %s", datetime.now(timezone.utc).strftime("%H:%M:%S UTC"))

        # Check daily limits
        if self.stats.trades_today >= self.trading_config.max_daily_trades:
            logger.warning("Daily trade limit reached (%d)", self.stats.trades_today)
            return

        if self.stats.total_spent_usdc >= self.trading_config.max_daily_loss_usdc:
            logger.warning(
                "Daily loss limit approaching ($%.2f spent)",
                self.stats.total_spent_usdc,
            )

        # Fetch latest BTC prices
        if not self.strategy.fetch_recent_prices():
            logger.warning("Could not fetch BTC prices, skipping tick")
            return

        # Run analysis
        analysis = self.strategy.analyze()
        logger.info(
            "BTC: $%.2f | RSI: %.1f | Momentum: %.4f | Signal: %s (%.2f)",
            analysis.current_price,
            analysis.rsi,
            analysis.momentum,
            analysis.signal.value,
            analysis.confidence,
        )
        logger.info("Reason: %s", analysis.reason)

        if analysis.signal == Signal.HOLD:
            logger.info("Signal: HOLD - No trade this tick")
            return

        # Find active market
        market = self._find_market()
        if not market:
            logger.warning("No active BTC 5-min market found")
            return

        logger.info("Market: %s", market.question)

        # Execute trade
        self._execute_trade(market, analysis)

    def _find_market(self) -> Market | None:
        """Find the current active BTC 5-min market."""
        if self.trading_config.dry_run:
            # In dry run, return a mock market
            return Market(
                condition_id="mock",
                question="Will BTC go up in the next 5 minutes? (DRY RUN)",
                token_id_yes="mock_yes",
                token_id_no="mock_no",
                end_date=datetime.now(timezone.utc).isoformat(),
                active=True,
                best_ask_yes=0.50,
                best_ask_no=0.50,
            )

        return self.pm_client.find_current_btc_5min_market()

    def _execute_trade(self, market: Market, analysis):
        """Execute a trade based on the analysis signal."""
        amount = self.trading_config.trade_amount_usdc

        if self.trading_config.dry_run:
            result = self._simulate_trade(market, analysis, amount)
        else:
            result = self._live_trade(market, analysis, amount)

        if result and result.success:
            self.stats.record_trade(result, analysis.signal)
            logger.info(
                "TRADE #%d: %s @ $%.4f ($%.2f USDC) - %s",
                self.stats.trades_today,
                result.side,
                result.price,
                result.amount,
                result.message,
            )
        elif result:
            logger.warning("Trade failed: %s", result.message)

    def _simulate_trade(self, market: Market, analysis, amount: float) -> TradeResult:
        """Simulate a trade in dry run mode."""
        if analysis.signal == Signal.BUY_YES:
            price = market.best_ask_yes
            side = "YES"
        else:
            price = market.best_ask_no
            side = "NO"

        # Simulate price based on confidence
        price = max(0.01, min(0.99, 0.5 + (analysis.confidence * 0.1)))

        return TradeResult(
            success=True,
            order_id=f"dry_run_{int(time.time())}",
            side=side,
            price=price,
            amount=amount,
            message=f"[DRY RUN] Would buy {side} @ ${price:.4f}",
        )

    def _live_trade(self, market: Market, analysis, amount: float) -> TradeResult:
        """Execute a live trade on Polymarket."""
        yes_price, no_price = self.pm_client.get_best_prices(market)

        if analysis.signal == Signal.BUY_YES:
            logger.info("Buying YES (bullish) @ $%.4f", yes_price)
            return self.pm_client.buy_yes(market, amount, yes_price)
        else:
            logger.info("Buying NO (bearish) @ $%.4f", no_price)
            return self.pm_client.buy_no(market, amount, no_price)

    def _print_summary(self):
        """Print bot session summary."""
        logger.info("")
        logger.info("=" * 60)
        logger.info("SESSION SUMMARY")
        logger.info("=" * 60)
        logger.info("Total trades: %d", self.stats.trades_today)
        logger.info("Total spent: $%.2f USDC", self.stats.total_spent_usdc)
        logger.info("Started: %s", self.stats.start_time)
        if self.stats.last_trade_time:
            logger.info("Last trade: %s", self.stats.last_trade_time)

        if self.stats.trade_history:
            logger.info("")
            logger.info("Trade History:")
            for i, trade in enumerate(self.stats.trade_history, 1):
                logger.info(
                    "  #%d | %s | %s | $%.4f | $%.2f | %s",
                    i,
                    trade["time"][-8:],
                    trade["side"],
                    trade["price"],
                    trade["amount"],
                    trade["signal"],
                )
        logger.info("=" * 60)
