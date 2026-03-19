// ============================================================================
// Polymarket Trading Strategies
// ============================================================================

import type {
  PolymarketMarket,
  OrderBook,
  TradeExecution,
} from "@/types/polymarket";

// ============================================================================
// Math Utilities
// ============================================================================

/** Calculate the arithmetic mean of a number array. */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Calculate the standard deviation of a number array. */
function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1));
}

/** Simple Moving Average over the last `period` entries. */
function sma(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const window = values.slice(-period);
  return mean(window);
}

/** Exponential Moving Average. */
function ema(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let result = values[0];
  for (let i = 1; i < values.length; i++) {
    result = values[i] * k + result * (1 - k);
  }
  return result;
}

/** Calculate the z-score of the latest value relative to the series. */
function zScore(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const std = standardDeviation(values);
  if (std === 0) return 0;
  return (values[values.length - 1] - avg) / std;
}

/**
 * Compute Bollinger Bands for the given price series.
 * Returns { upper, middle, lower } for the most recent point.
 */
function bollingerBands(
  values: number[],
  period: number,
  numStdDev: number,
): { upper: number; middle: number; lower: number } {
  const window = values.slice(-period);
  const middle = mean(window);
  const std = standardDeviation(window);
  return {
    upper: middle + numStdDev * std,
    middle,
    lower: middle - numStdDev * std,
  };
}

/** Annualized volatility from a price series (simple returns). */
function volatility(prices: number[]): number {
  if (prices.length < 2) return 0;
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] !== 0) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
  }
  return standardDeviation(returns);
}

// ============================================================================
// Types
// ============================================================================

/** A price point in a historical series. */
export interface PricePoint {
  timestamp: number;
  price: number;
  volume: number;
}

/** The signal produced by a strategy after analysis. */
export interface Signal {
  action: "buy" | "sell" | "hold";
  tokenId: string;
  confidence: number;
  size: number;
  price: number;
  reason: string;
}

/** Represents an open position. */
export interface Position {
  tokenId: string;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  timestamp: number;
}

/** A recorded trade in the strategy's history. */
export interface TradeRecord {
  tokenId: string;
  action: "buy" | "sell";
  size: number;
  price: number;
  timestamp: number;
  reason: string;
  pnl?: number;
}

/** Base configuration shared by all strategies. */
export interface StrategyConfig {
  maxPositionSize: number;
  maxTotalExposure: number;
  riskPerTrade: number; // fraction of capital to risk per trade (0-1)
  defaultConfidenceThreshold: number;
}

/** Configuration for market-making strategy. */
export interface MarketMakingConfig extends StrategyConfig {
  baseSpread: number; // e.g. 0.02 for 2%
  volatilityMultiplier: number;
  inventoryLimit: number;
  staleOrderThresholdMs: number;
  minEdge: number;
}

/** Configuration for momentum strategy. */
export interface MomentumConfig extends StrategyConfig {
  lookbackPeriod: number;
  momentumThreshold: number;
  fastMaPeriod: number;
  slowMaPeriod: number;
  volumeConfirmationMultiplier: number;
}

/** Configuration for mean-reversion strategy. */
export interface MeanReversionConfig extends StrategyConfig {
  bollingerPeriod: number;
  bollingerStdDev: number;
  maxZScore: number;
  minZScoreEntry: number;
}

/** Configuration for value strategy. */
export interface ValueConfig extends StrategyConfig {
  minimumEdge: number; // minimum edge before placing a trade
  kellyFraction: number; // fraction of full Kelly to use (e.g. 0.25 = quarter Kelly)
  maxKellyBet: number; // cap on Kelly-suggested size as fraction of capital
}

// ============================================================================
// Abstract Base Class
// ============================================================================

export abstract class TradingStrategyBase {
  public readonly name: string;
  protected readonly config: StrategyConfig;
  protected readonly positions: Map<string, Position> = new Map();
  protected readonly tradeHistory: TradeRecord[] = [];

  constructor(name: string, config: StrategyConfig) {
    this.name = name;
    this.config = config;
  }

  // -------------------------------------------------------------------------
  // Abstract method – must be implemented by every concrete strategy
  // -------------------------------------------------------------------------

