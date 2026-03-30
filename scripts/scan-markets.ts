#!/usr/bin/env npx tsx
// =============================================================================
// Polymarket Market Scanner - AI Sentiment Analysis
// =============================================================================
//
// Scans active Polymarket markets, uses Claude to estimate the real
// probability based on its knowledge, and suggests mispriced markets.
//
// Usage:
//   npx tsx scripts/scan-markets.ts
//   npx tsx scripts/scan-markets.ts --limit 20
//   npx tsx scripts/scan-markets.ts --min-edge 0.05
//
// =============================================================================

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import Anthropic from "@anthropic-ai/sdk";
import { ethers } from "ethers";
import { ClobClient } from "@polymarket/clob-client";
import { SignatureType } from "@polymarket/clob-client/dist/order-utils/model/signature-types.model";
import { Chain, Side, OrderType, AssetType } from "@polymarket/clob-client/dist/types";

// -----------------------------------------------------------------------------
// Load .env.local automatically
// -----------------------------------------------------------------------------

function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  try {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local not found, rely on exported vars
  }
}

loadEnvFile();

// -----------------------------------------------------------------------------
// CLI argument parsing
// -----------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    limit: 100,
    minEdge: 0.05, // minimum 5% edge to suggest
    balance: 50,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--limit":
      case "-l":
        opts.limit = Number(args[++i]);
        break;
      case "--min-edge":
      case "-e":
        opts.minEdge = Number(args[++i]);
        break;
      case "--balance":
      case "-b":
        opts.balance = Number(args[++i]);
        break;
      case "--help":
      case "-h":
        console.log(`
Polymarket Market Scanner

Analyzes active markets using AI to find mispriced opportunities.

Options:
  --limit, -l      Number of markets to fetch from API (default: 20)
  --min-edge, -e   Minimum edge to show, e.g. 0.10 = 10% (default: 0.05)
  --balance, -b    Your balance for position sizing (default: 50)
  --help, -h       Show this help
`);
        process.exit(0);
    }
  }
  return opts;
}

// -----------------------------------------------------------------------------
// Polymarket APIs
// -----------------------------------------------------------------------------

const CLOB_BASE = process.env.POLYMARKET_API_URL ?? "https://clob.polymarket.com";
const GAMMA_BASE = "https://gamma-api.polymarket.com";

interface ClobToken {
  token_id: string;
  outcome: string;
  price?: number;
}

interface ClobMarket {
  condition_id: string;
  question: string;
  description: string;
  market_slug: string;
  end_date_iso: string;
  active: boolean;
  closed: boolean;
  tokens: ClobToken[];
}

// Gamma API returns richer market data with current prices
interface GammaMarket {
  id: string;
  question: string;
  description: string;
  conditionId: string;
  slug: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  volume: number;
  liquidity: number;
  outcomePrices: string; // JSON string like "[0.55, 0.45]"
  outcomes: string; // JSON string like '["Yes","No"]'
  clobTokenIds: string; // JSON string like '["tokenid1","tokenid2"]'
}

