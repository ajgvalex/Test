#!/usr/bin/env npx tsx
// =============================================================================
// Polymarket Paper Trading Bot Runner
// =============================================================================
//
// Usage:
//   npx tsx scripts/run-bot.ts                        # default: mean_reversion
//   npx tsx scripts/run-bot.ts --strategy momentum
//   npx tsx scripts/run-bot.ts --strategy value --balance 50
//   npx tsx scripts/run-bot.ts --interval 60           # tick every 60 seconds
//
// =============================================================================

import {
  createStrategy,
  type StrategyType,
  type PricePoint,
} from "../lib/polymarket/strategies";

// -----------------------------------------------------------------------------
// CLI argument parsing
// -----------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    strategy: "mean_reversion" as StrategyType,
    balance: 50,
    interval: 30, // seconds between ticks
    maxPositionSize: 10,
    maxDailyLoss: 5,
    limit: 5, // number of markets to scan
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--strategy":
      case "-s":
        opts.strategy = args[++i] as StrategyType;
        break;
      case "--balance":
      case "-b":
        opts.balance = Number(args[++i]);
        break;
      case "--interval":
      case "-i":
        opts.interval = Number(args[++i]);
        break;
      case "--limit":
      case "-l":
        opts.limit = Number(args[++i]);
        break;
      case "--help":
      case "-h":
        console.log(`
Polymarket Paper Trading Bot

Options:
  --strategy, -s   Strategy: mean_reversion | momentum | value | market_making (default: mean_reversion)
  --balance, -b    Starting balance in USD (default: 50)
  --interval, -i   Seconds between ticks (default: 30)
  --limit, -l      Number of markets to scan (default: 10)
  --help, -h       Show this help
`);
        process.exit(0);
    }
  }
  return opts;
}

// -----------------------------------------------------------------------------
// Polymarket API helpers
// -----------------------------------------------------------------------------

const API_BASE = process.env.POLYMARKET_API_URL ?? "https://clob.polymarket.com";

interface ClobMarket {
  condition_id: string;
  question: string;
  description: string;
  market_slug: string;
  end_date_iso: string;
  active: boolean;
  closed: boolean;
  tokens: { token_id: string; outcome: string; price: number }[];
  volume_num_min: number;
  liquidity_num_min: number;
}

interface ClobOrderBook {
  bids: { price: string; size: string }[];
  asks: { price: string; size: string }[];
}

