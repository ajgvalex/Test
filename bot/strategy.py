"""Trading strategy for Bitcoin 5-minute prediction markets.

Uses a combination of:
- RSI (Relative Strength Index) for overbought/oversold signals
- Price momentum (rate of change over recent candles)
- Simple moving average crossover

The strategy produces a signal: BUY_YES (bullish), BUY_NO (bearish), or HOLD.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from enum import Enum

import numpy as np
import requests

from config import StrategyConfig

logger = logging.getLogger(__name__)

COINGECKO_BTC_URL = "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart"
BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines"


class Signal(Enum):
    BUY_YES = "BUY_YES"  # Bullish - BTC going up
    BUY_NO = "BUY_NO"    # Bearish - BTC going down
    HOLD = "HOLD"         # No clear signal


@dataclass
class AnalysisResult:
    signal: Signal
    confidence: float  # 0.0 to 1.0
    rsi: float
    momentum: float
    sma_short: float
    sma_long: float
    current_price: float
    reason: str


@dataclass
class PriceTracker:
    """Tracks BTC prices for strategy calculations."""

    prices: list[float] = field(default_factory=list)
    timestamps: list[float] = field(default_factory=list)
    max_history: int = 100

    def add_price(self, price: float, timestamp: float | None = None):
        self.prices.append(price)
        self.timestamps.append(timestamp or time.time())
        if len(self.prices) > self.max_history:
            self.prices = self.prices[-self.max_history:]
            self.timestamps = self.timestamps[-self.max_history:]

    @property
    def has_enough_data(self) -> bool:
        return len(self.prices) >= 15


class BTCStrategy:
    """Bitcoin price analysis strategy for 5-minute markets."""

    def __init__(self, config: StrategyConfig):
        self.config = config
        self.tracker = PriceTracker()

    def fetch_recent_prices(self) -> bool:
        """Fetch recent BTC prices from Binance (1-min candles)."""
        try:
            resp = requests.get(
                BINANCE_KLINES_URL,
                params={
                    "symbol": "BTCUSDT",
                    "interval": "1m",
                    "limit": 60,
                },
                timeout=10,
            )
            resp.raise_for_status()
            klines = resp.json()

            self.tracker = PriceTracker()
            for kline in klines:
                close_price = float(kline[4])
                close_time = float(kline[6]) / 1000
                self.tracker.add_price(close_price, close_time)

            logger.info(
                "Fetched %d price points. Current BTC: $%.2f",
                len(self.tracker.prices),
                self.tracker.prices[-1] if self.tracker.prices else 0,
            )
            return True

        except Exception as e:
            logger.error("Error fetching BTC prices: %s", e)
            return False

    def add_manual_price(self, price: float):
        """Add a manually entered price to the tracker."""
        self.tracker.add_price(price)

    def analyze(self) -> AnalysisResult:
        """Run full analysis and produce a trading signal."""
        if not self.tracker.has_enough_data:
            return AnalysisResult(
                signal=Signal.HOLD,
                confidence=0.0,
                rsi=50.0,
                momentum=0.0,
                sma_short=0.0,
                sma_long=0.0,
                current_price=0.0,
                reason="Insufficient price data",
            )

        prices = np.array(self.tracker.prices)
        current_price = prices[-1]

        rsi = self._calculate_rsi(prices)
        momentum = self._calculate_momentum(prices)
        sma_short = self._calculate_sma(prices, 5)
        sma_long = self._calculate_sma(prices, 20)

        # Score from -1 (bearish) to +1 (bullish)
        score = 0.0
        reasons = []

        # RSI signal (weight: 0.35)
        if rsi < self.config.rsi_oversold:
            rsi_signal = 0.35
            reasons.append(f"RSI oversold ({rsi:.1f})")
        elif rsi > self.config.rsi_overbought:
            rsi_signal = -0.35
            reasons.append(f"RSI overbought ({rsi:.1f})")
        else:
            # Linear interpolation between oversold and overbought
            rsi_normalized = (rsi - 50) / 20
            rsi_signal = -rsi_normalized * 0.15
            reasons.append(f"RSI neutral ({rsi:.1f})")
        score += rsi_signal

        # Momentum signal (weight: 0.35)
        momentum_signal = np.clip(momentum * 10, -0.35, 0.35)
        score += momentum_signal
        if momentum > 0:
            reasons.append(f"Positive momentum ({momentum:.4f})")
        else:
            reasons.append(f"Negative momentum ({momentum:.4f})")

        # SMA crossover signal (weight: 0.30)
        if sma_short > sma_long:
            sma_signal = 0.30 * min((sma_short - sma_long) / sma_long * 100, 1.0)
            reasons.append("SMA bullish crossover")
        else:
            sma_signal = -0.30 * min((sma_long - sma_short) / sma_long * 100, 1.0)
            reasons.append("SMA bearish crossover")
        score += sma_signal

        # Convert score to signal
        confidence = abs(score)

        if score > 0 and confidence >= self.config.confidence_threshold:
            signal = Signal.BUY_YES
        elif score < 0 and confidence >= self.config.confidence_threshold:
            signal = Signal.BUY_NO
        else:
            signal = Signal.HOLD

        reason = " | ".join(reasons)

        return AnalysisResult(
            signal=signal,
            confidence=confidence,
            rsi=rsi,
            momentum=momentum,
            sma_short=sma_short,
            sma_long=sma_long,
            current_price=current_price,
            reason=reason,
        )

    def _calculate_rsi(self, prices: np.ndarray) -> float:
        """Calculate RSI (Relative Strength Index)."""
        period = min(self.config.rsi_period, len(prices) - 1)
        deltas = np.diff(prices[-period - 1:])

        gains = np.where(deltas > 0, deltas, 0)
        losses = np.where(deltas < 0, -deltas, 0)

        avg_gain = np.mean(gains) if len(gains) > 0 else 0
        avg_loss = np.mean(losses) if len(losses) > 0 else 0

        if avg_loss == 0:
            return 100.0
        rs = avg_gain / avg_loss
        return 100.0 - (100.0 / (1.0 + rs))

    def _calculate_momentum(self, prices: np.ndarray) -> float:
        """Calculate price momentum (rate of change)."""
        window = min(self.config.momentum_window, len(prices) - 1)
        if window <= 0:
            return 0.0
        return (prices[-1] - prices[-window - 1]) / prices[-window - 1]

    def _calculate_sma(self, prices: np.ndarray, period: int) -> float:
        """Calculate Simple Moving Average."""
        period = min(period, len(prices))
        return float(np.mean(prices[-period:]))
