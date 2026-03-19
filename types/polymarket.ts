// =============================================================================
// Polymarket Trading Bot - TypeScript Type Definitions
// =============================================================================

// -----------------------------------------------------------------------------
// Enums
// -----------------------------------------------------------------------------

/** The current operational status of the trading bot. */
export enum BotStatus {
  /** Bot is initialized but not actively trading. */
  Idle = "idle",
  /** Bot is actively monitoring markets and executing trades. */
  Running = "running",
  /** Bot has been temporarily suspended; no new orders will be placed. */
  Paused = "paused",
  /** Bot encountered a critical error and has stopped. */
  Error = "error",
}

/** Supported trading strategy types. */
export enum StrategyType {
  /** Continuously quotes both sides of the book to capture the bid-ask spread. */
  MarketMaking = "market_making",
  /** Follows recent price trends to enter directional positions. */
  MomentumTrading = "momentum_trading",
  /** Bets on price reverting to a historical mean after extreme moves. */
  MeanReversion = "mean_reversion",
  /** Exploits price discrepancies across related markets or outcomes. */
  ArbitrageDetection = "arbitrage_detection",
}

/** Direction of an order. */
export type OrderSide = "buy" | "sell";

/** How the order should be executed. */
export type OrderType = "limit" | "market" | "stop" | "stop_limit";

/** Lifecycle status of an order. */
export type OrderStatus =
  | "pending"
  | "open"
  | "partially_filled"
  | "filled"
  | "cancelled"
  | "expired"
  | "rejected";

// -----------------------------------------------------------------------------
// Market Types
// -----------------------------------------------------------------------------

/** Condition / resolution state of a Polymarket market. */
export interface MarketCondition {
  /** Unique identifier for the condition. */
  conditionId: string;
  /** Number of distinct outcomes (typically 2 for binary markets). */
  outcomeSlotCount: number;
  /** Whether the market has been resolved. */
  resolved: boolean;
  /** Index of the winning outcome, or `null` if unresolved. */
  winningOutcomeIndex: number | null;
  /** Block number at which resolution occurred, if applicable. */
  resolutionBlockNumber: number | null;
}

/** A single outcome within a market (e.g. "Yes" or "No"). */
export interface MarketOutcome {
  /** Display label for this outcome (e.g. "Yes", "No", "Trump", "Biden"). */
  label: string;
  /** ERC-1155 token ID representing this outcome. */
  tokenId: string;
  /** Current best bid price (0-1 scale). */
  bestBidPrice: number;
  /** Current best ask price (0-1 scale). */
  bestAskPrice: number;
  /** Mid-point of best bid and ask. */
  midPrice: number;
  /** 24-hour trading volume in USDC. */
  volume24h: number;
  /** Total liquidity available across the order book in USDC. */
  liquidity: number;
}

/** Represents a prediction market on Polymarket. */
export interface PolymarketMarket {
  /** Unique market identifier (CLOB market ID). */
  marketId: string;
  /** On-chain condition information. */
  condition: MarketCondition;
  /** Human-readable question the market poses. */
  question: string;
  /** Longer description providing context and resolution criteria. */
  description: string;
  /** Category tag (e.g. "Politics", "Crypto", "Sports"). */
  category: string;
  /** Available outcomes and their current pricing. */
  outcomes: MarketOutcome[];
  /** Total volume traded across all outcomes in USDC. */
  totalVolume: number;
  /** Total liquidity across all outcomes in USDC. */
  totalLiquidity: number;
  /** ISO-8601 timestamp when the market was created. */
  createdAt: string;
  /** ISO-8601 timestamp when the market is scheduled to close/resolve. */
  endDate: string;
  /** Whether the market is currently accepting orders. */
  active: boolean;
  /** Whether the market has been resolved. */
  resolved: boolean;
}

// -----------------------------------------------------------------------------
// Order Types
// -----------------------------------------------------------------------------

