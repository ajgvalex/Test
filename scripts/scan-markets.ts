#!/usr/bin/env npx tsx
// =============================================================================
// Polymarket Market Scanner - Sentiment & News Analysis
// =============================================================================
//
// Scans active Polymarket markets, researches recent news for each one,
// uses Claude to estimate the real probability, and suggests markets
// where the price is mispriced (edge opportunities).
//
// Usage:
//   npx tsx scripts/scan-markets.ts
//   npx tsx scripts/scan-markets.ts --limit 10
//   npx tsx scripts/scan-markets.ts --category crypto
//   npx tsx scripts/scan-markets.ts --min-edge 0.10
//
// =============================================================================

import Anthropic from "@anthropic-ai/sdk";

// -----------------------------------------------------------------------------
// CLI argument parsing
// -----------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    limit: 10,
    minEdge: 0.08, // minimum 8% edge to suggest
    category: "", // filter by category (optional)
    balance: 50, // for position sizing
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
      case "--category":
      case "-c":
        opts.category = args[++i];
        break;
      case "--balance":
      case "-b":
        opts.balance = Number(args[++i]);
        break;
      case "--help":
      case "-h":
        console.log(`
Polymarket Market Scanner

Analyzes active markets using AI sentiment analysis to find mispriced opportunities.

Options:
  --limit, -l      Number of markets to scan (default: 10)
  --min-edge, -e   Minimum edge to show a suggestion, e.g. 0.10 = 10% (default: 0.08)
  --category, -c   Filter by category: crypto, politics, sports, etc.
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
  tags?: string[];
  category?: string;
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
  const data = await fetchJson<ClobMarket[] | { data: ClobMarket[] }>(
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
// News search (DuckDuckGo HTML scraping)
// -----------------------------------------------------------------------------

async function searchNews(query: string): Promise<string[]> {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + " news 2026")}&t=h_&ia=web`;
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });

    if (!res.ok) return [];

    const html = await res.text();

    // Extract result snippets from DuckDuckGo HTML
    const snippets: string[] = [];
    const snippetRegex = /class="result__snippet"[^>]*>(.*?)<\/a>/gs;
    let match;
    while ((match = snippetRegex.exec(html)) !== null && snippets.length < 8) {
      const text = match[1]
        .replace(/<\/?[^>]+(>|$)/g, "") // strip HTML tags
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();
      if (text.length > 20) snippets.push(text);
    }

    // Also extract titles
    const titleRegex = /class="result__a"[^>]*>(.*?)<\/a>/gs;
    const titles: string[] = [];
    while ((match = titleRegex.exec(html)) !== null && titles.length < 8) {
      const text = match[1].replace(/<\/?[^>]+(>|$)/g, "").trim();
      if (text.length > 10) titles.push(text);
    }

    // Combine titles and snippets
    const results: string[] = [];
    for (let i = 0; i < Math.max(titles.length, snippets.length); i++) {
      let entry = "";
      if (titles[i]) entry += titles[i];
      if (snippets[i]) entry += (entry ? ": " : "") + snippets[i];
      if (entry) results.push(entry);
    }

    return results;
  } catch {
    return [];
  }
}

// -----------------------------------------------------------------------------
// Claude analysis
// -----------------------------------------------------------------------------

const anthropic = new Anthropic();

interface MarketAnalysis {
  estimatedProbability: number;
  confidence: "low" | "medium" | "high";
  reasoning: string;
  keyFactors: string[];
  sentiment: "bullish" | "bearish" | "neutral";
}

