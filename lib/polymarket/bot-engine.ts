import type {
  PolymarketMarket,
  TradeExecution,
  OrderBook,
  BotConfig,
  BotStatus,
  TradingMode,
  Position,
  PendingOrder,
  TradeRecord,
  PortfolioSummary,
  StrategySignal,
  TradingStrategy,
  PerformanceMetrics,
  TradeStats,
  BotEvent,
  BotEventType,
} from "@/types/polymarket";

import { PolymarketClient } from "@/lib/polymarket/client";

// ---------------------------------------------------------------------------
// Event listener types
// ---------------------------------------------------------------------------

type BotEventListener = (event: BotEvent) => void;

// ---------------------------------------------------------------------------
// Trading Bot Engine
// ---------------------------------------------------------------------------

export class TradingBot {
  // -- Configuration --------------------------------------------------------
  private readonly config: BotConfig;
  private readonly client: PolymarketClient;
  private readonly strategy: TradingStrategy;

  // -- State ----------------------------------------------------------------
  private _status: BotStatus = "idle";
  private positions: Map<string, Position> = new Map();
  private openOrders: PendingOrder[] = [];
  private tradeHistory: TradeRecord[] = [];
  private portfolio: PortfolioSummary = {
    balance: 0,
    unrealizedPnL: 0,
    realizedPnL: 0,
    totalValue: 0,
    positionCount: 0,
    openOrderCount: 0,
    lastUpdated: new Date().toISOString(),
  };

  // -- Loop control ---------------------------------------------------------
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private readonly tickIntervalMs: number;

  // -- Risk tracking --------------------------------------------------------
  private dailyPnL = 0;
  private dailyPnLResetDate: string = new Date().toISOString().slice(0, 10);
  private peakPortfolioValue = 0;

  // -- Event system ---------------------------------------------------------
  private listeners: Map<BotEventType, BotEventListener[]> = new Map();

  // =========================================================================
  // Constructor
  // =========================================================================

  constructor(
    config: BotConfig,
    client: PolymarketClient,
    strategy: TradingStrategy,
  ) {
    this.config = config;
    this.client = client;
    this.strategy = strategy;
    this.tickIntervalMs = config.tickIntervalMs ?? 30_000;
    this.portfolio.balance = config.initialBalance ?? 0;
    this.peakPortfolioValue = this.portfolio.balance;
  }

  // =========================================================================
  // Status helpers
  // =========================================================================

  get status(): BotStatus {
    return this._status;
  }

  private setStatus(next: BotStatus): void {
    const previous = this._status;
    this._status = next;
    this.emit("statusChange", {
      type: "statusChange",
      timestamp: new Date().toISOString(),
      data: { previous, current: next },
    });
  }

  // =========================================================================
  // Core loop – start / stop / pause / resume
  // =========================================================================

  /**
   * Begin the main trading loop. Runs an immediate tick, then repeats on
   * the configured interval (default 30 s).
   */
  async start(): Promise<void> {
    if (this._status === "running") return;

    this.setStatus("running");

    // Execute first tick immediately
    await this.safeTick();

    this.tickInterval = setInterval(() => {
      void this.safeTick();
    }, this.tickIntervalMs);
  }

  /**
   * Gracefully stop the bot. Cancels all open orders before halting.
   */
  async stop(): Promise<void> {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    // Cancel all pending orders on stop
    await this.cancelAllOpenOrders();

    this.setStatus("idle");
  }

  /**
   * Pause the loop without cancelling open orders.
   */
  pause(): void {
    if (this._status !== "running") return;

    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    this.setStatus("paused");
  }

  /**
   * Resume a previously paused bot.
   */
  async resume(): Promise<void> {
    if (this._status !== "paused") return;

    this.setStatus("running");
    await this.safeTick();

    this.tickInterval = setInterval(() => {
      void this.safeTick();
    }, this.tickIntervalMs);
  }

  // =========================================================================
  // Tick – single iteration
  // =========================================================================