/** An order submitted to the Polymarket CLOB. */
export interface Order {
  /** Unique order identifier assigned by the exchange. */
  orderId: string;
  /** Market this order belongs to. */
  marketId: string;
  /** Token ID of the specific outcome being traded. */
  tokenId: string;
  /** Buy or sell. */
  side: OrderSide;
  /** How the order is executed. */
  type: OrderType;
  /** Limit price (0-1 scale). Required for limit and stop_limit orders. */
  price: number | null;
  /** Trigger price for stop and stop_limit orders. */
  stopPrice: number | null;
  /** Total size of the order in outcome tokens. */
  size: number;
  /** Amount of the order that has been filled so far. */
  filledSize: number;
  /** Current status. */
  status: OrderStatus;
  /** ISO-8601 timestamp when the order was created. */
  createdAt: string;
  /** ISO-8601 timestamp of the last status update. */
  updatedAt: string;
  /** Time-in-force policy (e.g. "GTC", "IOC", "FOK"). */
  timeInForce: "GTC" | "IOC" | "FOK";
  /** Optional client-assigned identifier for correlation. */
  clientOrderId?: string;
}

/** Details of a single trade execution (fill). */
export interface TradeExecution {
  /** Unique execution / fill identifier. */
  executionId: string;
  /** The order that was (partially) filled. */
  orderId: string;
  /** Market identifier. */
  marketId: string;
  /** Token ID of the outcome traded. */
  tokenId: string;
  /** Side of the order that was filled. */
  side: OrderSide;
  /** Price at which this fill occurred (0-1 scale). */
  price: number;
  /** Number of tokens filled in this execution. */
  size: number;
  /** Fee paid for this execution in USDC. */
  fee: number;
  /** ISO-8601 timestamp of the execution. */
  executedAt: string;
  /** On-chain transaction hash, if available. */
  transactionHash: string | null;
}

// -----------------------------------------------------------------------------
// Strategy Parameters
// -----------------------------------------------------------------------------

/** Parameters for the market-making strategy. */
export interface MarketMakingParams {
  /** Half-spread to apply around the mid price (e.g. 0.02 = 2%). */
  spread: number;
  /** Maximum absolute position size (in outcome tokens) the strategy may hold. */
  max_position: number;
  /** Minimum liquidity (USDC) a market must have to be eligible. */
  min_liquidity: number;
  /** How frequently to refresh quotes, in milliseconds. */
  refreshIntervalMs?: number;
  /** Number of price levels to quote on each side. */
  orderLevels?: number;
}

/** Parameters for the momentum-trading strategy. */
export interface MomentumTradingParams {
  /** Number of past data points (e.g. candles or ticks) used to detect trends. */
  lookback_period: number;
  /** Minimum price change ratio over the lookback to trigger entry. */
  threshold: number;
  /** Size of each position to open, in outcome tokens. */
  position_size: number;
  /** Optional cooldown in milliseconds between consecutive trades. */
  cooldownMs?: number;
}

/** Parameters for the mean-reversion strategy. */
export interface MeanReversionParams {
  /** Rolling window size (number of observations) for computing the mean. */
  window: number;
  /** Number of standard deviations from the mean required to trigger a trade. */
  std_dev_threshold: number;
  /** Size of each position to open, in outcome tokens. */
  position_size: number;
  /** Optional z-score at which to take profit. */
  takeProfitZScore?: number;
}

/** Parameters for the arbitrage-detection strategy. */
export interface ArbitrageDetectionParams {
  /** Minimum spread (price discrepancy) required to consider an arb opportunity. */
  min_spread: number;
  /** Maximum total exposure (USDC) across all arbitrage positions. */
  max_exposure: number;
  /** Token IDs or market IDs to monitor for cross-market arb, if applicable. */
  watchList?: string[];
}

/** Union of all strategy parameter types. */
export type StrategyParams =
  | MarketMakingParams
  | MomentumTradingParams
  | MeanReversionParams
  | ArbitrageDetectionParams;

// -----------------------------------------------------------------------------
// Trading Strategy
// -----------------------------------------------------------------------------

/** Describes a configured trading strategy and its parameters. */
export interface TradingStrategy {
  /** Unique name for this strategy instance. */
  name: string;
  /** Which strategy algorithm to use. */
  type: StrategyType;
  /** Whether this strategy is currently active. */
  enabled: boolean;
  /** Strategy-specific parameters. */
  params: StrategyParams;
  /** Optional list of market IDs this strategy is restricted to. */
  marketIds?: string[];
}

// -----------------------------------------------------------------------------
// Risk Management
// -----------------------------------------------------------------------------

/** Risk limits enforced by the bot to prevent catastrophic losses. */
export interface RiskLimits {
  /** Maximum position size in outcome tokens for any single market. */
  max_position_size: number;
  /** Maximum cumulative realized + unrealized loss allowed in a single day (USDC). */
  max_daily_loss: number;
  /** Maximum number of open orders across all markets. */
  max_open_orders: number;
  /** Stop-loss percentage (0-1 scale). Positions are closed if loss exceeds this. */
  stop_loss_pct: number;
  /** Optional maximum notional exposure across the entire portfolio (USDC). */
  maxPortfolioExposure?: number;
  /** Optional per-trade size cap in USDC. */
  maxTradeSize?: number;
}

