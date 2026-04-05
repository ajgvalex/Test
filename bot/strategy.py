"""Trading strategy for Bitcoin 5-minute prediction markets.

Uses 7 indicators with adaptive weights and regime detection:
1. RSI (with dead zone 40-60)
2. Momentum (rate of change)
3. SMA Crossover (5 vs 12)
4. Linear Regression prediction
5. Bollinger Band position (mean-reversion)
6. MACD Histogram (trend acceleration)
7. Micro-Trend (candle counting)
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass, field
from enum import Enum

import numpy as np
import requests

from config import StrategyConfig

logger = logging.getLogger(__name__)

BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines"
COINGECKO_BTC_URL = "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart"
LEARNING_FILE = os.path.join(os.path.dirname(__file__), "learning_data.json")

INDICATOR_NAMES = [
    "rsi", "momentum", "sma_cross", "regression",
    "bollinger", "macd", "microtrend",
]


class Signal(Enum):
    BUY_YES = "BUY_YES"
    BUY_NO = "BUY_NO"
    HOLD = "HOLD"


@dataclass
class AnalysisResult:
    signal: Signal
    confidence: float
    rsi: float
    momentum: float
    sma_short: float
    sma_long: float
    current_price: float
    predicted_price: float
    predicted_change_pct: float
    reason: str
    bollinger_position: float
    macd_histogram: float
    microtrend: float
    volatility_regime: str
    consensus: int
    signals_detail: dict


@dataclass
class PriceTracker:
    prices: list[float] = field(default_factory=list)
    timestamps: list[float] = field(default_factory=list)
    max_history: int = 200

    def add_price(self, price: float, timestamp: float | None = None):
        self.prices.append(price)
        self.timestamps.append(timestamp or time.time())
        if len(self.prices) > self.max_history:
            self.prices = self.prices[-self.max_history:]
            self.timestamps = self.timestamps[-self.max_history:]

    @property
    def has_enough_data(self) -> bool:
        return len(self.prices) >= 15


class AdaptiveWeights:
    """Learns from past predictions to adjust per-indicator weights."""

    def __init__(self):
        n = len(INDICATOR_NAMES)
        self.weights = {name: 1.0 / n for name in INDICATOR_NAMES}
        self.learning_rate = 0.03
        self.history: list[dict] = []
        self.total_predictions = 0
        self.correct_predictions = 0
        self._load()

    def _load(self):
        if not os.path.exists(LEARNING_FILE):
            return
        try:
            with open(LEARNING_FILE, "r") as f:
                data = json.load(f)

            # Load weights (handle old 3-weight format)
            saved_weights = data.get("weights")
            if isinstance(saved_weights, dict):
                for name in INDICATOR_NAMES:
                    if name in saved_weights:
                        self.weights[name] = saved_weights[name]
            elif "w_rsi" in data:
                # Old format backward compat
                self.weights["rsi"] = data.get("w_rsi", 0.143)
                self.weights["momentum"] = data.get("w_momentum", 0.143)
                self.weights["sma_cross"] = data.get("w_sma", 0.143)
                self._normalize()

            self.history = data.get("history", [])
            self.total_predictions = data.get("total_predictions", 0)
            self.correct_predictions = data.get("correct_predictions", 0)
            logger.info(
                "Loaded: %d predictions, %.1f%% accuracy",
                self.total_predictions, self.accuracy * 100,
            )
        except Exception as e:
            logger.warning("Could not load learning data: %s", e)

    def _save(self):
        try:
            data = {
                "weights": self.weights,
                "total_predictions": self.total_predictions,
                "correct_predictions": self.correct_predictions,
                "history": self.history[-100:],
            }
            with open(LEARNING_FILE, "w") as f:
                json.dump(data, f, indent=2, default=_json_default)
        except Exception as e:
            logger.warning("Could not save learning data: %s", e)

    def _normalize(self):
        for name in INDICATOR_NAMES:
            self.weights[name] = max(0.02, min(0.35, self.weights[name]))
        total = sum(self.weights.values())
        for name in INDICATOR_NAMES:
            self.weights[name] /= total

    @property
    def accuracy(self) -> float:
        if self.total_predictions == 0:
            return 0.0
        return self.correct_predictions / self.total_predictions

    def record_prediction(self, signal: str, predicted_price: float,
                          price_at_prediction: float, signals: dict):
        self.history.append({
            "signal": signal,
            "predicted_price": predicted_price,
            "price_at_prediction": price_at_prediction,
            "signals": signals,
            "actual_price": None,
            "was_correct": None,
            "timestamp": time.time(),
        })
        self._save()

    def learn_from_outcome(self, actual_price: float):
        pending = None
        for record in reversed(self.history):
            if record.get("was_correct") is None:
                pending = record
                break

        if pending is None:
            return None

        pending["actual_price"] = actual_price
        prev_price = pending["price_at_prediction"]
        predicted_signal = pending["signal"]

        actual_went_up = actual_price > prev_price
        actual_direction = "SUBIO" if actual_went_up else "BAJO" if actual_price < prev_price else "IGUAL"

        if predicted_signal == "BUY_YES":
            predicted_direction = "ALZA"
            was_correct = actual_went_up
        else:
            predicted_direction = "BAJA"
            was_correct = not actual_went_up

        if actual_price == prev_price:
            was_correct = False

        # Fix numpy.bool_ serialization
        was_correct = bool(was_correct)

        pending["was_correct"] = was_correct
        self.total_predictions += 1
        if was_correct:
            self.correct_predictions += 1

        self._adjust_weights(pending, was_correct)
        self._save()

        return {
            "was_correct": was_correct,
            "predicted_direction": predicted_direction,
            "actual_direction": actual_direction,
            "prev_price": prev_price,
            "actual_price": actual_price,
            "price_diff": actual_price - prev_price,
        }

    def _adjust_weights(self, record: dict, was_correct: bool):
        signals = record.get("signals", {})
        direction = 1.0 if record["signal"] == "BUY_YES" else -1.0
        lr = self.learning_rate

        for name in INDICATOR_NAMES:
            sig = signals.get(name, 0.0)
            if abs(sig) < 0.1:
                continue  # Weak signals don't participate in learning

            agreed = (sig * direction) > 0

            if was_correct and agreed:
                self.weights[name] += lr
            elif was_correct and not agreed:
                self.weights[name] -= lr * 0.5
            elif not was_correct and agreed:
                self.weights[name] -= lr
            elif not was_correct and not agreed:
                self.weights[name] += lr * 0.5

        self._normalize()


def _json_default(obj):
    """Handle numpy types for JSON serialization."""
    if isinstance(obj, (np.bool_, np.integer)):
        return int(obj)
    if isinstance(obj, np.floating):
        return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


class BTCStrategy:
    """Bitcoin 5-minute prediction strategy with 7 indicators."""

    def __init__(self, config: StrategyConfig):
        self.config = config
        self.tracker = PriceTracker()
        self.weights = AdaptiveWeights()

    # --- Data fetching ---

    def fetch_recent_prices(self) -> bool:
        if self._fetch_from_binance():
            return True
        logger.warning("Binance failed, trying CoinGecko...")
        if self._fetch_from_coingecko():
            return True
        logger.warning("All price sources failed")
        return False

    def _fetch_from_binance(self) -> bool:
        try:
            resp = requests.get(
                BINANCE_KLINES_URL,
                params={"symbol": "BTCUSDT", "interval": "1m", "limit": 60},
                timeout=10,
            )
            resp.raise_for_status()
            self.tracker = PriceTracker()
            for kline in resp.json():
                self.tracker.add_price(float(kline[4]), float(kline[6]) / 1000)
            logger.info("Binance: %d precios. BTC: $%.2f",
                        len(self.tracker.prices), self.tracker.prices[-1])
            return True
        except Exception as e:
            logger.error("Binance error: %s", e)
            return False

    def _fetch_from_coingecko(self) -> bool:
        try:
            resp = requests.get(
                COINGECKO_BTC_URL,
                params={"vs_currency": "usd", "days": "1"},
                timeout=15,
            )
            resp.raise_for_status()
            points = resp.json().get("prices", [])
            if not points:
                return False
            self.tracker = PriceTracker()
            for ts_ms, price in points[-60:]:
                self.tracker.add_price(price, ts_ms / 1000)
            logger.info("CoinGecko: %d precios. BTC: $%.2f",
                        len(self.tracker.prices), self.tracker.prices[-1])
            return True
        except Exception as e:
            logger.error("CoinGecko error: %s", e)
            return False

    def add_manual_price(self, price: float):
        self.tracker.add_price(price)

    def learn(self, actual_price: float):
        return self.weights.learn_from_outcome(actual_price)

    # --- Main analysis ---

    def analyze(self) -> AnalysisResult:
        if not self.tracker.has_enough_data:
            return AnalysisResult(
                signal=Signal.HOLD, confidence=0.0, rsi=50.0, momentum=0.0,
                sma_short=0.0, sma_long=0.0, current_price=0.0,
                predicted_price=0.0, predicted_change_pct=0.0,
                reason="Datos insuficientes", bollinger_position=0.5,
                macd_histogram=0.0, microtrend=0.0,
                volatility_regime="unknown", consensus=0, signals_detail={},
            )

        prices = np.array(self.tracker.prices)
        current_price = float(prices[-1])

        # Compute all 7 indicator signals [-1.0 to +1.0]
        signals = {
            "rsi": self._rsi_signal(prices),
            "momentum": self._momentum_signal(prices),
            "sma_cross": self._sma_crossover_signal(prices),
            "regression": self._regression_signal(prices),
            "bollinger": self._bollinger_signal(prices),
            "macd": self._macd_signal(prices),
            "microtrend": self._microtrend_signal(prices),
        }

        # Regime detection
        volatility = self._recent_volatility(prices)
        if volatility > self.config.volatility_threshold:
            regime = "trending"
            regime_boost = {
                "rsi": 0.7, "momentum": 1.3, "sma_cross": 1.0,
                "regression": 1.1, "bollinger": 0.7, "macd": 1.3,
                "microtrend": 1.2,
            }
        else:
            regime = "ranging"
            regime_boost = {
                "rsi": 1.3, "momentum": 0.8, "sma_cross": 1.0,
                "regression": 1.0, "bollinger": 1.3, "macd": 0.8,
                "microtrend": 0.9,
            }

        # Weighted score with regime adjustment
        score = 0.0
        for name in INDICATOR_NAMES:
            score += self.weights.weights[name] * signals[name] * regime_boost[name]

        # Consensus: how many indicators agree
        bullish = sum(1 for s in signals.values() if s > 0.1)
        bearish = sum(1 for s in signals.values() if s < -0.1)
        consensus = max(bullish, bearish)

        # Trend consensus override: if 4+ trend indicators agree AND the fast
        # indicators (momentum, microtrend) confirm, flip the score.
        # This prevents mean-reversion from overriding sustained moves
        # while avoiding false flips during trend transitions.
        trend_indicators = ["momentum", "sma_cross", "macd", "microtrend", "regression"]
        trend_bullish = sum(1 for n in trend_indicators if signals[n] > 0.1)
        trend_bearish = sum(1 for n in trend_indicators if signals[n] < -0.1)

        # Fast confirmation: momentum and microtrend must agree
        fast_bearish = signals["momentum"] < -0.05 or signals["microtrend"] < -0.15
        fast_bullish = signals["momentum"] > 0.05 or signals["microtrend"] > 0.15

        if trend_bearish >= 4 and fast_bearish and score > 0:
            score = -abs(score)
        elif trend_bullish >= 4 and fast_bullish and score < 0:
            score = abs(score)

        # Confidence: scale up and boost when consensus is strong
        confidence = min(abs(score) * 2.5, 1.0)
        if consensus >= 5:
            confidence = max(confidence, 0.6)
        elif consensus >= 4:
            confidence = max(confidence, 0.4)

        # Always pick a direction
        signal = Signal.BUY_YES if score >= 0 else Signal.BUY_NO

        # Compute display values
        rsi = self._calculate_rsi(prices)
        sma_short = self._calculate_sma(prices, 5)
        sma_long = self._calculate_sma(prices, min(12, len(prices)))
        predicted_price = self._predict_next_price(prices)
        predicted_change_pct = ((predicted_price - current_price) / current_price) * 100
        momentum_val = self._calculate_momentum(prices)
        boll_pos = self._bollinger_position(prices)
        macd_hist = self._macd_histogram_value(prices)
        micro = self._microtrend_ratio(prices)

        # Build reason string
        reasons = []
        for name, sig in signals.items():
            if abs(sig) > 0.1:
                direction = "alcista" if sig > 0 else "bajista"
                reasons.append(f"{name}({sig:+.2f} {direction})")
        reasons.append(f"regimen:{regime}")

        # Record for learning
        self.weights.record_prediction(
            signal=signal.value,
            predicted_price=predicted_price,
            price_at_prediction=current_price,
            signals=signals,
        )

        return AnalysisResult(
            signal=signal,
            confidence=confidence,
            rsi=rsi,
            momentum=momentum_val,
            sma_short=sma_short,
            sma_long=sma_long,
            current_price=current_price,
            predicted_price=predicted_price,
            predicted_change_pct=predicted_change_pct,
            reason=" | ".join(reasons),
            bollinger_position=boll_pos,
            macd_histogram=macd_hist,
            microtrend=micro,
            volatility_regime=regime,
            consensus=consensus,
            signals_detail=signals,
        )

    # --- 7 Indicator signals (each returns -1.0 to +1.0) ---

    def _rsi_signal(self, prices: np.ndarray) -> float:
        rsi = self._calculate_rsi(prices)
        if rsi < self.config.rsi_oversold:  # < 30
            return 0.6   # Moderate bullish (not max - could be strong downtrend)
        elif rsi < self.config.rsi_mild_oversold:  # 30-40
            return 0.2   # Mild bullish hint
        elif rsi > self.config.rsi_overbought:  # > 70
            return -0.6  # Moderate bearish
        elif rsi > self.config.rsi_mild_overbought:  # 60-70
            return -0.2  # Mild bearish hint
        else:
            return 0.0   # Dead zone: 40-60

    def _momentum_signal(self, prices: np.ndarray) -> float:
        mom = self._calculate_momentum(prices)
        # Scale: 0.1% change over window = 0.2 signal, 0.5% = full signal
        return float(np.clip(mom * 200, -1.0, 1.0))

    def _sma_crossover_signal(self, prices: np.ndarray) -> float:
        sma_fast = self._calculate_sma(prices, 5)
        sma_slow = self._calculate_sma(prices, min(12, len(prices)))
        diff_pct = (sma_fast - sma_slow) / sma_slow * 100
        return float(np.clip(diff_pct * 5, -1.0, 1.0))

    def _regression_signal(self, prices: np.ndarray) -> float:
        predicted = self._predict_next_price(prices)
        change_pct = (predicted - prices[-1]) / prices[-1] * 100
        return float(np.clip(change_pct * 10, -1.0, 1.0))

    def _bollinger_signal(self, prices: np.ndarray) -> float:
        position = self._bollinger_position(prices)
        # Only signal at real extremes, and cap at 0.5 to prevent domination
        if position > 0.85:
            return float(np.clip(-(position - 0.85) * 6.67, -0.5, 0.0))  # max -0.5
        elif position < 0.15:
            return float(np.clip((0.15 - position) * 6.67, 0.0, 0.5))   # max +0.5
        else:
            return 0.0  # No signal in the middle 70%

    def _macd_signal(self, prices: np.ndarray) -> float:
        hist = self._macd_histogram_value(prices)
        norm = hist / float(prices[-1]) * 10000  # basis points
        return float(np.clip(norm, -1.0, 1.0))

    def _microtrend_signal(self, prices: np.ndarray) -> float:
        return self._microtrend_ratio(prices)

    # --- Raw indicator calculations ---

    def _calculate_rsi(self, prices: np.ndarray) -> float:
        period = min(self.config.rsi_period, len(prices) - 1)
        deltas = np.diff(prices[-period - 1:])
        gains = np.where(deltas > 0, deltas, 0)
        losses = np.where(deltas < 0, -deltas, 0)
        avg_gain = float(np.mean(gains)) if len(gains) > 0 else 0.0
        avg_loss = float(np.mean(losses)) if len(losses) > 0 else 0.0
        if avg_loss == 0:
            return 100.0
        rs = avg_gain / avg_loss
        return 100.0 - (100.0 / (1.0 + rs))

    def _calculate_momentum(self, prices: np.ndarray) -> float:
        window = min(self.config.momentum_window, len(prices) - 1)
        if window <= 0:
            return 0.0
        return float((prices[-1] - prices[-window - 1]) / prices[-window - 1])

    def _calculate_sma(self, prices: np.ndarray, period: int) -> float:
        period = min(period, len(prices))
        return float(np.mean(prices[-period:]))

    def _predict_next_price(self, prices: np.ndarray) -> float:
        n = min(30, len(prices))
        recent = prices[-n:]
        x = np.arange(n, dtype=float)
        decay = 0.92
        w = np.array([decay ** (n - 1 - i) for i in range(n)])
        w_sum = np.sum(w)
        wx_mean = np.sum(w * x) / w_sum
        wy_mean = np.sum(w * recent) / w_sum
        num = np.sum(w * (x - wx_mean) * (recent - wy_mean))
        den = np.sum(w * (x - wx_mean) ** 2)
        if den == 0:
            return float(recent[-1])
        slope = num / den
        predicted = slope * (n - 1 + 5) + (wy_mean - slope * wx_mean)
        max_change = float(recent[-1]) * 0.005
        return float(np.clip(predicted, recent[-1] - max_change, recent[-1] + max_change))

    def _bollinger_position(self, prices: np.ndarray) -> float:
        period = min(self.config.bollinger_period, len(prices))
        window = prices[-period:]
        sma = float(np.mean(window))
        std = float(np.std(window))
        if std == 0:
            return 0.5
        upper = sma + 2 * std
        lower = sma - 2 * std
        position = (float(prices[-1]) - lower) / (upper - lower)
        return float(np.clip(position, 0.0, 1.0))

    def _macd_histogram_value(self, prices: np.ndarray) -> float:
        if len(prices) < self.config.macd_slow:
            return 0.0
        ema_fast = self._ema_series(prices, self.config.macd_fast)
        ema_slow = self._ema_series(prices, self.config.macd_slow)
        macd_line = ema_fast - ema_slow
        signal_line = self._ema_series(macd_line, self.config.macd_signal_period)
        return float(macd_line[-1] - signal_line[-1])

    def _microtrend_ratio(self, prices: np.ndarray) -> float:
        n = min(self.config.microtrend_window, len(prices) - 1)
        if n < 3:
            return 0.0
        diffs = np.diff(prices[-n - 1:])
        up = int(np.sum(diffs > 0))
        down = int(np.sum(diffs < 0))
        total = up + down
        if total == 0:
            return 0.0
        return float((up - down) / total)

    def _recent_volatility(self, prices: np.ndarray) -> float:
        n = min(10, len(prices) - 1)
        if n < 3:
            return 0.001
        returns = np.diff(prices[-n - 1:]) / prices[-n - 1:-1]
        return float(np.std(returns))

    def _ema_series(self, data: np.ndarray, period: int) -> np.ndarray:
        alpha = 2.0 / (period + 1)
        result = np.empty(len(data), dtype=float)
        result[0] = float(data[0])
        for i in range(1, len(data)):
            result[i] = alpha * float(data[i]) + (1 - alpha) * result[i - 1]
        return result