  /**
   * Analyze the current market conditions and return a trading signal.
   *
   * @param market       - The Polymarket market metadata.
   * @param orderBook    - The current order book snapshot.
   * @param priceHistory - Recent price history as an array of price points.
   */
  abstract analyze(
    market: PolymarketMarket,
    orderBook: OrderBook,
    priceHistory: PricePoint[],
  ): Signal;

  // -------------------------------------------------------------------------
  // Position sizing
  // -------------------------------------------------------------------------

  /**
   * Calculate the raw position size based on available capital and risk budget.
   */
  calculatePositionSize(capital: number, price: number, confidence: number): number {
    if (price <= 0 || price >= 1) return 0;
    const riskAmount = capital * this.config.riskPerTrade;
    const rawSize = riskAmount / price;
    const confidenceAdjusted = rawSize * confidence;
    return Math.min(confidenceAdjusted, this.config.maxPositionSize);
  }

  /**
   * Apply risk adjustments (total exposure, existing positions) to a proposed size.
   */
  getRiskAdjustedSize(proposedSize: number, price: number): number {
    const currentExposure = this.getCurrentExposure();
    const remainingCapacity = this.config.maxTotalExposure - currentExposure;

    if (remainingCapacity <= 0) return 0;

    const costOfProposed = proposedSize * price;
    if (costOfProposed > remainingCapacity) {
      return remainingCapacity / price;
    }

    return proposedSize;
  }

  // -------------------------------------------------------------------------
  // Exit logic
  // -------------------------------------------------------------------------

  /**
   * Determine whether an existing position should be exited.
   * Returns true if the position should be closed.
   */
  shouldExit(position: Position, currentPrice: number): boolean {
    const pnlPercent =
      position.side === "long"
        ? (currentPrice - position.entryPrice) / position.entryPrice
        : (position.entryPrice - currentPrice) / position.entryPrice;

    // Stop-loss: exit if loss exceeds risk budget
    if (pnlPercent < -this.config.riskPerTrade) {
      return true;
    }

    // Take-profit: exit if gain exceeds 3x risk budget
    if (pnlPercent > this.config.riskPerTrade * 3) {
      return true;
    }

    // Binary market resolution approaching: exit if price is near 0 or 1
    if (currentPrice < 0.02 || currentPrice > 0.98) {
      return true;
    }

    return false;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  protected getCurrentExposure(): number {
    let exposure = 0;
    for (const position of this.positions.values()) {
      exposure += position.size * position.currentPrice;
    }
    return exposure;
  }

  protected recordTrade(record: TradeRecord): void {
    this.tradeHistory.push(record);
  }

  protected getPosition(tokenId: string): Position | undefined {
    return this.positions.get(tokenId);
  }

  protected setPosition(position: Position): void {
    this.positions.set(position.tokenId, position);
  }

  protected removePosition(tokenId: string): void {
    this.positions.delete(tokenId);
  }

  /** Extract closing prices from a PricePoint array. */
  protected extractPrices(history: PricePoint[]): number[] {
    return history.map((p) => p.price);
  }

  /** Extract volumes from a PricePoint array. */
  protected extractVolumes(history: PricePoint[]): number[] {
    return history.map((p) => p.volume);
  }

  /** Get the order-book midpoint from an OrderBook. */
  protected getMidpoint(orderBook: OrderBook): number {
    const bestBid = orderBook.bids.length > 0 ? Number(orderBook.bids[0].price) : 0;
    const bestAsk = orderBook.asks.length > 0 ? Number(orderBook.asks[0].price) : 0;
    if (bestBid === 0 && bestAsk === 0) return 0;
    if (bestBid === 0) return bestAsk;
    if (bestAsk === 0) return bestBid;
    return (bestBid + bestAsk) / 2;
  }
}

// ============================================================================
// MarketMakingStrategy
// ============================================================================

export class MarketMakingStrategy extends TradingStrategyBase {
  protected override readonly config: MarketMakingConfig;
  private lastOrderTimestamps: Map<string, number> = new Map();

  constructor(config: MarketMakingConfig) {
    super("MarketMaking", config);
    this.config = config;
  }