  /**
   * Wraps `tick()` with error handling so the interval never throws.
   */
  private async safeTick(): Promise<void> {
    try {
      await this.tick();
    } catch (err) {
      this.setStatus("error");
      this.emit("error", {
        type: "error",
        timestamp: new Date().toISOString(),
        data: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  /**
   * A single tick: fetch market data, evaluate strategy, check risk, execute.
   */
  async tick(): Promise<void> {
    if (this._status !== "running") return;

    // 1. Reset daily PnL tracker at midnight
    this.maybeResetDailyPnL();

    // 2. Update portfolio mark-to-market
    await this.calculatePortfolioValue();

    // 3. Risk checks – may halt the bot
    if (!this.checkRiskLimits()) return;

    // 4. Enforce stop-losses on existing positions
    await this.enforceStopLoss();

    // 5. Update open order statuses
    await this.refreshOpenOrders();

    // 6. Gather market data for the strategy
    const markets = await this.fetchWatchedMarkets();

    // 7. Run strategy to produce signals
    const signals = await this.strategy.evaluate(markets, {
      positions: this.positions,
      portfolio: this.portfolio,
      openOrders: this.openOrders,
    });

    // 8. Execute each signal (respecting risk limits)
    for (const signal of signals) {
      if (!this.checkRiskLimits()) break;
      await this.executeSignal(signal);
    }
  }

  // =========================================================================
  // Risk management
  // =========================================================================

  /**
   * Validate all risk constraints. Returns `true` when it is safe to
   * continue trading, `false` (and halts) otherwise.
   */
  checkRiskLimits(): boolean {
    const { riskLimits } = this.config;
    if (!riskLimits) return true;

    // Max single-position size
    if (riskLimits.maxPositionSize !== undefined) {
      for (const [, pos] of this.positions) {
        if (pos.size > riskLimits.maxPositionSize) {
          this.haltWithReason(
            `Position ${pos.marketId} exceeds max size (${pos.size} > ${riskLimits.maxPositionSize})`,
          );
          return false;
        }
      }
    }

    // Daily loss limit
    if (
      riskLimits.maxDailyLoss !== undefined &&
      this.dailyPnL < -riskLimits.maxDailyLoss
    ) {
      this.haltWithReason(
        `Daily loss limit reached (${this.dailyPnL.toFixed(2)} < -${riskLimits.maxDailyLoss})`,
      );
      return false;
    }

    // Max drawdown
    if (!this.maxDrawdownCheck()) return false;

    // Max total exposure
    if (riskLimits.maxTotalExposure !== undefined) {
      const exposure = this.getTotalExposure();
      if (exposure > riskLimits.maxTotalExposure) {
        this.haltWithReason(
          `Total exposure ${exposure.toFixed(2)} exceeds limit ${riskLimits.maxTotalExposure}`,
        );
        return false;
      }
    }

    return true;
  }

  /**
   * Mark all positions to their current market prices and recalculate
   * the portfolio summary.
   */
  async calculatePortfolioValue(): Promise<void> {
    let unrealizedPnL = 0;

    for (const [tokenId, pos] of this.positions) {
      try {
        const mid = await this.client.getMidpoint(tokenId);
        pos.currentPrice = mid;
        pos.unrealizedPnL = (mid - pos.avgEntryPrice) * pos.size * (pos.side === "buy" ? 1 : -1);
        unrealizedPnL += pos.unrealizedPnL;
      } catch {
        // If price fetch fails, keep last known value
      }
    }

    this.portfolio.unrealizedPnL = unrealizedPnL;
    this.portfolio.totalValue = this.portfolio.balance + unrealizedPnL;
    this.portfolio.positionCount = this.positions.size;
    this.portfolio.openOrderCount = this.openOrders.length;
    this.portfolio.lastUpdated = new Date().toISOString();

    // Track peak for drawdown
    if (this.portfolio.totalValue > this.peakPortfolioValue) {
      this.peakPortfolioValue = this.portfolio.totalValue;
    }
  }

  /**
   * Auto-exit positions that have hit their stop loss price.
   */
  async enforceStopLoss(): Promise<void> {
    for (const [tokenId, pos] of this.positions) {
      if (pos.stopLoss === undefined || pos.currentPrice === undefined) continue;

      const triggered =
        pos.side === "buy"
          ? pos.currentPrice <= pos.stopLoss
          : pos.currentPrice >= pos.stopLoss;

      if (triggered) {
        const exitSignal: StrategySignal = {
          marketId: pos.marketId,
          tokenId,
          side: pos.side === "buy" ? "sell" : "buy",
          size: pos.size,
          reason: `Stop loss triggered at ${pos.currentPrice}`,
          urgency: "high",
        };
        await this.executeSignal(exitSignal);
      }
    }
  }

  /**
   * Check whether the maximum drawdown limit has been breached.
   * Returns `true` if within limits, `false` if the bot should halt.
   */
  maxDrawdownCheck(): boolean {
    const { riskLimits } = this.config;
    if (!riskLimits?.maxDrawdownPercent) return true;

    if (this.peakPortfolioValue === 0) return true;

    const drawdown =
      (this.peakPortfolioValue - this.portfolio.totalValue) /
      this.peakPortfolioValue;

    if (drawdown > riskLimits.maxDrawdownPercent / 100) {
      this.haltWithReason(
        `Max drawdown exceeded: ${(drawdown * 100).toFixed(2)}% > ${riskLimits.maxDrawdownPercent}%`,
      );
      return false;
    }

    return true;
  }

  // =========================================================================
  // Order management
  // =========================================================================

  /**
   * Translate a strategy signal into an order and execute it (or simulate).
   */
  async executeSignal(signal: StrategySignal): Promise<void> {
    const order: PendingOrder = {
      id: crypto.randomUUID(),
      marketId: signal.marketId,
      tokenId: signal.tokenId,
      side: signal.side,
      size: signal.size,
      price: signal.price,
      reason: signal.reason,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    if (this.config.mode === "PAPER") {
      await this.simulateOrder(order);
    } else {
      await this.submitLiveOrder(order);
    }
  }

  /**
   * Paper-trade mode: simulate order fill immediately at current midpoint.
   */
  async simulateOrder(order: PendingOrder): Promise<void> {
    try {
      const fillPrice =
        order.price ?? (await this.client.getMidpoint(order.tokenId));

      order.status = "filled";
      order.filledAt = new Date().toISOString();
      order.fillPrice = fillPrice;

      this.recordTrade(order, fillPrice);

      this.emit("trade", {
        type: "trade",
        timestamp: new Date().toISOString(),
        data: {
          orderId: order.id,
          marketId: order.marketId,
          side: order.side,
          size: order.size,
          price: fillPrice,
          mode: "PAPER",
        },
      });
    } catch (err) {
      order.status = "rejected";
      this.emit("error", {
        type: "error",
        timestamp: new Date().toISOString(),
        data: {
          orderId: order.id,
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  /**
   * Submit an order to the live Polymarket API.
   * (Placeholder – the real implementation depends on the CLOB client SDK.)
   */
  private async submitLiveOrder(order: PendingOrder): Promise<void> {
    order.status = "submitted";
    this.openOrders.push(order);
    this.trackOrder(order);
  }

  /**
   * Monitor an open order until it fills, cancels, or expires.
   * In a real implementation this would poll or use WebSocket updates.
   */
  trackOrder(order: PendingOrder): void {
    // Track in open orders (already added by submitLiveOrder)
    // In production: subscribe to order-status websocket or poll periodically
    this.emit("trade", {
      type: "trade",
      timestamp: new Date().toISOString(),
      data: {
        orderId: order.id,
        marketId: order.marketId,
        side: order.side,
        size: order.size,
        status: order.status,
        mode: "LIVE",
      },
    });
  }

  // =========================================================================
  // Event system
  // =========================================================================

  /**
   * Register a listener for a specific event type.
   */
  on(eventType: BotEventType, listener: BotEventListener): void {
    const existing = this.listeners.get(eventType) ?? [];
    existing.push(listener);
    this.listeners.set(eventType, existing);
  }

  /**
   * Remove a previously registered listener.
   */
  off(eventType: BotEventType, listener: BotEventListener): void {
    const existing = this.listeners.get(eventType);
    if (!existing) return;
    this.listeners.set(
      eventType,
      existing.filter((l) => l !== listener),
    );
  }

  /**
   * Convenience callbacks – sugar over `on()`.
   */
  onTrade(listener: BotEventListener): void {
    this.on("trade", listener);
  }

  onError(listener: BotEventListener): void {
    this.on("error", listener);
  }

  onStatusChange(listener: BotEventListener): void {
    this.on("statusChange", listener);
  }

  private emit(eventType: BotEventType, event: BotEvent): void {
    const handlers = this.listeners.get(eventType) ?? [];
    for (const handler of handlers) {
      try {
        handler(event);
      } catch {
        // Swallow listener errors so they don't crash the bot loop
      }
    }
  }

  // =========================================================================
  // Metrics
  // =========================================================================

  /**
   * Compute high-level performance metrics over the entire trade history.
   */
  getPerformanceMetrics(): PerformanceMetrics {
    const trades = this.tradeHistory;
    const wins = trades.filter((t) => t.pnl > 0);
    const losses = trades.filter((t) => t.pnl < 0);

    const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
    const winRate = trades.length > 0 ? wins.length / trades.length : 0;

    // Simple Sharpe approximation (annualised, assuming daily returns)
    const returns = trades.map((t) => t.pnl);
    const avgReturn = returns.length > 0 ? totalPnL / returns.length : 0;
    const variance =
      returns.length > 1
        ? returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) /
          (returns.length - 1)
        : 0;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

    // Max drawdown over trade history
    let peak = 0;
    let maxDrawdown = 0;
    let cumulative = 0;
    for (const t of trades) {
      cumulative += t.pnl;
      if (cumulative > peak) peak = cumulative;
      const dd = peak - cumulative;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    return {
      totalPnL,
      winRate,
      sharpeRatio,
      maxDrawdown,
      totalTrades: trades.length,
      winCount: wins.length,
      lossCount: losses.length,
    };
  }

  /**
   * Granular trade-level statistics.
   */
  getTradeStats(): TradeStats {
    const trades = this.tradeHistory;
    const wins = trades.filter((t) => t.pnl > 0);
    const losses = trades.filter((t) => t.pnl < 0);

    const avgProfit =
      wins.length > 0
        ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length
        : 0;
    const avgLoss =
      losses.length > 0
        ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length
        : 0;

    const largestWin = wins.length > 0 ? Math.max(...wins.map((t) => t.pnl)) : 0;
    const largestLoss =
      losses.length > 0 ? Math.min(...losses.map((t) => t.pnl)) : 0;

    return {
      totalTrades: trades.length,
      avgProfit,
      avgLoss,
      largestWin,
      largestLoss,
      profitFactor:
        Math.abs(avgLoss) > 0 ? avgProfit / Math.abs(avgLoss) : Infinity,
    };
  }

  // =========================================================================
  // Accessors (read-only snapshots for UI)
  // =========================================================================

  getPositions(): Map<string, Position> {
    return new Map(this.positions);
  }

  getOpenOrders(): PendingOrder[] {
    return [...this.openOrders];
  }

  getTradeHistory(): TradeRecord[] {
    return [...this.tradeHistory];
  }

  getPortfolio(): PortfolioSummary {
    return { ...this.portfolio };
  }

  // =========================================================================
  // Internal helpers
  // =========================================================================

  /**
   * Halt the bot due to a risk violation.
   */
  private haltWithReason(reason: string): void {
    this.pause();
    this.setStatus("error");
    this.emit("error", {
      type: "error",
      timestamp: new Date().toISOString(),
      data: { reason, action: "bot_halted" },
    });
  }

  /**
   * Record a filled trade and update position/portfolio bookkeeping.
   */
  private recordTrade(order: PendingOrder, fillPrice: number): void {
    const pnl = this.updatePosition(order, fillPrice);

    const record: TradeRecord = {
      id: crypto.randomUUID(),
      orderId: order.id,
      marketId: order.marketId,
      tokenId: order.tokenId,
      side: order.side,
      size: order.size,
      price: fillPrice,
      pnl,
      timestamp: new Date().toISOString(),
    };

    this.tradeHistory.push(record);
    this.dailyPnL += pnl;
    this.portfolio.realizedPnL += pnl;

    // Update balance for paper mode
    if (this.config.mode === "PAPER") {
      if (order.side === "buy") {
        this.portfolio.balance -= fillPrice * order.size;
      } else {
        this.portfolio.balance += fillPrice * order.size;
      }
    }
  }

  /**
   * Update the position map after a fill. Returns the realized PnL for
   * closing trades, or 0 for opening trades.
   */
  private updatePosition(order: PendingOrder, fillPrice: number): number {
    const existing = this.positions.get(order.tokenId);

    if (!existing) {
      // Opening a new position
      this.positions.set(order.tokenId, {
        marketId: order.marketId,
        tokenId: order.tokenId,
        side: order.side,
        size: order.size,
        avgEntryPrice: fillPrice,
        currentPrice: fillPrice,
        unrealizedPnL: 0,
        openedAt: new Date().toISOString(),
      });
      return 0;
    }

    // Closing or reducing an existing position
    if (existing.side !== order.side) {
      const pnl =
        (fillPrice - existing.avgEntryPrice) *
        Math.min(order.size, existing.size) *
        (existing.side === "buy" ? 1 : -1);

      const remaining = existing.size - order.size;

      if (remaining <= 0) {
        this.positions.delete(order.tokenId);
      } else {
        existing.size = remaining;
      }

      return pnl;
    }

    // Adding to position – recompute average entry
    const totalCost =
      existing.avgEntryPrice * existing.size + fillPrice * order.size;
    existing.size += order.size;
    existing.avgEntryPrice = totalCost / existing.size;
    return 0;
  }

  /**
   * Fetch market data for the tokens/markets the strategy cares about.
   */
  private async fetchWatchedMarkets(): Promise<PolymarketMarket[]> {
    const marketIds = this.config.watchMarketIds ?? [];
    const results: PolymarketMarket[] = [];

    for (const id of marketIds) {
      try {
        const market = await this.client.getMarket(id);
        results.push(market);
      } catch {
        // Skip markets that fail to load
      }
    }

    // If no specific markets configured, fetch active markets
    if (results.length === 0 && marketIds.length === 0) {
      try {
        const response = await this.client.getMarkets({ active: true, limit: 20 });
        results.push(...response.data);
      } catch {
        // Swallow – we'll retry next tick
      }
    }

    return results;
  }

  /**
   * Refresh statuses of all currently open orders.
   * Moves filled/cancelled orders out of the openOrders array.
   */
  private async refreshOpenOrders(): Promise<void> {
    // In a real implementation, query the CLOB API for each order's status.
    // For now, filter out any orders that have been marked as completed.
    this.openOrders = this.openOrders.filter(
      (o) => o.status === "pending" || o.status === "submitted",
    );
  }

  /**
   * Cancel all remaining open orders (used on stop).
   */
  private async cancelAllOpenOrders(): Promise<void> {
    for (const order of this.openOrders) {
      order.status = "cancelled";
    }
    this.openOrders = [];
  }

  /**
   * Compute total dollar exposure across all positions.
   */
  private getTotalExposure(): number {
    let total = 0;
    for (const [, pos] of this.positions) {
      total += pos.size * (pos.currentPrice ?? pos.avgEntryPrice);
    }
    return total;
  }

  /**
   * Reset daily PnL counter at the start of a new calendar day.
   */
  private maybeResetDailyPnL(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.dailyPnLResetDate) {
      this.dailyPnL = 0;
      this.dailyPnLResetDate = today;
    }
  }
}