// -----------------------------------------------------------------------------
// Bot Configuration
// -----------------------------------------------------------------------------

/** Top-level configuration for the Polymarket trading bot. */
export interface BotConfig {
  /** Unique identifier for this bot instance. */
  botId: string;
  /** Human-readable name for the bot. */
  name: string;
  /** Polymarket CLOB API base URL. */
  apiUrl: string;
  /** WebSocket endpoint for real-time market data. */
  wsUrl: string;
  /** API key for authentication. */
  apiKey: string;
  /** API secret for signing requests. */
  apiSecret: string;
  /** Optional passphrase required by some auth schemes. */
  passphrase?: string;
  /** Chain ID for the underlying blockchain (e.g. 137 for Polygon). */
  chainId: number;
  /** Active trading strategies. */
  strategies: TradingStrategy[];
  /** Risk limits applied globally across all strategies. */
  riskLimits: RiskLimits;
  /** How often the bot's main loop ticks, in milliseconds. */
  pollingIntervalMs: number;
  /** Whether to operate in dry-run mode (simulate trades without submitting). */
  dryRun: boolean;
  /** Optional logging level. */
  logLevel?: "debug" | "info" | "warn" | "error";
}

// -----------------------------------------------------------------------------
// Position Tracking
// -----------------------------------------------------------------------------

/** A position in a single outcome token. */
export interface Position {
  /** Market identifier. */
  marketId: string;
  /** Token ID of the outcome. */
  tokenId: string;
  /** Human-readable outcome label. */
  outcomeLabel: string;
  /** Signed quantity held (positive = long, negative = short). */
  size: number;
  /** Volume-weighted average entry price (0-1 scale). */
  averageEntryPrice: number;
  /** Current mark / mid price of the outcome. */
  currentPrice: number;
  /** Unrealized profit or loss in USDC. */
  unrealizedPnl: number;
  /** Realized profit or loss in USDC (from partial closes). */
  realizedPnl: number;
  /** ISO-8601 timestamp when the position was first opened. */
  openedAt: string;
  /** ISO-8601 timestamp of the most recent fill affecting this position. */
  lastUpdatedAt: string;
}

/** Aggregated summary of the bot's portfolio. */
export interface PortfolioSummary {
  /** Total portfolio value in USDC (cash + mark-to-market of positions). */
  totalValue: number;
  /** Available (unallocated) USDC balance. */
  availableBalance: number;
  /** Sum of all unrealized PnL across positions, in USDC. */
  totalUnrealizedPnl: number;
  /** Sum of all realized PnL across positions, in USDC. */
  totalRealizedPnl: number;
  /** Number of currently open positions. */
  openPositionCount: number;
  /** All open positions. */
  positions: Position[];
  /** ISO-8601 timestamp of the last portfolio snapshot. */
  snapshotAt: string;
}

// -----------------------------------------------------------------------------
// Trade History
// -----------------------------------------------------------------------------

/** Immutable record of a completed trade, stored for auditing and analysis. */
export interface TradeRecord {
  /** Unique trade record identifier. */
  tradeId: string;
  /** The execution that triggered this record. */
  executionId: string;
  /** Market identifier. */
  marketId: string;
  /** Token ID of the outcome traded. */
  tokenId: string;
  /** Human-readable outcome label. */
  outcomeLabel: string;
  /** Buy or sell. */
  side: OrderSide;
  /** Execution price (0-1 scale). */
  price: number;
  /** Number of tokens traded. */
  size: number;
  /** Fee paid in USDC. */
  fee: number;
  /** Realized PnL from this trade in USDC (0 for position-opening trades). */
  realizedPnl: number;
  /** Cumulative realized PnL after this trade. */
  cumulativePnl: number;
  /** Name of the strategy that originated this trade. */
  strategyName: string;
  /** ISO-8601 timestamp when the trade was executed. */
  executedAt: string;
  /** ISO-8601 timestamp when this record was persisted. */
  recordedAt: string;
  /** On-chain transaction hash, if available. */
  transactionHash: string | null;
}

// -----------------------------------------------------------------------------
// WebSocket Event Types
// -----------------------------------------------------------------------------

