/** Simplified types for the trading bot UI layer. */

export interface MarketOutcomeUI {
  id: string;
  name: string;
  price: number;
  tokenId: string;
}

export interface PolymarketMarket {
  conditionId: string;
  questionId: string;
  title: string;
  description: string;
  category: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  outcomes: MarketOutcomeUI[];
  volume: number;
  liquidity: number;
  createdAt: string;
}

export interface BotConfig {
  id: string;
  name: string;
  strategy:
    | "value"
    | "market_making"
    | "momentum"
    | "mean_reversion"
    | "arbitrage";
  strategyParams: Record<string, number>;
  riskLimits: RiskLimits;
  mode: "paper" | "live";
  status: "idle" | "running" | "paused" | "error";
  initialBalance: number;
  currentBalance: number;
  intervalMs: number;
  createdAt: string;
}

export interface RiskLimits {
  maxPositionSize: number;
  maxDailyLoss: number;
  maxOpenOrders: number;
  stopLossPct: number;
  maxDrawdownPct?: number;
}

export interface Position {
  id: string;
  botId: string;
  marketId: string;
  marketTitle: string;
  tokenId: string;
  outcome: string;
  side: "buy" | "sell";
  avgEntryPrice: number;
  currentPrice: number;
  size: number;
  unrealizedPnl: number;
  openedAt: string;
}

export interface TradeRecord {
  id: string;
  botId: string;
  marketId: string;
  marketTitle: string;
  tokenId: string;
  side: "buy" | "sell";
  price: number;
  size: number;
  total: number;
  fee: number;
  pnl: number | null;
  status: "pending" | "filled" | "partial" | "cancelled" | "failed";
  executedAt: string;
  reason: string;
}

export interface PortfolioSummary {
  totalBalance: number;
  availableBalance: number;
  totalInvested: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalPnl: number;
  winRate: number;
  totalTrades: number;
  openPositions: number;
  maxDrawdown: number;
  sharpeRatio: number;
}

export interface PerformanceSnapshot {
  id: string;
  botId: string;
  balance: number;
  totalPnl: number;
  winRate: number;
  totalTrades: number;
  openPositions: number;
  snapshotAt: string;
}