  analyze(
    market: PolymarketMarket,
    orderBook: OrderBook,
    priceHistory: PricePoint[],
  ): Signal {
    const prices = this.extractPrices(priceHistory);
    const mid = this.getMidpoint(orderBook);

    if (mid === 0) {
      return this.holdSignal(market, "No valid midpoint available");
    }

    // Cancel stale orders
    this.cancelStaleOrders();

    // Adjust spread based on recent volatility
    const vol = volatility(prices);
    const adjustedSpread = this.config.baseSpread + vol * this.config.volatilityMultiplier;
    const halfSpread = adjustedSpread / 2;

    const bidPrice = mid - halfSpread;
    const askPrice = mid + halfSpread;

    // Inventory management – skew quotes toward delta-neutral
    const position = this.getPosition(market.tokens?.[0]?.token_id ?? "");
    const inventorySkew = this.calculateInventorySkew(position);

    const skewedBid = bidPrice - inventorySkew;
    const skewedAsk = askPrice - inventorySkew;

    // Decide which side to quote more aggressively
    if (position && position.size > this.config.inventoryLimit) {
      // We're too long – favor selling
      const tokenId = position.tokenId;
      const size = this.calculatePositionSize(this.config.maxTotalExposure, skewedAsk, 0.8);
      const adjusted = this.getRiskAdjustedSize(size, skewedAsk);

      this.updateOrderTimestamp(tokenId);

      return {
        action: "sell",
        tokenId,
        confidence: 0.8,
        size: adjusted,
        price: skewedAsk,
        reason: `Inventory too long (${position.size}), quoting ask at ${skewedAsk.toFixed(4)} (spread: ${(adjustedSpread * 100).toFixed(1)}%)`,
      };
    }

    if (position && position.size < -this.config.inventoryLimit) {
      // We're too short – favor buying
      const tokenId = position.tokenId;
      const size = this.calculatePositionSize(this.config.maxTotalExposure, skewedBid, 0.8);
      const adjusted = this.getRiskAdjustedSize(size, skewedBid);

      this.updateOrderTimestamp(tokenId);

      return {
        action: "buy",
        tokenId,
        confidence: 0.8,
        size: adjusted,
        price: skewedBid,
        reason: `Inventory too short (${position.size}), quoting bid at ${skewedBid.toFixed(4)} (spread: ${(adjustedSpread * 100).toFixed(1)}%)`,
      };
    }

    // Default: place bid (we can alternate bid/ask in a real implementation)
    const tokenId = market.tokens?.[0]?.token_id ?? "";
    const size = this.calculatePositionSize(this.config.maxTotalExposure, skewedBid, 0.6);
    const adjusted = this.getRiskAdjustedSize(size, skewedBid);

    this.updateOrderTimestamp(tokenId);

    return {
      action: "buy",
      tokenId,
      confidence: 0.6,
      size: adjusted,
      price: skewedBid,
      reason: `Market making: bid at ${skewedBid.toFixed(4)}, ask at ${skewedAsk.toFixed(4)} (spread: ${(adjustedSpread * 100).toFixed(1)}%, vol: ${(vol * 100).toFixed(2)}%)`,
    };
  }

  private calculateInventorySkew(position: Position | undefined): number {
    if (!position) return 0;
    // Linear skew proportional to inventory relative to limit
    const ratio = position.size / this.config.inventoryLimit;
    return ratio * this.config.baseSpread * 0.5;
  }

  private cancelStaleOrders(): void {
    const now = Date.now();
    for (const [tokenId, timestamp] of this.lastOrderTimestamps.entries()) {
      if (now - timestamp > this.config.staleOrderThresholdMs) {
        this.lastOrderTimestamps.delete(tokenId);
      }
    }
  }

  private updateOrderTimestamp(tokenId: string): void {
    this.lastOrderTimestamps.set(tokenId, Date.now());
  }

  private holdSignal(market: PolymarketMarket, reason: string): Signal {
    return {
      action: "hold",
      tokenId: market.tokens?.[0]?.token_id ?? "",
      confidence: 0,
      size: 0,
      price: 0,
      reason,
    };
  }
}

// ============================================================================
// MomentumStrategy
// ============================================================================

export class MomentumStrategy extends TradingStrategyBase {
  protected override readonly config: MomentumConfig;

  constructor(config: MomentumConfig) {
    super("Momentum", config);
    this.config = config;
  }

