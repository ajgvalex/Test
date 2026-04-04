"""Trading strategy for Bitcoin 5-minute prediction markets.

Uses a combination of:
- RSI (Relative Strength Index) for overbought/oversold signals
- Price momentum (rate of change over recent candles)
- Simple moving average crossover
- Weighted linear regression for price prediction

The strategy produces a signal: BUY_YES (bullish), BUY_NO (bearish), or HOLD.
It learns from past predictions and adjusts indicator weights over time.
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
LEARNING_FILE = os.path.join(os.path.dirname(__file__), "learning_data.json")


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
    predicted_price: float
    predicted_change_pct: float
    reason: str


@dataclass
class PriceTracker:
    """Tracks BTC prices for strategy calculations."""

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


@dataclass
class PredictionRecord:
    """A past prediction and its outcome."""
    predicted_signal: str
    predicted_price: float
    actual_price: float | None
    price_at_prediction: float
    rsi_signal: float
    momentum_signal: float
    sma_signal: float
    was_correct: bool | None


class AdaptiveWeights:
    """Learns from past predictions to adjust indicator weights."""

    def __init__(self):
        self.w_rsi = 0.35
        self.w_momentum = 0.35
        self.w_sma = 0.30
        self.learning_rate = 0.02
        self.history: list[dict] = []
        self.total_predictions = 0
        self.correct_predictions = 0
        self._load()

    def _load(self):
        """Load learning data from disk."""
        if os.path.exists(LEARNING_FILE):
            try:
                with open(LEARNING_FILE, "r") as f:
                    data = json.load(f)
                self.w_rsi = data.get("w_rsi", 0.35)
                self.w_momentum = data.get("w_momentum", 0.35)
                self.w_sma = data.get("w_sma", 0.30)
                self.history = data.get("history", [])
                self.total_predictions = data.get("total_predictions", 0)
                self.correct_predictions = data.get("correct_predictions", 0)
                logger.info(
                    "Loaded learning data: %d predictions, %.1f%% accuracy, "
                    "weights=[RSI:%.3f, MOM:%.3f, SMA:%.3f]",
                    self.total_predictions,
                    self.accuracy * 100,
                    self.w_rsi, self.w_momentum, self.w_sma,
                )
            except Exception as e:
                logger.warning("Could not load learning data: %s", e)

    def _save(self):
        """Persist learning data to disk."""
        try:
            data = {
                "w_rsi": self.w_rsi,
                "w_momentum": self.w_momentum,
                "w_sma": self.w_sma,
                "total_predictions": self.total_predictions,
                "correct_predictions": self.correct_predictions,
                "history": self.history[-100:],  # Keep last 100
            }
            with open(LEARNING_FILE, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.warning("Could not save learning data: %s", e)

    @property
    def accuracy(self) -> float:
        if self.total_predictions == 0:
            return 0.0
        return self.correct_predictions / self.total_predictions

    def record_prediction(self, signal: str, predicted_price: float,
                          price_at_prediction: float,
                          rsi_signal: float, momentum_signal: float,
                          sma_signal: float):
        """Record a new prediction (outcome unknown yet)."""
        self.history.append({
            "signal": signal,
            "predicted_price": predicted_price,
            "price_at_prediction": price_at_prediction,
            "rsi_signal": rsi_signal,
            "momentum_signal": momentum_signal,
            "sma_signal": sma_signal,
            "actual_price": None,
            "was_correct": None,
            "timestamp": time.time(),
        })
        self._save()

    def learn_from_outcome(self, actual_price: float):
        """When the user enters a new price, evaluate the last prediction."""
        # Find the most recent unresolved prediction
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

        # Did the price actually go up or down?
        actual_went_up = actual_price > prev_price

        if predicted_signal == "BUY_YES":
            was_correct = actual_went_up
        elif predicted_signal == "BUY_NO":
            was_correct = not actual_went_up
        else:
            # HOLD - don't count
            pending["was_correct"] = None
            self._save()
            return None

        pending["was_correct"] = was_correct
        self.total_predictions += 1

        if was_correct:
            self.correct_predictions += 1

        # Adjust weights based on which indicators were right
        self._adjust_weights(pending, was_correct)
        self._save()

        return was_correct

    def _adjust_weights(self, record: dict, was_correct: bool):
        """Reward indicators that contributed to correct predictions,
        penalize those that contributed to wrong ones."""
        rsi_sig = record["rsi_signal"]
        mom_sig = record["momentum_signal"]
        sma_sig = record["sma_signal"]

        # The predicted direction (+1 for ALZA, -1 for BAJA)
        direction = 1.0 if record["signal"] == "BUY_YES" else -1.0

        # Check if each indicator agreed with the final prediction direction
        rsi_agreed = (rsi_sig * direction) > 0
        mom_agreed = (mom_sig * direction) > 0
        sma_agreed = (sma_sig * direction) > 0

        lr = self.learning_rate

        if was_correct:
            # Reward indicators that agreed with the correct prediction
            if rsi_agreed:
                self.w_rsi += lr
            if mom_agreed:
                self.w_momentum += lr
            if sma_agreed:
                self.w_sma += lr
        else:
            # Penalize indicators that agreed with the wrong prediction
            if rsi_agreed:
                self.w_rsi -= lr
            if mom_agreed:
                self.w_momentum -= lr
            if sma_agreed:
                self.w_sma -= lr

        # Clamp to minimum 0.05 and normalize to sum = 1.0
        self.w_rsi = max(0.05, self.w_rsi)
        self.w_momentum = max(0.05, self.w_momentum)
        self.w_sma = max(0.05, self.w_sma)

        total = self.w_rsi + self.w_momentum + self.w_sma
        self.w_rsi /= total
        self.w_momentum /= total
        self.w_sma /= total


class BTCStrategy:
    """Bitcoin price analysis strategy for 5-minute markets."""

    def __init__(self, config: StrategyConfig):
        self.config = config
        self.tracker = PriceTracker()
        self.weights = AdaptiveWeights()

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

    def learn(self, actual_price: float) -> bool | None:
        """Learn from an actual outcome. Returns True/False/None."""
        return self.weights.learn_from_outcome(actual_price)

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
                predicted_price=0.0,
                predicted_change_pct=0.0,
                reason="Datos insuficientes",
            )

        prices = np.array(self.tracker.prices)
        current_price = float(prices[-1])

        rsi = self._calculate_rsi(prices)
        momentum = self._calculate_momentum(prices)
        sma_short = self._calculate_sma(prices, 5)
        sma_long = self._calculate_sma(prices, 20)
        predicted_price = self._predict_next_price(prices)
        predicted_change_pct = ((predicted_price - current_price) / current_price) * 100

        # Use adaptive weights
        w_rsi = self.weights.w_rsi
        w_mom = self.weights.w_momentum
        w_sma = self.weights.w_sma

        score = 0.0
        reasons = []

        # RSI signal
        if rsi < self.config.rsi_oversold:
            rsi_signal = w_rsi
            reasons.append(f"RSI sobreventa ({rsi:.1f})")
        elif rsi > self.config.rsi_overbought:
            rsi_signal = -w_rsi
            reasons.append(f"RSI sobrecompra ({rsi:.1f})")
        else:
            rsi_normalized = (rsi - 50) / 20
            rsi_signal = -rsi_normalized * (w_rsi * 0.4)
            reasons.append(f"RSI neutral ({rsi:.1f})")
        score += rsi_signal

        # Momentum signal
        momentum_signal = float(np.clip(momentum * 10, -w_mom, w_mom))
        score += momentum_signal
        if momentum > 0:
            reasons.append(f"Momentum positivo ({momentum:+.4f})")
        else:
            reasons.append(f"Momentum negativo ({momentum:+.4f})")

        # SMA crossover signal
        if sma_short > sma_long:
            sma_signal = w_sma * min((sma_short - sma_long) / sma_long * 100, 1.0)
            reasons.append("SMA cruce alcista")
        else:
            sma_signal = -w_sma * min((sma_long - sma_short) / sma_long * 100, 1.0)
            reasons.append("SMA cruce bajista")
        score += sma_signal

        # Price prediction adds a small bias
        pred_signal = 0.0
        if abs(predicted_change_pct) > 0.01:
            pred_signal = float(np.clip(predicted_change_pct * 0.5, -0.15, 0.15))
            score += pred_signal
            if predicted_change_pct > 0:
                reasons.append(f"Pred. precio alcista ({predicted_change_pct:+.3f}%)")
            else:
                reasons.append(f"Pred. precio bajista ({predicted_change_pct:+.3f}%)")

        confidence = min(abs(score), 1.0)

        if score > 0 and confidence >= self.config.confidence_threshold:
            signal = Signal.BUY_YES
        elif score < 0 and confidence >= self.config.confidence_threshold:
            signal = Signal.BUY_NO
        else:
            signal = Signal.HOLD

        reason = " | ".join(reasons)

        # Record this prediction for learning
        self.weights.record_prediction(
            signal=signal.value,
            predicted_price=predicted_price,
            price_at_prediction=current_price,
            rsi_signal=rsi_signal,
            momentum_signal=momentum_signal,
            sma_signal=sma_signal,
        )

        return AnalysisResult(
            signal=signal,
            confidence=confidence,
            rsi=rsi,
            momentum=momentum,
            sma_short=sma_short,
            sma_long=sma_long,
            current_price=current_price,
            predicted_price=predicted_price,
            predicted_change_pct=predicted_change_pct,
            reason=reason,
        )

    def _predict_next_price(self, prices: np.ndarray) -> float:
        """Predict the next 5-min close price using weighted linear regression.

        Uses exponentially weighted recent prices to fit a trend line,
        then extrapolates 5 minutes forward.
        """
        n = min(30, len(prices))
        recent = prices[-n:]
        x = np.arange(n, dtype=float)

        # Exponential weights: more recent prices count more
        decay = 0.92
        weights = np.array([decay ** (n - 1 - i) for i in range(n)])

        # Weighted linear regression
        w_sum = np.sum(weights)
        wx_mean = np.sum(weights * x) / w_sum
        wy_mean = np.sum(weights * recent) / w_sum

        numerator = np.sum(weights * (x - wx_mean) * (recent - wy_mean))
        denominator = np.sum(weights * (x - wx_mean) ** 2)

        if denominator == 0:
            return float(recent[-1])

        slope = numerator / denominator
        intercept = wy_mean - slope * wx_mean

        # Extrapolate 5 steps ahead (5 min = 5 x 1-min candles)
        predicted = slope * (n - 1 + 5) + intercept

        # Dampen extreme predictions (max 0.5% change)
        max_change = recent[-1] * 0.005
        predicted = float(np.clip(predicted, recent[-1] - max_change, recent[-1] + max_change))

        return predicted

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
        return float((prices[-1] - prices[-window - 1]) / prices[-window - 1])

    def _calculate_sma(self, prices: np.ndarray, period: int) -> float:
        """Calculate Simple Moving Average."""
        period = min(period, len(prices))
        return float(np.mean(prices[-period:]))
