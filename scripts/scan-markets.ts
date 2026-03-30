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
import Anthropic from "@anthropic-ai/sdk";

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
    limit: 20,
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
// Polymarket API
// -----------------------------------------------------------------------------

const API_BASE = process.env.POLYMARKET_API_URL ?? "https://clob.polymarket.com";

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
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

async function getActiveMarkets(limit: number): Promise<ClobMarket[]> {
  const data = await fetchJson<ClobMarket[] | { data: ClobMarket[]; next_cursor?: string }>(
    "/markets",
    { limit: String(limit), active: "true" },
  );
  return Array.isArray(data) ? data : data.data ?? [];
}

async function getMidpoint(tokenId: string): Promise<number> {
  const data = await fetchJson<{ mid: number }>("/midpoint", { token_id: tokenId });
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
    if (!market.tokens || market.tokens.length === 0 || market.closed) continue;

    const yesToken = market.tokens.find((t) => t.outcome === "Yes") ?? market.tokens[0];
    const noToken = market.tokens.find((t) => t.outcome === "No") ?? market.tokens[1];

    let yesPrice = yesToken?.price ?? 0;

    // If price not in market data, fetch it
    if (!yesPrice && yesToken?.token_id) {
      try {
        yesPrice = await getMidpoint(yesToken.token_id);
        // Small delay to avoid rate limiting
        await new Promise((r) => setTimeout(r, 200));
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

  // 1. Fetch markets
  log("Fetching active markets from Polymarket...");
  const rawMarkets = await getActiveMarkets(opts.limit);
  log(`API returned ${BOLD}${rawMarkets.length}${RESET} markets`);

  // 2. Get prices for each market
  log("Fetching current prices...");
  const marketsWithPrices = await enrichMarketPrices(rawMarkets);
  log(
    `${BOLD}${marketsWithPrices.length}${RESET} markets with valid prices (${rawMarkets.length - marketsWithPrices.length} skipped)`,
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
}

main().catch((err) => {
  console.error(`${RED}Error: ${err}${RESET}`);
  process.exit(1);
});