  analyze(
    market: PolymarketMarket,
    orderBook: OrderBook,
    priceHistory: PricePoint[],
  ): Signal {
    const tokenId = market.tokens?.[0]?.token_id ?? "";
    const prices = this.extractPrices(priceHistory);
    const volumes = this.extractVolumes(priceHistory);

    if (prices.length < this.config.slowMaPeriod) {
      return this.holdSignal(tokenId, "Insufficient price history for slow MA");
    }

    // Calculate momentum as rate of change over lookback period
    const lookback = Math.min(this.config.lookbackPeriod, prices.length);
    const currentPrice = prices[prices.length - 1];
    const lookbackPrice = prices[prices.length - lookback];
    const momentum = lookbackPrice !== 0
      ? (currentPrice - lookbackPrice) / lookbackPrice
      : 0;

    // Moving average crossover
    const fastMa = sma(prices, this.config.fastMaPeriod);
    const slowMa = sma(prices, this.config.slowMaPeriod);
    const maCrossover = fastMa - slowMa;

    // Volume confirmation: require current volume above average
    const avgVolume = mean(volumes);
    const recentVolume = volumes.length > 0 ? volumes[volumes.length - 1] : 0;
    const volumeConfirmed =
      avgVolume > 0 &&
      recentVolume >= avgVolume * this.config.volumeConfirmationMultiplier;

    // Generate signal
    const mid = this.getMidpoint(orderBook);
    const price = mid > 0 ? mid : currentPrice;

    if (
      momentum > this.config.momentumThreshold &&
      maCrossover > 0 &&
      volumeConfirmed
    ) {
      const confidence = Math.min(0.95, 0.5 + momentum * 2);
      const size = this.calculatePositionSize(
        this.config.maxTotalExposure,
        price,
        confidence,
      );
      const adjusted = this.getRiskAdjustedSize(size, price);

      return {
        action: "buy",
        tokenId,
        confidence,
        size: adjusted,
        price,
        reason: `Momentum bullish: roc=${(momentum * 100).toFixed(2)}%, fast MA (${fastMa.toFixed(4)}) > slow MA (${slowMa.toFixed(4)}), volume confirmed`,
      };
    }

    if (
      momentum < -this.config.momentumThreshold &&
      maCrossover < 0 &&
      volumeConfirmed
    ) {
      const confidence = Math.min(0.95, 0.5 + Math.abs(momentum) * 2);
      const size = this.calculatePositionSize(
        this.config.maxTotalExposure,
        price,
        confidence,
      );
      const adjusted = this.getRiskAdjustedSize(size, price);

      return {
        action: "sell",
        tokenId,
        confidence,
        size: adjusted,
        price,
        reason: `Momentum bearish: roc=${(momentum * 100).toFixed(2)}%, fast MA (${fastMa.toFixed(4)}) < slow MA (${slowMa.toFixed(4)}), volume confirmed`,
      };
    }

    // No clear signal
    const holdReason = !volumeConfirmed
      ? `Volume not confirmed (${recentVolume.toFixed(0)} < ${(avgVolume * this.config.volumeConfirmationMultiplier).toFixed(0)})`
      : `Momentum (${(momentum * 100).toFixed(2)}%) within threshold (${(this.config.momentumThreshold * 100).toFixed(2)}%)`;

    return this.holdSignal(tokenId, holdReason);
  }

  private holdSignal(tokenId: string, reason: string): Signal {
    return {
      action: "hold",
      tokenId,
      confidence: 0,
      size: 0,
      price: 0,
      reason,
    };
  }
}

// ============================================================================
// MeanReversionStrategy
// ============================================================================

export class MeanReversionStrategy extends TradingStrategyBase {
  protected override readonly config: MeanReversionConfig;

  constructor(config: MeanReversionConfig) {
    super("MeanReversion", config);
    this.config = config;
  }