async function fetchJson<T>(path: string, query?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

async function getActiveMarkets(limit: number): Promise<ClobMarket[]> {
  const data = await fetchJson<ClobMarket[] | { data: ClobMarket[] }>(
    "/markets",
    { limit: String(limit), active: "true" },
  );
  return Array.isArray(data) ? data : data.data ?? [];
}

async function getOrderBook(tokenId: string): Promise<ClobOrderBook> {
  return fetchJson<ClobOrderBook>("/book", { token_id: tokenId });
}

async function getMidpoint(tokenId: string): Promise<number> {
  const data = await fetchJson<{ mid: number }>("/midpoint", { token_id: tokenId });
  return data.mid;
}

// -----------------------------------------------------------------------------
// Console formatting helpers
// -----------------------------------------------------------------------------

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";

function log(msg: string) {
  const ts = new Date().toLocaleTimeString();
  console.log(`${DIM}[${ts}]${RESET} ${msg}`);
}

function logHeader(msg: string) {
  console.log(`\n${BOLD}${CYAN}${"=".repeat(60)}${RESET}`);
  console.log(`${BOLD}${CYAN}  ${msg}${RESET}`);
  console.log(`${BOLD}${CYAN}${"=".repeat(60)}${RESET}\n`);
}

function logSignal(marketQuestion: string, action: string, reason: string) {
  const color = action === "buy" ? GREEN : action === "sell" ? RED : YELLOW;
  const icon = action === "buy" ? "BUY " : action === "sell" ? "SELL" : "HOLD";
  console.log(`  ${color}${BOLD}[${icon}]${RESET} ${marketQuestion}`);
  console.log(`         ${DIM}${reason}${RESET}`);
}

// -----------------------------------------------------------------------------
// Paper position tracker
// -----------------------------------------------------------------------------

interface PaperPosition {
  marketId: string;
  question: string;
  tokenId: string;
  outcome: string;
  side: "buy" | "sell";
  size: number;
  entryPrice: number;
  currentPrice: number;
}

interface PaperPortfolio {
  initialBalance: number;
  cashBalance: number;
  positions: PaperPosition[];
  realizedPnL: number;
  tradeCount: number;
  winCount: number;
}

function getUnrealizedPnL(portfolio: PaperPortfolio): number {
  return portfolio.positions.reduce((sum, p) => {
    const pnl = (p.currentPrice - p.entryPrice) * p.size * (p.side === "buy" ? 1 : -1);
    return sum + pnl;
  }, 0);
}

function printPortfolio(portfolio: PaperPortfolio) {
  const unrealized = getUnrealizedPnL(portfolio);
  const totalValue = portfolio.cashBalance + unrealized;
  const totalPnL = totalValue - portfolio.initialBalance;
  const pnlColor = totalPnL >= 0 ? GREEN : RED;

  console.log(`\n${BOLD}${MAGENTA}--- Portfolio ---${RESET}`);
  console.log(`  Cash:          $${portfolio.cashBalance.toFixed(2)}`);
  console.log(`  Positions:     ${portfolio.positions.length}`);
  console.log(`  Unrealized:    ${pnlColor}$${unrealized.toFixed(2)}${RESET}`);
  console.log(`  Realized:      ${portfolio.realizedPnL >= 0 ? GREEN : RED}$${portfolio.realizedPnL.toFixed(2)}${RESET}`);
  console.log(`  Total Value:   ${pnlColor}$${totalValue.toFixed(2)}${RESET}`);
  console.log(`  Total PnL:     ${pnlColor}${totalPnL >= 0 ? "+" : ""}$${totalPnL.toFixed(2)} (${((totalPnL / portfolio.initialBalance) * 100).toFixed(1)}%)${RESET}`);
  console.log(`  Trades:        ${portfolio.tradeCount} (${portfolio.winCount} wins)`);
  console.log();
}

// -----------------------------------------------------------------------------
// Generate synthetic price history from a single price point
// (In production, you'd fetch real historical data)
// -----------------------------------------------------------------------------

function generatePriceHistory(currentPrice: number, points: number = 30): PricePoint[] {
  const history: PricePoint[] = [];
  const now = Date.now();
  let price = currentPrice * (0.9 + Math.random() * 0.2); // start slightly off

  for (let i = 0; i < points; i++) {
    // Random walk toward current price
    const drift = (currentPrice - price) * 0.05;
    const noise = (Math.random() - 0.5) * 0.02;
    price = Math.max(0.01, Math.min(0.99, price + drift + noise));

    history.push({
      timestamp: now - (points - i) * 60_000,
      price,
      volume: 1000 + Math.random() * 5000,
    });
  }

  // Ensure last point matches current price
  history[history.length - 1].price = currentPrice;

  return history;
}

// -----------------------------------------------------------------------------
// Main bot loop
// -----------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();

  logHeader(`Polymarket Paper Trading Bot`);
  log(`Strategy:     ${BOLD}${opts.strategy}${RESET}`);
  log(`Balance:      ${BOLD}$${opts.balance}${RESET}`);
  log(`Interval:     ${BOLD}${opts.interval}s${RESET}`);
  log(`Markets:      ${BOLD}${opts.limit}${RESET}`);
  log(`Mode:         ${BOLD}${GREEN}PAPER (simulation)${RESET}`);
  console.log();

  // Create strategy with conservative settings for $50
  const strategy = createStrategy(opts.strategy, {
    maxPositionSize: opts.maxPositionSize,
    maxTotalExposure: opts.balance * 0.6, // max 60% of balance in positions
    riskPerTrade: 0.04, // risk 4% per trade ($2 on $50)
  });

  log(`Strategy initialized: ${BOLD}${strategy.name}${RESET}`);

  // Initialize paper portfolio
  const portfolio: PaperPortfolio = {
    initialBalance: opts.balance,
    cashBalance: opts.balance,
    positions: [],
    realizedPnL: 0,
    tradeCount: 0,
    winCount: 0,
  };

  // Graceful shutdown
  let running = true;
  process.on("SIGINT", () => {
    log(`\n${YELLOW}Shutting down...${RESET}`);
    running = false;
  });

  let tickNumber = 0;

  while (running) {
    tickNumber++;
    logHeader(`Tick #${tickNumber}`);

    try {
      // 1. Fetch active markets
      log("Fetching active markets...");
      const markets = await getActiveMarkets(opts.limit);
      log(`Found ${BOLD}${markets.length}${RESET} active markets`);

      if (markets.length === 0) {
        log(`${YELLOW}No active markets found. Retrying in ${opts.interval}s...${RESET}`);
        await sleep(opts.interval * 1000);
        continue;
      }

      // 2. Update existing position prices
      for (const pos of portfolio.positions) {
        try {
          pos.currentPrice = await getMidpoint(pos.tokenId);
        } catch {
          // keep last known price
        }
      }

      // 3. Analyze each market
      console.log(`\n${BOLD}  Signals:${RESET}`);
      let signalCount = 0;
      let skippedCount = 0;

      for (const market of markets) {
        if (!market.tokens || market.tokens.length === 0) continue;

        const token = market.tokens[0];
        const tokenId = token.token_id;

        if (!tokenId) continue;

        try {
          // Fetch the current price (not included in /markets response)
          const currentPrice = token.price || (await getMidpoint(tokenId));

          if (!currentPrice || currentPrice <= 0.01 || currentPrice >= 0.99) {
            skippedCount++;
            continue;
          }

          // Fetch order book
          const orderBook = await getOrderBook(tokenId);

          // Generate price history (synthetic for now)
          const priceHistory = generatePriceHistory(currentPrice);

          // Build a market object compatible with the strategy
          const marketForStrategy = {
            marketId: market.condition_id,
            condition: {
              conditionId: market.condition_id,
              outcomeSlotCount: market.tokens.length,
              resolved: false,
              winningOutcomeIndex: null,
              resolutionBlockNumber: null,
            },
            question: market.question,
            description: market.description ?? "",
            category: "",
            outcomes: market.tokens.map((t) => ({
              label: t.outcome,
              tokenId: t.token_id,
              bestBidPrice: 0,
              bestAskPrice: 0,
              midPrice: t.price,
              volume24h: 0,
              liquidity: 0,
            })),
            totalVolume: 0,
            totalLiquidity: 0,
            createdAt: "",
            endDate: market.end_date_iso ?? "",
            active: true,
            resolved: false,
            // The strategies access market.tokens directly
            tokens: market.tokens,
          };

          // Run strategy analysis
          const signal = strategy.analyze(
            marketForStrategy as any,
            orderBook as any,
            priceHistory,
          );

          signalCount++;
          const shortQ = market.question.length > 55
            ? market.question.substring(0, 55) + "..."
            : market.question;
          logSignal(shortQ, signal.action, signal.reason);

          // Execute paper trade if signal is actionable
          if (signal.action !== "hold" && signal.size > 0 && signal.confidence > 0.5) {
            const cost = signal.price * signal.size;

            // Check if we have enough cash
            if (signal.action === "buy" && cost > portfolio.cashBalance) {
              log(`  ${DIM}-> Skipped: insufficient cash ($${portfolio.cashBalance.toFixed(2)} < $${cost.toFixed(2)})${RESET}`);
              continue;
            }

            // Check daily loss limit
            const unrealized = getUnrealizedPnL(portfolio);
            const totalPnL = portfolio.cashBalance + unrealized - portfolio.initialBalance;
            if (totalPnL < -opts.maxDailyLoss) {
              log(`  ${RED}-> Daily loss limit hit ($${totalPnL.toFixed(2)}). Halting new trades.${RESET}`);
              continue;
            }

            // Execute paper trade
            if (signal.action === "buy") {
              portfolio.cashBalance -= cost;
              portfolio.positions.push({
                marketId: market.condition_id,
                question: market.question,
                tokenId,
                outcome: token.outcome,
                side: "buy",
                size: signal.size,
                entryPrice: signal.price,
                currentPrice: signal.price,
              });
              portfolio.tradeCount++;
              log(`  ${GREEN}-> PAPER BUY: ${signal.size.toFixed(2)} @ $${signal.price.toFixed(4)} = $${cost.toFixed(2)}${RESET}`);
            } else {
              // Check if we have a position to sell
              const posIdx = portfolio.positions.findIndex(
                (p) => p.tokenId === tokenId && p.side === "buy",
              );
              if (posIdx >= 0) {
                const pos = portfolio.positions[posIdx];
                const revenue = signal.price * pos.size;
                const pnl = (signal.price - pos.entryPrice) * pos.size;
                portfolio.cashBalance += revenue;
                portfolio.realizedPnL += pnl;
                if (pnl > 0) portfolio.winCount++;
                portfolio.tradeCount++;
                portfolio.positions.splice(posIdx, 1);
                log(`  ${RED}-> PAPER SELL: ${pos.size.toFixed(2)} @ $${signal.price.toFixed(4)} | PnL: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}${RESET}`);
              }
            }
          }
        } catch (err) {
          // Skip markets that fail silently
          continue;
        }
      }

      if (signalCount === 0) {
        log(`${DIM}No markets with valid data to analyze (${skippedCount} skipped)${RESET}`);
      } else {
        log(`Analyzed ${signalCount} markets (${skippedCount} skipped)`);
      }

      // 4. Check stop-losses on existing positions
      for (let i = portfolio.positions.length - 1; i >= 0; i--) {
        const pos = portfolio.positions[i];
        const lossPct = (pos.currentPrice - pos.entryPrice) / pos.entryPrice;
        if (lossPct < -0.15) {
          // Stop loss triggered
          const revenue = pos.currentPrice * pos.size;
          const pnl = (pos.currentPrice - pos.entryPrice) * pos.size;
          portfolio.cashBalance += revenue;
          portfolio.realizedPnL += pnl;
          portfolio.tradeCount++;
          portfolio.positions.splice(i, 1);
          log(`  ${RED}${BOLD}-> STOP LOSS: ${pos.question.substring(0, 40)}... | PnL: $${pnl.toFixed(2)}${RESET}`);
        }
      }

      // 5. Print portfolio summary
      printPortfolio(portfolio);

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`${RED}Error: ${msg}${RESET}`);
    }

    if (!running) break;

    // Wait for next tick
    log(`${DIM}Next tick in ${opts.interval}s... (Ctrl+C to stop)${RESET}`);
    await sleep(opts.interval * 1000);
  }

  // Final summary
  logHeader("Final Summary");
  printPortfolio(portfolio);
  log("Bot stopped. Goodbye!");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run
main().catch((err) => {
  console.error(`${RED}Fatal error: ${err}${RESET}`);
  process.exit(1);
});