async function analyzeMarket(
  question: string,
  description: string,
  currentPrice: number,
  newsSnippets: string[],
): Promise<MarketAnalysis> {
  const newsContext =
    newsSnippets.length > 0
      ? `Recent news and information:\n${newsSnippets.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
      : "No recent news found for this market.";

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `You are a prediction market analyst. Analyze this Polymarket question and estimate the TRUE probability of the event happening.

MARKET QUESTION: ${question}

DESCRIPTION: ${description}

CURRENT MARKET PRICE: ${(currentPrice * 100).toFixed(1)}% (this is what the market currently thinks)

${newsContext}

Respond ONLY with valid JSON in this exact format (no markdown, no explanation outside JSON):
{
  "estimatedProbability": 0.XX,
  "confidence": "low|medium|high",
  "reasoning": "1-2 sentence explanation",
  "keyFactors": ["factor1", "factor2", "factor3"],
  "sentiment": "bullish|bearish|neutral"
}

Rules:
- estimatedProbability must be between 0.01 and 0.99
- Be honest about uncertainty - use "low" confidence when unsure
- Consider the news sentiment, historical context, and current events
- "bullish" means YES is more likely, "bearish" means NO is more likely`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    return JSON.parse(text) as MarketAnalysis;
  } catch {
    return {
      estimatedProbability: currentPrice,
      confidence: "low",
      reasoning: "Could not parse analysis",
      keyFactors: [],
      sentiment: "neutral",
    };
  }
}

// -----------------------------------------------------------------------------
// Kelly Criterion position sizing
// -----------------------------------------------------------------------------

function kellyBet(estimatedProb: number, marketPrice: number, balance: number): {
  fraction: number;
  suggestedBet: number;
  side: "YES" | "NO";
} {
  // Determine which side to bet
  const buyYes = estimatedProb > marketPrice;
  const p = buyYes ? estimatedProb : 1 - estimatedProb;
  const price = buyYes ? marketPrice : 1 - marketPrice;

  // Kelly: f* = (bp - q) / b where b = (1/price - 1)
  const b = 1 / price - 1;
  const q = 1 - p;
  const kelly = (b * p - q) / b;

  // Use quarter-Kelly for safety
  const fraction = Math.max(0, kelly * 0.25);
  const suggestedBet = Math.min(fraction * balance, balance * 0.15); // cap at 15% of balance

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
  sentiment: string;
  conditionId: string;
}

async function main() {
  const opts = parseArgs();

  logHeader("Polymarket Market Scanner");
  log(`Scanning ${BOLD}${opts.limit}${RESET} markets for opportunities...`);
  log(`Min edge: ${BOLD}${(opts.minEdge * 100).toFixed(0)}%${RESET}`);
  log(`Balance: ${BOLD}$${opts.balance}${RESET}`);
  if (opts.category) log(`Category filter: ${BOLD}${opts.category}${RESET}`);
  console.log();

  // 1. Fetch markets
  log("Fetching active markets from Polymarket...");
  const markets = await getActiveMarkets(opts.limit);
  log(`Found ${BOLD}${markets.length}${RESET} markets`);

  if (markets.length === 0) {
    log(`${RED}No active markets found.${RESET}`);
    return;
  }

  // 2. Filter markets
  let filtered = markets.filter(
    (m) => m.tokens && m.tokens.length > 0 && !m.closed,
  );

  if (opts.category) {
    const cat = opts.category.toLowerCase();
    filtered = filtered.filter(
      (m) =>
        m.category?.toLowerCase().includes(cat) ||
        m.tags?.some((t) => t.toLowerCase().includes(cat)),
    );
  }

  log(`Analyzing ${BOLD}${filtered.length}${RESET} markets...\n`);

  const opportunities: Opportunity[] = [];

  // 3. Analyze each market
  for (let i = 0; i < filtered.length; i++) {
    const market = filtered[i];
    const token = market.tokens[0];
    const tokenId = token.token_id;

    // Get current price
    let currentPrice: number;
    try {
      currentPrice = token.price || (await getMidpoint(tokenId));
    } catch {
      continue;
    }

    if (!currentPrice || currentPrice <= 0.02 || currentPrice >= 0.98) continue;

    const shortQ =
      market.question.length > 65
        ? market.question.substring(0, 65) + "..."
        : market.question;

    process.stdout.write(
      `${DIM}[${i + 1}/${filtered.length}]${RESET} ${shortQ} `,
    );

    // Search for news
    const searchQuery = market.question.replace(/^Will\s+/i, "").replace(/\?$/, "");
    const news = await searchNews(searchQuery);

    // Analyze with Claude
    const analysis = await analyzeMarket(
      market.question,
      market.description ?? "",
      currentPrice,
      news,
    );

    // Calculate edge
    const edge = Math.abs(analysis.estimatedProbability - currentPrice);
    const kelly = kellyBet(analysis.estimatedProbability, currentPrice, opts.balance);

    // Show inline result
    const edgeColor = edge >= opts.minEdge ? GREEN : DIM;
    console.log(
      `${edgeColor}${(edge * 100).toFixed(1)}% edge${RESET} ${DIM}(${analysis.confidence} conf)${RESET}`,
    );

    if (edge >= opts.minEdge && analysis.confidence !== "low") {
      opportunities.push({
        question: market.question,
        marketPrice: currentPrice,
        estimatedProb: analysis.estimatedProbability,
        edge,
        side: kelly.side,
        suggestedBet: kelly.suggestedBet,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        keyFactors: analysis.keyFactors,
        sentiment: analysis.sentiment,
        conditionId: market.condition_id,
      });
    }

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 300));
  }

  // 4. Sort by edge (best first)
  opportunities.sort((a, b) => b.edge - a.edge);

  // 5. Display results
  logHeader("Opportunities Found");

  if (opportunities.length === 0) {
    console.log(
      `  ${YELLOW}No opportunities found with >= ${(opts.minEdge * 100).toFixed(0)}% edge and medium+ confidence.${RESET}`,
    );
    console.log(
      `  ${DIM}Try lowering --min-edge or scanning more markets with --limit${RESET}\n`,
    );
    return;
  }

  console.log(
    `  Found ${BOLD}${GREEN}${opportunities.length}${RESET} opportunities:\n`,
  );

  for (let i = 0; i < opportunities.length; i++) {
    const opp = opportunities[i];
    const edgeColor = opp.edge >= 0.15 ? GREEN : YELLOW;
    const sideColor = opp.side === "YES" ? GREEN : RED;

    console.log(
      `  ${BOLD}${WHITE}${i + 1}. ${opp.question}${RESET}`,
    );
    console.log(
      `     ${DIM}Market says:${RESET} ${(opp.marketPrice * 100).toFixed(1)}%  ${DIM}|  AI estimate:${RESET} ${(opp.estimatedProb * 100).toFixed(1)}%  ${DIM}|  Edge:${RESET} ${edgeColor}${BOLD}${(opp.edge * 100).toFixed(1)}%${RESET}`,
    );
    console.log(
      `     ${DIM}Action:${RESET} Buy ${sideColor}${BOLD}${opp.side}${RESET} ${DIM}|  Suggested bet:${RESET} ${GREEN}$${opp.suggestedBet.toFixed(2)}${RESET} ${DIM}|  Confidence:${RESET} ${opp.confidence}`,
    );
    console.log(`     ${DIM}Reasoning:${RESET} ${opp.reasoning}`);
    if (opp.keyFactors.length > 0) {
      console.log(
        `     ${DIM}Key factors:${RESET} ${opp.keyFactors.join(" | ")}`,
      );
    }
    console.log();
  }

  // 6. Summary
  console.log(`${BOLD}${MAGENTA}${"─".repeat(70)}${RESET}`);
  console.log(`${BOLD}${MAGENTA}  Summary${RESET}`);
  console.log(`${BOLD}${MAGENTA}${"─".repeat(70)}${RESET}`);
  const totalSuggested = opportunities.reduce(
    (sum, o) => sum + o.suggestedBet,
    0,
  );
  console.log(`  Markets scanned:      ${filtered.length}`);
  console.log(
    `  Opportunities found:  ${GREEN}${opportunities.length}${RESET}`,
  );
  console.log(`  Total suggested bet:  $${totalSuggested.toFixed(2)} of $${opts.balance}`);
  console.log(
    `  Best edge:            ${GREEN}${(opportunities[0].edge * 100).toFixed(1)}%${RESET} on "${opportunities[0].question.substring(0, 50)}..."`,
  );
  console.log();
  console.log(
    `  ${YELLOW}${BOLD}DISCLAIMER:${RESET} ${YELLOW}This is AI analysis, not financial advice.${RESET}`,
  );
  console.log(
    `  ${YELLOW}Always do your own research before placing bets.${RESET}\n`,
  );
}

main().catch((err) => {
  console.error(`${RED}Error: ${err}${RESET}`);
  process.exit(1);
});