  analyze(
    market: PolymarketMarket,
    orderBook: OrderBook,
    priceHistory: PricePoint[],
  ): Signal {
    const tokenId = market.tokens?.[0]?.token_id ?? "";
    const prices = this.extractPrices(priceHistory);

    if (prices.length < this.config.bollingerPeriod) {
      return this.holdSignal(tokenId, "Insufficient data for Bollinger Bands");
    }

    const bands = bollingerBands(
      prices,
      this.config.bollingerPeriod,
      this.config.bollingerStdDev,
    );
    const currentPrice = prices[prices.length - 1];
    const z = zScore(prices.slice(-this.config.bollingerPeriod));

    const mid = this.getMidpoint(orderBook);
    const executionPrice = mid > 0 ? mid : currentPrice;

    // Buy below lower band
    if (currentPrice < bands.lower && Math.abs(z) >= this.config.minZScoreEntry) {
      const confidence = Math.min(0.95, 0.5 + Math.abs(z) * 0.15);

      // Z-score based position sizing: larger positions for more extreme deviations
      const zSizeMultiplier = Math.min(Math.abs(z) / this.config.maxZScore, 1);
      const baseSize = this.calculatePositionSize(
        this.config.maxTotalExposure,
        executionPrice,
        confidence,
      );
      const zAdjustedSize = baseSize * zSizeMultiplier;
      const adjusted = this.getRiskAdjustedSize(zAdjustedSize, executionPrice);

      return {
        action: "buy",
        tokenId,
        confidence,
        size: adjusted,
        price: executionPrice,
        reason: `Mean reversion buy: price (${currentPrice.toFixed(4)}) below lower band (${bands.lower.toFixed(4)}), z-score=${z.toFixed(2)}`,
      };
    }

    // Sell above upper band
    if (currentPrice > bands.upper && Math.abs(z) >= this.config.minZScoreEntry) {
      const confidence = Math.min(0.95, 0.5 + Math.abs(z) * 0.15);

      const zSizeMultiplier = Math.min(Math.abs(z) / this.config.maxZScore, 1);
      const baseSize = this.calculatePositionSize(
        this.config.maxTotalExposure,
        executionPrice,
        confidence,
      );
      const zAdjustedSize = baseSize * zSizeMultiplier;
      const adjusted = this.getRiskAdjustedSize(zAdjustedSize, executionPrice);

      return {
        action: "sell",
        tokenId,
        confidence,
        size: adjusted,
        price: executionPrice,
        reason: `Mean reversion sell: price (${currentPrice.toFixed(4)}) above upper band (${bands.upper.toFixed(4)}), z-score=${z.toFixed(2)}`,
      };
    }

    return this.holdSignal(
      tokenId,
      `Price (${currentPrice.toFixed(4)}) within bands [${bands.lower.toFixed(4)}, ${bands.upper.toFixed(4)}], z=${z.toFixed(2)}`,
    );
  }

  private holdSignal(tokenId: string, reason: string): Signal {
    return {
      action: "hold",
      tokenId,
      confidence: 0,
      size: 0,
      price: 0,
      reason,
    };
  }
}

// ============================================================================
// ValueStrategy
// ============================================================================

export class ValueStrategy extends TradingStrategyBase {
  protected override readonly config: ValueConfig;

  constructor(config: ValueConfig) {
    super("Value", config);
    this.config = config;
  }

  /**
   * Analyze compares the market price against an estimated fair value
   * (derived from recent price history as a proxy) and uses the Kelly Criterion
   * for position sizing.
   *
   * In a production system, `estimatedProbability` would come from an external
   * model; here we approximate it from the smoothed price history.
   */
  analyze(
    market: PolymarketMarket,
    orderBook: OrderBook,
    priceHistory: PricePoint[],
  ): Signal {
    const tokenId = market.tokens?.[0]?.token_id ?? "";
    const prices = this.extractPrices(priceHistory);

    if (prices.length < 10) {
      return this.holdSignal(tokenId, "Insufficient price history for value estimate");
    }

    const mid = this.getMidpoint(orderBook);
    const marketPrice = mid > 0 ? mid : prices[prices.length - 1];

    // Estimate "fair value" as the EMA of recent prices (proxy for a model)
    const estimatedProbability = ema(prices, Math.min(20, prices.length));

    // Edge = (estimated_prob * payout - price) / payout
    // In a binary market, payout = 1
    const edge = estimatedProbability - marketPrice;
    const absEdge = Math.abs(edge);

    if (absEdge < this.config.minimumEdge) {
      return this.holdSignal(
        tokenId,
        `Edge too small: ${(edge * 100).toFixed(2)}% (min: ${(this.config.minimumEdge * 100).toFixed(2)}%)`,
      );
    }

    // Kelly Criterion: f* = (bp - q) / b
    // For binary markets: b = (1/price - 1), p = estimated_prob, q = 1 - p
    const kellySize = this.kellyBetFraction(estimatedProbability, marketPrice);
    const adjustedKelly = kellySize * this.config.kellyFraction; // fractional Kelly
    const cappedKelly = Math.min(adjustedKelly, this.config.maxKellyBet);

    const confidence = Math.min(0.95, 0.5 + absEdge * 3);
    const size = cappedKelly * this.config.maxTotalExposure / marketPrice;
    const adjusted = this.getRiskAdjustedSize(size, marketPrice);

    if (edge > 0) {
      // Market is underpriced – buy
      return {
        action: "buy",
        tokenId,
        confidence,
        size: adjusted,
        price: marketPrice,
        reason: `Value buy: est. prob=${(estimatedProbability * 100).toFixed(1)}%, market=${(marketPrice * 100).toFixed(1)}%, edge=${(edge * 100).toFixed(2)}%, Kelly=${(adjustedKelly * 100).toFixed(2)}%`,
      };
    } else {
      // Market is overpriced – sell
      return {
        action: "sell",
        tokenId,
        confidence,
        size: adjusted,
        price: marketPrice,
        reason: `Value sell: est. prob=${(estimatedProbability * 100).toFixed(1)}%, market=${(marketPrice * 100).toFixed(1)}%, edge=${(edge * 100).toFixed(2)}%, Kelly=${(adjustedKelly * 100).toFixed(2)}%`,
      };
    }
  }