async function fetchJson<T>(baseUrl: string, path: string, query?: Record<string, string>): Promise<T> {
  const url = new URL(`${baseUrl}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

async function getActiveMarkets(limit: number): Promise<ClobMarket[]> {
  // Use Gamma API - returns currently active, popular markets with prices
  const gammaMarkets = await fetchJson<GammaMarket[]>(
    GAMMA_BASE,
    "/markets",
    {
      limit: String(limit),
      active: "true",
      closed: "false",
      order: "volume",
      ascending: "false",
    },
  );

  log(`Gamma API returned ${BOLD}${gammaMarkets.length}${RESET} active markets`);

  // Convert to ClobMarket format with prices
  const now = new Date();
  return gammaMarkets
    .filter((m) => {
      if (!m.conditionId || !m.clobTokenIds) return false;
      if (m.endDate && new Date(m.endDate) < now) return false;
      return true;
    })
    .map((m) => {
      let prices: number[] = [];
      let outcomes: string[] = [];
      let tokenIds: string[] = [];

      try { prices = JSON.parse(m.outcomePrices); } catch { /* empty */ }
      try { outcomes = JSON.parse(m.outcomes); } catch { /* empty */ }
      try { tokenIds = JSON.parse(m.clobTokenIds); } catch { /* empty */ }

      const tokens: ClobToken[] = outcomes.map((outcome, i) => ({
        token_id: tokenIds[i] ?? "",
        outcome,
        price: prices[i] ?? 0,
      }));

      return {
        condition_id: m.conditionId,
        question: m.question,
        description: m.description ?? "",
        market_slug: m.slug ?? "",
        end_date_iso: m.endDate ?? "",
        active: m.active,
        closed: m.closed,
        tokens,
      };
    });
}

async function getMidpoint(tokenId: string): Promise<number> {
  const data = await fetchJson<{ mid: number }>(CLOB_BASE, "/midpoint", { token_id: tokenId });
  return data.mid;
}

// -----------------------------------------------------------------------------
// Fetch prices for markets in batches
// -----------------------------------------------------------------------------

interface MarketWithPrice {
  market: ClobMarket;
  yesPrice: number;
  noPrice: number;
}

async function enrichMarketPrices(markets: ClobMarket[]): Promise<MarketWithPrice[]> {
  const results: MarketWithPrice[] = [];

  for (const market of markets) {
    if (!market.tokens || market.tokens.length === 0) continue;

    const yesToken = market.tokens.find((t) => t.outcome === "Yes") ?? market.tokens[0];
    const noToken = market.tokens.find((t) => t.outcome === "No") ?? market.tokens[1];

    let yesPrice = yesToken?.price ?? 0;

    // If price not in market data, fetch midpoint
    if (!yesPrice && yesToken?.token_id) {
      try {
        yesPrice = await getMidpoint(yesToken.token_id);
        await new Promise((r) => setTimeout(r, 150));
      } catch {
        continue;
      }
    }

    if (!yesPrice || yesPrice <= 0.02 || yesPrice >= 0.98) continue;

    const noPrice = noToken?.price ?? 1 - yesPrice;
    results.push({ market, yesPrice, noPrice });
  }

  return results;
}

// -----------------------------------------------------------------------------
// Claude batch analysis (analyze multiple markets in one call)
// -----------------------------------------------------------------------------

const anthropic = new Anthropic();

interface MarketAnalysis {
  question: string;
  estimatedProbability: number;
  confidence: "low" | "medium" | "high";
  reasoning: string;
  keyFactors: string[];
}

async function analyzeMarketBatch(
  markets: { question: string; description: string; yesPrice: number }[],
): Promise<MarketAnalysis[]> {
  const marketList = markets
    .map(
      (m, i) =>
        `MARKET ${i + 1}:
  Question: ${m.question}
  Description: ${m.description.substring(0, 200)}
  Current YES price: ${(m.yesPrice * 100).toFixed(1)}%`,
    )
    .join("\n\n");

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `You are an expert prediction market analyst. Today is ${new Date().toISOString().slice(0, 10)}.

Analyze each market below. For each one, estimate the TRUE probability of YES happening based on your knowledge of current events, historical patterns, and any relevant context.

IMPORTANT RULES:
- Do NOT just echo the market price. Use your own independent judgment.
- If you think the market is correct, say so, but still give your own estimate.
- Be bold: prediction markets are often wrong, especially on less liquid markets.
- Use "medium" or "high" confidence when you have genuine knowledge about the topic.
- Only use "low" confidence when the topic is truly obscure or unknowable.
- Your estimates should be based on real-world knowledge, not on what the market says.

${marketList}

Respond with ONLY a JSON array (no markdown, no backticks, no explanation outside the array):
[
  {
    "question": "exact question text",
    "estimatedProbability": 0.XX,
    "confidence": "low|medium|high",
    "reasoning": "1-2 sentences explaining your estimate",
    "keyFactors": ["factor1", "factor2"]
  }
]

You MUST return one entry for each market, in the same order.`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    // Handle potential markdown wrapping
    const cleaned = text.replace(/^```json?\s*/, "").replace(/\s*```$/, "").trim();
    return JSON.parse(cleaned) as MarketAnalysis[];
  } catch {
    console.error(`  ${RED}Failed to parse Claude response${RESET}`);
    return [];
  }
}

// -----------------------------------------------------------------------------
// Kelly Criterion position sizing
// -----------------------------------------------------------------------------

function kellyBet(
  estimatedProb: number,
  marketPrice: number,
  balance: number,
): { fraction: number; suggestedBet: number; side: "YES" | "NO" } {
  const buyYes = estimatedProb > marketPrice;
  const p = buyYes ? estimatedProb : 1 - estimatedProb;
  const price = buyYes ? marketPrice : 1 - marketPrice;

  const b = 1 / price - 1;
  const q = 1 - p;
  const kelly = (b * p - q) / b;

  // Quarter-Kelly for safety, capped at 15% of balance
  const fraction = Math.max(0, kelly * 0.25);
  const suggestedBet = Math.min(fraction * balance, balance * 0.15);

  return {
    fraction,
    suggestedBet: Math.round(suggestedBet * 100) / 100,
    side: buyYes ? "YES" : "NO",
  };
}

// -----------------------------------------------------------------------------
// Console formatting
// -----------------------------------------------------------------------------

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";
const WHITE = "\x1b[37m";

function logHeader(msg: string) {
  console.log(`\n${BOLD}${CYAN}${"=".repeat(70)}${RESET}`);
  console.log(`${BOLD}${CYAN}  ${msg}${RESET}`);
  console.log(`${BOLD}${CYAN}${"=".repeat(70)}${RESET}\n`);
}

function log(msg: string) {
  const ts = new Date().toLocaleTimeString();
  console.log(`${DIM}[${ts}]${RESET} ${msg}`);
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();

  // Validate API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      `${RED}Error: ANTHROPIC_API_KEY not set.${RESET}\n` +
        `Either export it: export ANTHROPIC_API_KEY=sk-ant-...\n` +
        `Or add it to .env.local`,
    );
    process.exit(1);
  }

  logHeader("Polymarket Market Scanner");
  log(`Fetching up to ${BOLD}${opts.limit}${RESET} markets`);
  log(`Min edge: ${BOLD}${(opts.minEdge * 100).toFixed(0)}%${RESET}`);
  log(`Balance: ${BOLD}$${opts.balance}${RESET}`);
  console.log();

  // 1. Fetch open markets from Gamma API (popular, active markets with prices)
  log("Fetching active markets from Polymarket...");
  const openMarkets = await getActiveMarkets(opts.limit);
  log(`Found ${BOLD}${openMarkets.length}${RESET} open, tradeable markets`);

  // 2. Get prices for each market
  log("Fetching current prices...");
  const marketsWithPrices = await enrichMarketPrices(openMarkets);
  log(
    `${BOLD}${marketsWithPrices.length}${RESET} markets with valid prices`,
  );

  if (marketsWithPrices.length === 0) {
    log(`${RED}No markets with valid prices found.${RESET}`);
    return;
  }

  // 3. Analyze markets in batches with Claude
  const BATCH_SIZE = 8;
  const allAnalyses: {
    analysis: MarketAnalysis;
    market: ClobMarket;
    yesPrice: number;
  }[] = [];

  for (let batchStart = 0; batchStart < marketsWithPrices.length; batchStart += BATCH_SIZE) {
    const batch = marketsWithPrices.slice(batchStart, batchStart + BATCH_SIZE);
    const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(marketsWithPrices.length / BATCH_SIZE);

    log(
      `Analyzing batch ${BOLD}${batchNum}/${totalBatches}${RESET} (${batch.length} markets) with Claude...`,
    );

    const batchInput = batch.map((m) => ({
      question: m.market.question,
      description: m.market.description ?? "",
      yesPrice: m.yesPrice,
    }));

    const analyses = await analyzeMarketBatch(batchInput);

    for (let j = 0; j < analyses.length && j < batch.length; j++) {
      allAnalyses.push({
        analysis: analyses[j],
        market: batch[j].market,
        yesPrice: batch[j].yesPrice,
      });
    }
  }

  // 4. Calculate edge and filter opportunities
  interface Opportunity {
    question: string;
    marketPrice: number;
    estimatedProb: number;
    edge: number;
    side: "YES" | "NO";
    suggestedBet: number;
    confidence: string;
    reasoning: string;
    keyFactors: string[];
    conditionId: string;
  }

  const opportunities: Opportunity[] = [];

  console.log(`\n${BOLD}  All Markets Analyzed:${RESET}\n`);

  for (const { analysis, market, yesPrice } of allAnalyses) {
    const edge = Math.abs(analysis.estimatedProbability - yesPrice);
    const kelly = kellyBet(analysis.estimatedProbability, yesPrice, opts.balance);
    const isOpportunity = edge >= opts.minEdge && analysis.confidence !== "low";

    const edgeColor = isOpportunity ? GREEN : DIM;
    const confColor =
      analysis.confidence === "high"
        ? GREEN
        : analysis.confidence === "medium"
          ? YELLOW
          : DIM;

    const shortQ =
      market.question.length > 50
        ? market.question.substring(0, 50) + "..."
        : market.question;

    console.log(
      `  ${isOpportunity ? BOLD : ""}${shortQ}${RESET}`,
    );
    console.log(
      `    Market: ${(yesPrice * 100).toFixed(0)}% | AI: ${(analysis.estimatedProbability * 100).toFixed(0)}% | Edge: ${edgeColor}${(edge * 100).toFixed(1)}%${RESET} | Conf: ${confColor}${analysis.confidence}${RESET}`,
    );

    if (isOpportunity) {
      opportunities.push({
        question: market.question,
        marketPrice: yesPrice,
        estimatedProb: analysis.estimatedProbability,
        edge,
        side: kelly.side,
        suggestedBet: kelly.suggestedBet,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        keyFactors: analysis.keyFactors,
        conditionId: market.condition_id,
      });
    }
  }

  // 5. Sort and display opportunities
  opportunities.sort((a, b) => b.edge - a.edge);

  logHeader("Suggested Opportunities");

  if (opportunities.length === 0) {
    console.log(
      `  ${YELLOW}No opportunities with >= ${(opts.minEdge * 100).toFixed(0)}% edge and medium+ confidence.${RESET}`,
    );
    console.log(
      `  ${DIM}Try: --min-edge 0.03 or --limit 30${RESET}\n`,
    );
    return;
  }

  console.log(
    `  ${GREEN}${BOLD}${opportunities.length} opportunities found:${RESET}\n`,
  );

  for (let i = 0; i < opportunities.length; i++) {
    const opp = opportunities[i];
    const edgeColor = opp.edge >= 0.15 ? GREEN : YELLOW;
    const sideColor = opp.side === "YES" ? GREEN : RED;

    console.log(`  ${BOLD}${WHITE}${i + 1}. ${opp.question}${RESET}`);
    console.log(
      `     Market: ${(opp.marketPrice * 100).toFixed(1)}%  |  AI estimate: ${(opp.estimatedProb * 100).toFixed(1)}%  |  Edge: ${edgeColor}${BOLD}${(opp.edge * 100).toFixed(1)}%${RESET}`,
    );
    console.log(
      `     Buy ${sideColor}${BOLD}${opp.side}${RESET}  |  Bet: ${GREEN}$${opp.suggestedBet.toFixed(2)}${RESET}  |  Confidence: ${opp.confidence}`,
    );
    console.log(`     ${DIM}${opp.reasoning}${RESET}`);
    if (opp.keyFactors.length > 0) {
      console.log(`     ${DIM}Factors: ${opp.keyFactors.join(" | ")}${RESET}`);
    }
    console.log();
  }

  // 6. Summary
  const totalSuggested = opportunities.reduce((s, o) => s + o.suggestedBet, 0);
  console.log(`${MAGENTA}${"─".repeat(70)}${RESET}`);
  console.log(`  Scanned: ${allAnalyses.length} markets`);
  console.log(`  Opportunities: ${GREEN}${opportunities.length}${RESET}`);
  console.log(`  Total suggested: $${totalSuggested.toFixed(2)} of $${opts.balance}`);
  console.log();
  console.log(`  ${YELLOW}${BOLD}DISCLAIMER:${RESET} ${YELLOW}AI analysis, not financial advice. DYOR.${RESET}\n`);

  // 7. Interactive trade execution
  const privateKey = process.env.POLYMARKET_PRIVATE_KEY;
  if (!privateKey) {
    log(`${DIM}Set POLYMARKET_PRIVATE_KEY in .env.local to enable trade execution.${RESET}`);
    return;
  }

  await interactiveTradeFlow(opportunities, marketsWithPrices);
}

// -----------------------------------------------------------------------------
// Interactive prompt helpers
// -----------------------------------------------------------------------------

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// -----------------------------------------------------------------------------
// Trade execution with Polymarket CLOB
// -----------------------------------------------------------------------------

async function initClobClient(): Promise<ClobClient> {
  const privateKey = process.env.POLYMARKET_PRIVATE_KEY!;
  const host = process.env.POLYMARKET_API_URL ?? "https://clob.polymarket.com";

  // Create ethers wallet as signer (EOA that controls the Polymarket proxy wallet)
  const wallet = new ethers.Wallet(privateKey);
  const eoaAddress = await wallet.getAddress();
  log(`  EOA address: ${eoaAddress}`);

  // Polymarket uses proxy wallets - funds deposited via the web UI go to a proxy
  // contract controlled by your EOA. We must use POLY_PROXY signature type.
  // The funderAddress is NOT needed when using POLY_PROXY (it's derived on-chain).

  // Create client without creds first, then derive them
  const clientForDerive = new ClobClient(
    host,
    Chain.POLYGON,
    wallet,
    undefined,              // creds (derive below)
    SignatureType.POLY_PROXY, // Polymarket proxy wallet signature
  );

  log("Deriving API credentials from your wallet...");
  const creds = await clientForDerive.createOrDeriveApiKey();
  log(`  API Key: ${creds.key}`);
  log(`  API credentials derived successfully`);

  // Create fully authenticated client with POLY_PROXY
  return new ClobClient(
    host,
    Chain.POLYGON,
    wallet,
    creds,
    SignatureType.POLY_PROXY,
  );
}

interface Opportunity {
  question: string;
  marketPrice: number;
  estimatedProb: number;
  edge: number;
  side: "YES" | "NO";
  suggestedBet: number;
  confidence: string;
  reasoning: string;
  keyFactors: string[];
  conditionId: string;
}

async function interactiveTradeFlow(
  opportunities: Opportunity[],
  marketsWithPrices: MarketWithPrice[],
) {
  console.log(`\n${BOLD}${CYAN}${"=".repeat(70)}${RESET}`);
  console.log(`${BOLD}${CYAN}  Trade Execution${RESET}`);
  console.log(`${BOLD}${CYAN}${"=".repeat(70)}${RESET}\n`);

  const answer = await ask(
    `  Do you want to place trades? (${GREEN}yes${RESET}/${RED}no${RESET}): `,
  );

  if (answer.toLowerCase() !== "yes" && answer.toLowerCase() !== "y") {
    log("No trades placed. Goodbye!");
    return;
  }

  // Ask which opportunities to trade
  console.log();
  console.log(
    `  Enter the numbers of the opportunities you want to trade`,
  );
  console.log(
    `  ${DIM}(comma-separated, e.g. "1,3" or "all"):${RESET}`,
  );

  const selection = await ask(`  Selection: `);

  let selectedIndices: number[];
  if (selection.toLowerCase() === "all") {
    selectedIndices = opportunities.map((_, i) => i);
  } else {
    selectedIndices = selection
      .split(",")
      .map((s) => parseInt(s.trim()) - 1)
      .filter((i) => i >= 0 && i < opportunities.length);
  }

  if (selectedIndices.length === 0) {
    log(`${YELLOW}No valid selections. Exiting.${RESET}`);
    return;
  }

  // For each selected opportunity, confirm amount
  interface TradeToExecute {
    opportunity: Opportunity;
    amount: number;
    tokenId: string;
  }

  const trades: TradeToExecute[] = [];

  for (const idx of selectedIndices) {
    const opp = opportunities[idx];
    const sideColor = opp.side === "YES" ? GREEN : RED;

    console.log(
      `\n  ${BOLD}${opp.question}${RESET}`,
    );
    console.log(
      `  Buy ${sideColor}${BOLD}${opp.side}${RESET} at ${(opp.marketPrice * 100).toFixed(1)}% | Suggested: $${opp.suggestedBet.toFixed(2)}`,
    );

    const amountStr = await ask(
      `  Amount to bet (or 'skip'): $`,
    );

    if (amountStr.toLowerCase() === "skip") continue;

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      console.log(`  ${RED}Invalid amount, skipping.${RESET}`);
      continue;
    }

    // Find the right token ID
    const marketData = marketsWithPrices.find(
      (m) => m.market.condition_id === opp.conditionId,
    );
    if (!marketData) {
      console.log(`  ${RED}Could not find market data, skipping.${RESET}`);
      continue;
    }

    const tokenForSide =
      opp.side === "YES"
        ? marketData.market.tokens.find((t) => t.outcome === "Yes") ??
          marketData.market.tokens[0]
        : marketData.market.tokens.find((t) => t.outcome === "No") ??
          marketData.market.tokens[1];

    if (!tokenForSide) {
      console.log(`  ${RED}Could not find token for ${opp.side}, skipping.${RESET}`);
      continue;
    }

    trades.push({
      opportunity: opp,
      amount,
      tokenId: tokenForSide.token_id,
    });
  }

  if (trades.length === 0) {
    log("No trades to execute. Goodbye!");
    return;
  }

  // Final confirmation
  console.log(`\n${BOLD}${YELLOW}${"─".repeat(70)}${RESET}`);
  console.log(`${BOLD}${YELLOW}  Order Summary (REAL MONEY)${RESET}`);
  console.log(`${BOLD}${YELLOW}${"─".repeat(70)}${RESET}\n`);

  let totalCost = 0;
  for (const trade of trades) {
    const sideColor = trade.opportunity.side === "YES" ? GREEN : RED;
    const rawPrice =
      trade.opportunity.side === "YES"
        ? trade.opportunity.marketPrice
        : 1 - trade.opportunity.marketPrice;
    const price = Math.round(rawPrice * 100) / 100;
    const shares = price > 0 ? trade.amount / price : 0;

    console.log(
      `  Buy ${sideColor}${BOLD}${trade.opportunity.side}${RESET} | $${trade.amount.toFixed(2)} | ~${shares.toFixed(1)} shares @ ${(price * 100).toFixed(1)}c`,
    );
    console.log(`  ${DIM}${trade.opportunity.question}${RESET}`);
    totalCost += trade.amount;
  }

  console.log(`\n  ${BOLD}Total: $${totalCost.toFixed(2)}${RESET}\n`);

  const confirm = await ask(
    `  ${YELLOW}${BOLD}Confirm execution? This uses REAL money. (yes/no): ${RESET}`,
  );

  if (confirm.toLowerCase() !== "yes") {
    log("Cancelled. No trades placed.");
    return;
  }

  // Execute trades
  log("Initializing Polymarket client...");
  let clobClient: ClobClient;
  try {
    clobClient = await initClobClient();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${RED}Failed to initialize client: ${msg}${RESET}`);
    return;
  }

  // Pre-flight checks
  log("Running pre-flight checks...");
  try {
    const ok = await clobClient.getOk();
    log(`  API health: ${GREEN}OK${RESET} ${DIM}(${JSON.stringify(ok)})${RESET}`);
  } catch (err) {
    log(`  ${RED}API health check failed: ${err instanceof Error ? err.message : err}${RESET}`);
  }

  // Check USDC balance and allowance
  try {
    const balanceAllowance = await clobClient.getBalanceAllowance({
      asset_type: AssetType.COLLATERAL,
    });
    log(`  USDC Balance: ${GREEN}$${balanceAllowance.balance}${RESET}`);
    log(`  USDC Allowance: ${balanceAllowance.allowance}`);

    if (parseFloat(balanceAllowance.balance) <= 0) {
      log(`  ${RED}${BOLD}WARNING: Your Polymarket USDC balance is $0!${RESET}`);
      log(`  ${RED}Make sure you have deposited USDC on Polymarket.${RESET}`);
      log(`  ${RED}Your proxy wallet must have funds, not just the EOA.${RESET}`);
    }
  } catch (err) {
    log(`  ${YELLOW}Could not check balance: ${err instanceof Error ? err.message : err}${RESET}`);
  }

  // Update balance allowance (ensures USDC approval for exchange)
  try {
    log("  Updating balance allowance (token approvals)...");
    await clobClient.updateBalanceAllowance({
      asset_type: AssetType.COLLATERAL,
    });
    log(`  ${GREEN}Balance allowance updated${RESET}`);
  } catch (err) {
    log(`  ${YELLOW}Could not update allowance: ${err instanceof Error ? err.message : err}${RESET}`);
  }

  for (const trade of trades) {
    const opp = trade.opportunity;
    // Round price to nearest cent (CLOB requires tick size of 0.01)
    const rawPrice =
      opp.side === "YES" ? opp.marketPrice : 1 - opp.marketPrice;
    const price = Math.round(rawPrice * 100) / 100;

    if (price <= 0 || price >= 1) {
      log(`${RED}  Skipping ${opp.question.substring(0, 40)}... (invalid price ${price})${RESET}`);
      continue;
    }

    const size = Math.floor((trade.amount / price) * 100) / 100;
    if (!size || size <= 0 || !isFinite(size)) {
      log(`${RED}  Skipping ${opp.question.substring(0, 40)}... (invalid size)${RESET}`);
      continue;
    }

    const shortQ =
      opp.question.length > 45
        ? opp.question.substring(0, 45) + "..."
        : opp.question;

    log(`Placing order: Buy ${opp.side} "${shortQ}" | $${trade.amount.toFixed(2)} | token: ${trade.tokenId.substring(0, 20)}...`);

    try {
      // Step 1: Create the signed order first (for debugging)
      log(`  Creating signed market order...`);
      const signedOrder = await clobClient.createMarketOrder({
        tokenID: trade.tokenId,
        amount: trade.amount,
        side: Side.BUY,
      });
      log(`  Signed order: ${JSON.stringify(signedOrder).substring(0, 200)}...`);

      // Step 2: Post the signed order as FOK
      log(`  Posting order (FOK)...`);
      const result = await clobClient.postOrder(signedOrder, OrderType.FOK);
      log(`  ${BOLD}Full API response:${RESET}`);
      log(`  ${JSON.stringify(result, null, 2)}`);

      const response = typeof result === "string" ? JSON.parse(result) : result;
      const orderId = response?.orderID ?? response?.orderIds?.[0] ?? response?.orderid ?? null;
      const status = response?.status ?? response?.success;

      if (status === "matched" || status === "MATCHED") {
        console.log(`  ${GREEN}${BOLD}>>> FILLED <<<${RESET}`);
        if (orderId) log(`  Order ID: ${orderId}`);
      } else if (status === "delayed" || status === "DELAYED") {
        console.log(`  ${YELLOW}${BOLD}>>> DELAYED (processing) <<<${RESET}`);
        if (orderId) log(`  Order ID: ${orderId}`);
      } else {
        console.log(`  ${YELLOW}${BOLD}>>> Status: ${status ?? "unknown"} <<<${RESET}`);
        log(`  ${DIM}The order may not have been filled. Check polymarket.com${RESET}`);
      }
    } catch (err: any) {
      console.log(`  ${RED}${BOLD}>>> ERROR <<<${RESET}`);
      if (err?.response) {
        // Axios-style error
        log(`  ${RED}Status: ${err.response.status}${RESET}`);
        log(`  ${RED}Body: ${JSON.stringify(err.response.data)}${RESET}`);
      }
      const msg = err instanceof Error ? err.message : String(err);
      log(`  ${RED}${msg}${RESET}`);
      if (err?.stack) log(`  ${DIM}${err.stack.split("\n").slice(1, 4).join("\n  ")}${RESET}`);
    }
  }

  console.log();
  log(`${GREEN}${BOLD}Done! Check your positions at polymarket.com${RESET}`);
}

main().catch((err) => {
  console.error(`${RED}Error: ${err}${RESET}`);
  process.exit(1);
});