/** Discriminated union tag for all WebSocket events. */
export type WsEventType =
  | "price_update"
  | "trade"
  | "order_book_snapshot"
  | "order_book_delta"
  | "order_update"
  | "market_resolution"
  | "heartbeat"
  | "error";

/** Base shape shared by every WebSocket event. */
export interface WsEventBase {
  /** Discriminator for the event type. */
  type: WsEventType;
  /** ISO-8601 timestamp from the server. */
  timestamp: string;
}

/** Real-time price tick for an outcome. */
export interface WsPriceUpdateEvent extends WsEventBase {
  type: "price_update";
  /** Market identifier. */
  marketId: string;
  /** Token ID of the outcome. */
  tokenId: string;
  /** Updated best bid price. */
  bestBidPrice: number;
  /** Updated best ask price. */
  bestAskPrice: number;
  /** Updated mid price. */
  midPrice: number;
  /** Last traded price. */
  lastTradePrice: number;
}

/** A trade that occurred on the exchange. */
export interface WsTradeEvent extends WsEventBase {
  type: "trade";
  /** Market identifier. */
  marketId: string;
  /** Token ID of the outcome. */
  tokenId: string;
  /** Trade price (0-1 scale). */
  price: number;
  /** Trade size in outcome tokens. */
  size: number;
  /** Side of the taker order. */
  takerSide: OrderSide;
}

/** A single price level in the order book. */
export interface OrderBookLevel {
  /** Price at this level (0-1 scale). */
  price: number;
  /** Total size available at this level. */
  size: number;
}

/** Full order book snapshot. */
export interface WsOrderBookSnapshotEvent extends WsEventBase {
  type: "order_book_snapshot";
  /** Market identifier. */
  marketId: string;
  /** Token ID of the outcome. */
  tokenId: string;
  /** All bid levels sorted by price descending. */
  bids: OrderBookLevel[];
  /** All ask levels sorted by price ascending. */
  asks: OrderBookLevel[];
}

/** Incremental order book update. */
export interface WsOrderBookDeltaEvent extends WsEventBase {
  type: "order_book_delta";
  /** Market identifier. */
  marketId: string;
  /** Token ID of the outcome. */
  tokenId: string;
  /** Changed bid levels (size = 0 means removal). */
  bids: OrderBookLevel[];
  /** Changed ask levels (size = 0 means removal). */
  asks: OrderBookLevel[];
}

/** Status update for one of the bot's own orders. */
export interface WsOrderUpdateEvent extends WsEventBase {
  type: "order_update";
  /** The full updated order object. */
  order: Order;
}

/** Notification that a market has been resolved. */
export interface WsMarketResolutionEvent extends WsEventBase {
  type: "market_resolution";
  /** Market identifier. */
  marketId: string;
  /** Index of the winning outcome. */
  winningOutcomeIndex: number;
  /** Label of the winning outcome. */
  winningOutcomeLabel: string;
}

/** Keep-alive heartbeat from the server. */
export interface WsHeartbeatEvent extends WsEventBase {
  type: "heartbeat";
}

/** Error reported over the WebSocket connection. */
export interface WsErrorEvent extends WsEventBase {
  type: "error";
  /** Error code. */
  code: number;
  /** Human-readable error message. */
  message: string;
}

/** Discriminated union of all possible WebSocket events. */
export type WsEvent =
  | WsPriceUpdateEvent
  | WsTradeEvent
  | WsOrderBookSnapshotEvent
  | WsOrderBookDeltaEvent
  | WsOrderUpdateEvent
  | WsMarketResolutionEvent
  | WsHeartbeatEvent
  | WsErrorEvent;

/** Callback signature for handling incoming WebSocket events. */
export type WsEventHandler = (event: WsEvent) => void;

/** Configuration for establishing a WebSocket subscription. */
export interface WsSubscription {
  /** Market IDs to subscribe to. */
  marketIds: string[];
  /** Which event types to receive. An empty array means all types. */
  eventTypes: WsEventType[];
  /** Handler invoked for each received event. */
  onEvent: WsEventHandler;
  /** Handler invoked if the connection drops unexpectedly. */
  onDisconnect?: (reason: string) => void;
  /** Handler invoked when the connection is (re)established. */
  onConnect?: () => void;
  /** Whether to automatically reconnect on disconnect. Defaults to true. */
  autoReconnect?: boolean;
  /** Delay before attempting reconnection, in milliseconds. */
  reconnectDelayMs?: number;
}