  /**
   * Kelly Criterion bet fraction for a binary outcome.
   *
   * f* = (b * p - q) / b
   * where b = (1/price - 1) = net odds, p = estimated probability, q = 1 - p
   */
  private kellyBetFraction(estimatedProb: number, price: number): number {
    if (price <= 0 || price >= 1) return 0;

    const b = 1 / price - 1; // net payout ratio
    const p = estimatedProb;
    const q = 1 - p;
    const kelly = (b * p - q) / b;

    // Kelly can be negative (suggesting the other side); we take absolute value
    // since the analyze() method determines direction separately.
    return Math.max(0, Math.abs(kelly));
  }

  private holdSignal(tokenId: string, reason: string): Signal {
    return {
      action: "hold",
      tokenId,
      confidence: 0,
      size: 0,
      price: 0,
      reason,
    };
  }
}

// ============================================================================
// Strategy Factory
// ============================================================================

export type StrategyType = "market_making" | "momentum" | "mean_reversion" | "value";

const DEFAULT_BASE_CONFIG: StrategyConfig = {
  maxPositionSize: 1000,
  maxTotalExposure: 5000,
  riskPerTrade: 0.02,
  defaultConfidenceThreshold: 0.6,
};

const DEFAULT_CONFIGS: Record<StrategyType, StrategyConfig> = {
  market_making: {
    ...DEFAULT_BASE_CONFIG,
    baseSpread: 0.02,
    volatilityMultiplier: 5,
    inventoryLimit: 500,
    staleOrderThresholdMs: 30_000,
    minEdge: 0.005,
  } as MarketMakingConfig,

  momentum: {
    ...DEFAULT_BASE_CONFIG,
    lookbackPeriod: 20,
    momentumThreshold: 0.03,
    fastMaPeriod: 5,
    slowMaPeriod: 20,
    volumeConfirmationMultiplier: 1.2,
  } as MomentumConfig,

  mean_reversion: {
    ...DEFAULT_BASE_CONFIG,
    bollingerPeriod: 20,
    bollingerStdDev: 2,
    maxZScore: 3,
    minZScoreEntry: 1.5,
  } as MeanReversionConfig,

  value: {
    ...DEFAULT_BASE_CONFIG,
    minimumEdge: 0.05,
    kellyFraction: 0.25,
    maxKellyBet: 0.1,
  } as ValueConfig,
};

/**
 * Factory function to create a strategy instance by type.
 *
 * @param type   - The strategy type identifier.
 * @param params - Optional partial config to override defaults.
 */
export function createStrategy(
  type: StrategyType,
  params?: Partial<StrategyConfig>,
): TradingStrategyBase {
  const mergedConfig = { ...DEFAULT_CONFIGS[type], ...params };

  switch (type) {
    case "market_making":
      return new MarketMakingStrategy(mergedConfig as MarketMakingConfig);
    case "momentum":
      return new MomentumStrategy(mergedConfig as MomentumConfig);
    case "mean_reversion":
      return new MeanReversionStrategy(mergedConfig as MeanReversionConfig);
    case "value":
      return new ValueStrategy(mergedConfig as ValueConfig);
    default: {
      const exhaustive: never = type;
      throw new Error(`Unknown strategy type: ${exhaustive}`);
    }
  }
}
