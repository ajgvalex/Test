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
  // Try cwd first, then fall back to project root (one level up from scripts/)
  const candidates = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", ".env.local"),
  ];
  const envPath = candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
  try {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      // Last value wins (allows appending overrides to .env.local)
      process.env[key] = value;
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
    minEdge: 0.05,
    balance: 50,
    minBet: 1,
    minReturn: 0,
    minConf: "low" as "low" | "medium" | "high",
    auto: false,         // auto-execute trades without prompting
    aggressive: false,   // aggressive Kelly sizing
    maxTrades: 5,        // max trades per run in auto mode
    maxPerTrade: 0,      // max USD per trade (0 = no cap, use Kelly)
    crypto: false,       // filter for crypto markets + BTC/ETH TA
    minDuration: 0,      // min minutes until market resolves (0 = no filter)
    maxDuration: 0,      // max minutes until market resolves (0 = no filter)
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
      case "--min-bet":
        opts.minBet = Number(args[++i]);
        break;
      case "--min-return":
      case "-r":
        opts.minReturn = Number(args[++i]) / 100;
        break;
      case "--min-conf":
      case "-c":
        opts.minConf = args[++i] as "low" | "medium" | "high";
        break;
      case "--auto":
        opts.auto = true;
        break;
      case "--aggressive":
        opts.aggressive = true;
        break;
      case "--crypto":
        opts.crypto = true;
        break;
      case "--max-trades":
        opts.maxTrades = Number(args[++i]);
        break;
      case "--max-per-trade":
        opts.maxPerTrade = Number(args[++i]);
        break;
      case "--min-duration":
        opts.minDuration = Number(args[++i]);
        break;
      case "--max-duration":
        opts.maxDuration = Number(args[++i]);
        break;
      case "--help":
      case "-h":
        console.log(`
Polymarket Market Scanner

Analyzes active markets using AI to find mispriced opportunities.

Filters:
  --limit, -l        Number of markets to fetch (default: 100)
  --min-edge, -e     Minimum edge % (default: 5)
  --min-return, -r   Expected return % (default: 0)
  --min-conf, -c     Minimum confidence: low, medium, high (default: low)
  --min-bet          Minimum bet in USD (default: 1)
  --balance, -b      Balance for sizing (default: 50)

Auto-trade mode:
  --auto             Execute best trades automatically (no prompts)
  --aggressive       Use half-Kelly sizing + 30% cap (vs quarter-Kelly + 15%)
  --max-trades       Max trades per run (default: 5)
  --max-per-trade    Max USD per single trade (default: no cap)

Crypto mode:
  --crypto           Filter for crypto markets only + real-time BTC/ETH analysis
  --min-duration     Min minutes until market resolves (default: 0 = no filter)
  --max-duration     Max minutes until market resolves (default: 0 = no filter)

Examples:
  npx tsx scripts/scan-markets.ts --min-bet 5 -r 30 -c medium
  npx tsx scripts/scan-markets.ts --auto --aggressive -r 20 -c medium --max-trades 3
  npx tsx scripts/scan-markets.ts --crypto --auto --aggressive -c medium
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

const CRYPTO_KEYWORDS = /\b(BTC|Bitcoin|ETH|Ethereum|crypto|cryptocurrency|token|blockchain|altcoin|Solana|SOL|XRP|Ripple|Cardano|ADA|Dogecoin|DOGE|MATIC|Polygon|Avalanche|AVAX|Chainlink|LINK|Litecoin|LTC|Polkadot|DOT|BNB|Binance)\b/i;

async function getActiveMarkets(limit: number, cryptoOnly = false, minDuration = 0, maxDuration = 0): Promise<ClobMarket[]> {
  // Use Gamma API - returns currently active, popular markets with prices
  const query: Record<string, string> = {
    limit: String(limit),
    active: "true",
    closed: "false",
    order: "volume",
    ascending: "false",
  };
  // Gamma API supports tag filtering
  if (cryptoOnly) query.tag = "crypto";

  const gammaMarkets = await fetchJson<GammaMarket[]>(
    GAMMA_BASE,
    "/markets",
    query,
  );

  log(`Gamma API returned ${BOLD}${gammaMarkets.length}${RESET} active markets`);

  // Convert to ClobMarket format with prices
  const now = new Date();
  return gammaMarkets
    .filter((m) => {
      if (!m.conditionId || !m.clobTokenIds) return false;
      if (m.endDate && new Date(m.endDate) < now) return false;

      // Strict client-side crypto keyword filter
      if (cryptoOnly) {
        const text = `${m.question ?? ""} ${m.description ?? ""}`;
        if (!CRYPTO_KEYWORDS.test(text)) return false;
      }

      // Duration filter: only keep markets resolving within [min, max] minutes
      if ((minDuration > 0 || maxDuration > 0) && m.endDate) {
        const minutesUntilEnd = (new Date(m.endDate).getTime() - now.getTime()) / 60000;
        if (minDuration > 0 && minutesUntilEnd < minDuration) return false;
        if (maxDuration > 0 && minutesUntilEnd > maxDuration) return false;
      }

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
// Web news search - fetches real-time news for each market question
// -----------------------------------------------------------------------------

interface NewsSnippet {
  title: string;
  snippet: string;
  source: string;
  date?: string;
}

interface MarketNewsContext {
  question: string;
  news: NewsSnippet[];
}

/**
 * Extracts core search keywords from a Polymarket question.
 * Strips "Will", "?", date qualifiers, and generic filler to get a focused query.
 */
function extractSearchQuery(question: string): string {
  return question
    .replace(/^(Will|Is|Does|Do|Has|Have|Can|Could|Should|Are)\s+/i, "")
    .replace(/\?/g, "")
    .replace(/\b(before|by|in|on|during)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(,?\s*\d{4})?\b/gi, "")
    .replace(/\b(before|by)\s+\w+\s+\d{4}\b/gi, "")
    .trim();
}

/**
 * Searches the web for recent news using multiple strategies.
 * Tries DuckDuckGo HTML, Google News RSS, and Brave Search as fallbacks.
 */
async function searchNewsForMarket(question: string): Promise<NewsSnippet[]> {
  const query = extractSearchQuery(question);

  // Strategy 1: DuckDuckGo HTML search
  const ddgResults = await searchDDG(query);
  if (ddgResults.length >= 2) return ddgResults;

  // Strategy 2: Google News RSS feed (no API key needed)
  const googleResults = await searchGoogleNewsRSS(query);
  if (googleResults.length >= 2) return googleResults;

  // Strategy 3: Shorter, more focused query as fallback
  const shortQuery = query.split(" ").slice(0, 4).join(" ");
  if (shortQuery !== query) {
    const shortResults = await searchDDG(shortQuery);
    if (shortResults.length > 0) return shortResults;
  }

  return ddgResults.length > 0 ? ddgResults : googleResults;
}

async function searchDDG(query: string): Promise<NewsSnippet[]> {
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + " latest news")}`;
  try {
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return [];

    const html = await res.text();
    const results: NewsSnippet[] = [];
    const resultBlocks = html.split(/class="result__body"/);

    for (let i = 1; i < resultBlocks.length && results.length < 5; i++) {
      const block = resultBlocks[i];
      const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
      let title = titleMatch?.[1]?.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() ?? "";

      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
      let snippet = snippetMatch?.[1]?.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim() ?? "";
      snippet = snippet.substring(0, 300);

      const sourceMatch = block.match(/class="result__url"[^>]*>([^<]+)/);
      const source = sourceMatch?.[1]?.trim() ?? "";

      if (title && snippet) results.push({ title, snippet, source });
    }
    return results;
  } catch {
    return [];
  }
}

async function searchGoogleNewsRSS(query: string): Promise<NewsSnippet[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return [];

    const xml = await res.text();
    const results: NewsSnippet[] = [];

    // Simple XML parsing for RSS items
    const items = xml.split("<item>");
    for (let i = 1; i < items.length && results.length < 5; i++) {
      const titleMatch = items[i].match(/<title>([\s\S]*?)<\/title>/);
      const title = titleMatch?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() ?? "";

      const descMatch = items[i].match(/<description>([\s\S]*?)<\/description>/);
      const snippet = descMatch?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "").trim().substring(0, 300) ?? "";

      const sourceMatch = items[i].match(/<source[^>]*>([\s\S]*?)<\/source>/);
      const source = sourceMatch?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() ?? "";

      const dateMatch = items[i].match(/<pubDate>([\s\S]*?)<\/pubDate>/);
      const date = dateMatch?.[1]?.trim() ?? "";

      if (title) results.push({ title, snippet: snippet || title, source, date });
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Fetches news for a batch of markets concurrently with rate limiting.
 */
async function fetchNewsForMarkets(
  markets: { question: string }[],
): Promise<Map<string, NewsSnippet[]>> {
  const newsMap = new Map<string, NewsSnippet[]>();

  // Process in small concurrent batches to avoid rate limiting
  const CONCURRENT = 3;
  for (let i = 0; i < markets.length; i += CONCURRENT) {
    const batch = markets.slice(i, i + CONCURRENT);
    const results = await Promise.all(
      batch.map(async (m) => {
        const news = await searchNewsForMarket(m.question);
        return { question: m.question, news };
      }),
    );
    for (const r of results) {
      newsMap.set(r.question, r.news);
    }
    // Small delay between batches
    if (i + CONCURRENT < markets.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return newsMap;
}

// -----------------------------------------------------------------------------
// Crypto technical analysis - real-time BTC/ETH price data
// -----------------------------------------------------------------------------

interface CryptoTA {
  symbol: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  // Hourly indicators
  sma7: number;
  sma25: number;
  ema12: number;
  ema26: number;
  rsi14: number;
  trend: "bullish" | "bearish" | "neutral";
  support: number;
  resistance: number;
  macd: number;           // MACD line (EMA12 - EMA26)
  macdSignal: number;     // 9-period EMA of MACD
  macdHistogram: number;  // MACD - signal
  bollingerUpper: number; // SMA20 + 2*stddev
  bollingerLower: number; // SMA20 - 2*stddev
  bollingerWidth: number; // (upper - lower) / mid — squeeze detection
  atr14: number;          // Average True Range (volatility)
  // Short-term (5-minute candles)
  rsi14_5m: number;
  sma7_5m: number;
  ema9_5m: number;
  trend5m: "bullish" | "bearish" | "neutral";
  change10m: number;
  macd_5m: number;
  macdSignal_5m: number;
  volumeSpike_5m: boolean;  // current 5m volume > 2x average
  // 1-minute candles (ultra short-term)
  rsi14_1m: number;
  change5m: number;         // exact 5-min price change
  trend1m: "bullish" | "bearish" | "neutral";
  volumeSpike_1m: boolean;
}

function computeEMA(values: number[], period: number): number[] {
  const emas: number[] = [];
  const k = 2 / (period + 1);
  emas[0] = values[0];
  for (let i = 1; i < values.length; i++) {
    emas[i] = values[i] * k + emas[i - 1] * (1 - k);
  }
  return emas;
}

function computeMACD(closes: number[]): { macd: number; signal: number; histogram: number } {
  if (closes.length < 26) return { macd: 0, signal: 0, histogram: 0 };
  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = computeEMA(macdLine.slice(-9), 9);
  const macd = macdLine[macdLine.length - 1];
  const signal = signalLine[signalLine.length - 1];
  return { macd, signal, histogram: macd - signal };
}

function computeBollinger(closes: number[], period = 20): { upper: number; lower: number; mid: number; width: number } {
  if (closes.length < period) return { upper: 0, lower: 0, mid: 0, width: 0 };
  const slice = closes.slice(-period);
  const mid = slice.reduce((s, v) => s + v, 0) / period;
  const variance = slice.reduce((s, v) => s + (v - mid) ** 2, 0) / period;
  const stddev = Math.sqrt(variance);
  const upper = mid + 2 * stddev;
  const lower = mid - 2 * stddev;
  return { upper, lower, mid, width: mid > 0 ? (upper - lower) / mid : 0 };
}

function computeATR(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (highs.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    );
    trs.push(tr);
  }
  return trs.slice(-period).reduce((s, v) => s + v, 0) / period;
}

function computeRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function computeSMA(values: number[], period: number): number {
  const slice = values.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

async function fetchCryptoTA(): Promise<CryptoTA[]> {
  const results: CryptoTA[] = [];

  for (const symbol of ["BTC", "ETH"]) {
    try {
      // Binance public API: klines (candlesticks) - last 50 hours
      const klineUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=1h&limit=50`;
      const klineRes = await fetch(klineUrl);
      if (!klineRes.ok) continue;
      const klines = await klineRes.json() as number[][];

      // Each kline: [openTime, open, high, low, close, volume, ...]
      const closes = klines.map((k: any) => parseFloat(k[4]));
      const highs = klines.map((k: any) => parseFloat(k[2]));
      const lows = klines.map((k: any) => parseFloat(k[3]));
      const volumes = klines.map((k: any) => parseFloat(k[5]));

      const currentPrice = closes[closes.length - 1];
      const price24hAgo = closes.length >= 24 ? closes[closes.length - 24] : closes[0];
      const change24h = ((currentPrice - price24hAgo) / price24hAgo) * 100;

      const high24h = Math.max(...highs.slice(-24));
      const low24h = Math.min(...lows.slice(-24));
      const volume24h = volumes.slice(-24).reduce((s, v) => s + v, 0);

      // --- Hourly indicators ---
      const sma7 = computeSMA(closes, 7);
      const sma25 = computeSMA(closes, 25);
      const ema12arr = computeEMA(closes, 12);
      const ema26arr = computeEMA(closes, 26);
      const ema12 = ema12arr[ema12arr.length - 1];
      const ema26 = ema26arr[ema26arr.length - 1];
      const rsi14 = computeRSI(closes, 14);
      const macdH = computeMACD(closes);
      const bollingerH = computeBollinger(closes, 20);
      const atr14 = computeATR(highs, lows, closes, 14);

      let trend: "bullish" | "bearish" | "neutral" = "neutral";
      if (currentPrice > sma7 && sma7 > sma25 && rsi14 > 50) trend = "bullish";
      else if (currentPrice < sma7 && sma7 < sma25 && rsi14 < 50) trend = "bearish";

      const support = Math.min(...lows.slice(-12));
      const resistance = Math.max(...highs.slice(-12));

      // --- 5-minute candles ---
      let rsi14_5m = 50, sma7_5m = currentPrice, ema9_5m = currentPrice;
      let trend5m: "bullish" | "bearish" | "neutral" = "neutral";
      let change10m = 0, macd_5m = 0, macdSignal_5m = 0, volumeSpike_5m = false;
      try {
        const k5mRes = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=5m&limit=30`);
        if (k5mRes.ok) {
          const k5m = await k5mRes.json() as any[];
          const closes5 = k5m.map((k: any) => parseFloat(k[4]));
          const vols5 = k5m.map((k: any) => parseFloat(k[5]));
          rsi14_5m = computeRSI(closes5, 14);
          sma7_5m = computeSMA(closes5, 7);
          const ema9arr5 = computeEMA(closes5, 9);
          ema9_5m = ema9arr5[ema9arr5.length - 1];
          const macd5 = computeMACD(closes5);
          macd_5m = macd5.macd;
          macdSignal_5m = macd5.signal;
          const price10mAgo = closes5.length >= 3 ? closes5[closes5.length - 3] : closes5[0];
          change10m = ((currentPrice - price10mAgo) / price10mAgo) * 100;
          if (currentPrice > ema9_5m && rsi14_5m > 55) trend5m = "bullish";
          else if (currentPrice < ema9_5m && rsi14_5m < 45) trend5m = "bearish";
          // Volume spike: current candle > 2x average of last 20
          const avgVol5 = vols5.slice(-20).reduce((s, v) => s + v, 0) / 20;
          volumeSpike_5m = vols5[vols5.length - 1] > avgVol5 * 2;
        }
      } catch { /* optional */ }

      // --- 1-minute candles (ultra short-term) ---
      let rsi14_1m = 50, change5m = 0, trend1m: "bullish" | "bearish" | "neutral" = "neutral", volumeSpike_1m = false;
      try {
        const k1mRes = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=1m&limit=20`);
        if (k1mRes.ok) {
          const k1m = await k1mRes.json() as any[];
          const closes1 = k1m.map((k: any) => parseFloat(k[4]));
          const vols1 = k1m.map((k: any) => parseFloat(k[5]));
          rsi14_1m = computeRSI(closes1, 14);
          const price5mAgo = closes1.length >= 5 ? closes1[closes1.length - 5] : closes1[0];
          change5m = ((currentPrice - price5mAgo) / price5mAgo) * 100;
          const sma5_1m = computeSMA(closes1, 5);
          if (currentPrice > sma5_1m && rsi14_1m > 55) trend1m = "bullish";
          else if (currentPrice < sma5_1m && rsi14_1m < 45) trend1m = "bearish";
          const avgVol1 = vols1.slice(-15).reduce((s, v) => s + v, 0) / 15;
          volumeSpike_1m = vols1[vols1.length - 1] > avgVol1 * 2;
        }
      } catch { /* optional */ }

      results.push({
        symbol, price: currentPrice, change24h, high24h, low24h, volume24h,
        sma7, sma25, ema12, ema26, rsi14, trend, support, resistance,
        macd: macdH.macd, macdSignal: macdH.signal, macdHistogram: macdH.histogram,
        bollingerUpper: bollingerH.upper, bollingerLower: bollingerH.lower, bollingerWidth: bollingerH.width,
        atr14,
        rsi14_5m, sma7_5m, ema9_5m, trend5m, change10m, macd_5m, macdSignal_5m, volumeSpike_5m,
        rsi14_1m, change5m, trend1m, volumeSpike_1m,
      });
    } catch {
      // API unavailable, skip
    }
  }

  return results;
}

function formatCryptoTA(taList: CryptoTA[]): string {
  if (taList.length === 0) return "";

  let text = "\n=== REAL-TIME CRYPTO TECHNICAL ANALYSIS (MULTI-TIMEFRAME) ===\n";
  for (const ta of taList) {
    const tH = ta.trend === "bullish" ? "BULLISH" : ta.trend === "bearish" ? "BEARISH" : "NEUTRAL";
    const t5 = ta.trend5m === "bullish" ? "BULLISH" : ta.trend5m === "bearish" ? "BEARISH" : "NEUTRAL";
    const t1 = ta.trend1m === "bullish" ? "BULLISH" : ta.trend1m === "bearish" ? "BEARISH" : "NEUTRAL";
    const macdCross = ta.macdHistogram > 0 ? "BULLISH_CROSS" : "BEARISH_CROSS";
    const macdCross5 = ta.macd_5m > ta.macdSignal_5m ? "BULLISH_CROSS" : "BEARISH_CROSS";
    const bbPos = ta.price > ta.bollingerUpper ? "ABOVE_UPPER_BAND" : ta.price < ta.bollingerLower ? "BELOW_LOWER_BAND" : "INSIDE_BANDS";

    text += `
${ta.symbol}/USDT: $${ta.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}

  HOURLY TIMEFRAME:
    24h: ${ta.change24h > 0 ? "+" : ""}${ta.change24h.toFixed(2)}% | Range: $${ta.low24h.toLocaleString()} - $${ta.high24h.toLocaleString()}
    SMA(7): $${ta.sma7.toFixed(0)} | SMA(25): $${ta.sma25.toFixed(0)} | EMA(12): $${ta.ema12.toFixed(0)} | EMA(26): $${ta.ema26.toFixed(0)}
    RSI(14): ${ta.rsi14.toFixed(1)} ${ta.rsi14 > 70 ? "!! OVERBOUGHT" : ta.rsi14 < 30 ? "!! OVERSOLD" : ""}
    MACD: ${ta.macd.toFixed(2)} | Signal: ${ta.macdSignal.toFixed(2)} | Histogram: ${ta.macdHistogram > 0 ? "+" : ""}${ta.macdHistogram.toFixed(2)} [${macdCross}]
    Bollinger: Lower $${ta.bollingerLower.toFixed(0)} | Upper $${ta.bollingerUpper.toFixed(0)} | Width: ${(ta.bollingerWidth * 100).toFixed(2)}% | Position: ${bbPos}
    ATR(14): $${ta.atr14.toFixed(2)} (volatility: ${((ta.atr14 / ta.price) * 100).toFixed(3)}%)
    Support: $${ta.support.toLocaleString()} | Resistance: $${ta.resistance.toLocaleString()}
    Trend: ${tH}

  5-MINUTE TIMEFRAME:
    Last 10min: ${ta.change10m > 0 ? "+" : ""}${ta.change10m.toFixed(3)}%
    RSI(14): ${ta.rsi14_5m.toFixed(1)} | SMA(7): $${ta.sma7_5m.toFixed(0)} | EMA(9): $${ta.ema9_5m.toFixed(0)}
    MACD: ${ta.macd_5m.toFixed(2)} | Signal: ${ta.macdSignal_5m.toFixed(2)} [${macdCross5}]
    Volume spike: ${ta.volumeSpike_5m ? "YES !! (>2x average)" : "No"}
    Trend: ${t5}

  1-MINUTE TIMEFRAME (last 5 minutes):
    Change: ${ta.change5m > 0 ? "+" : ""}${ta.change5m.toFixed(4)}%
    RSI(14): ${ta.rsi14_1m.toFixed(1)}
    Volume spike: ${ta.volumeSpike_1m ? "YES !! (>2x average)" : "No"}
    Trend: ${t1}

  MULTI-TIMEFRAME ALIGNMENT: ${ta.trend === ta.trend5m && ta.trend5m === ta.trend1m ? `ALL ${tH} !! (strong signal)` : `Mixed: 1h=${tH}, 5m=${t5}, 1m=${t1}`}`;
  }
  return text;
}

// -----------------------------------------------------------------------------
// Claude batch analysis (analyze multiple markets in one call)
// Now enriched with real-time news context + crypto TA
// -----------------------------------------------------------------------------

const anthropic = new Anthropic();

interface MarketAnalysis {
  question: string;
  estimatedProbability: number;
  confidence: "low" | "medium" | "high";
  reasoning: string;
  keyFactors: string[];
  newsAlignment: "supports_yes" | "supports_no" | "mixed" | "no_news";
}

async function analyzeMarketBatch(
  markets: { question: string; description: string; yesPrice: number }[],
  newsContext: Map<string, NewsSnippet[]>,
  cryptoTA: CryptoTA[] = [],
): Promise<MarketAnalysis[]> {
  const cryptoSection = cryptoTA.length > 0 ? formatCryptoTA(cryptoTA) : "";

  const marketList = markets
    .map((m, i) => {
      const news = newsContext.get(m.question) ?? [];
      const newsSection = news.length > 0
        ? `  Recent News:\n${news.map((n, j) => `    ${j + 1}. [${n.source}] ${n.title}\n       ${n.snippet}`).join("\n")}`
        : `  Recent News: No recent news found`;

      return `MARKET ${i + 1}:
  Question: ${m.question}
  Description: ${m.description.substring(0, 300)}
  Current YES price: ${(m.yesPrice * 100).toFixed(1)}%
${newsSection}`;
    })
    .join("\n\n");

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `You are an expert prediction market analyst, geopolitical researcher, and crypto technical analyst. Today is ${new Date().toISOString().slice(0, 10)}. Current time: ${new Date().toISOString().slice(11, 16)} UTC.

For each market below, you are given the question, current market price, and REAL-TIME NEWS snippets gathered just now from the internet. Use this news context heavily in your analysis.
${cryptoSection ? `\nYou also have LIVE CRYPTO TECHNICAL ANALYSIS data below. For any crypto-related market, use this data heavily:\n${cryptoSection}\n` : ""}
Your job: estimate the TRUE probability of YES happening based on:
1. The REAL-TIME NEWS provided (most important - this is current information)
2. Geopolitical and economic context implied by the news
3. Social sentiment and trends visible in the headlines
${cryptoSection ? "4. CRYPTO TECHNICAL ANALYSIS: price action, RSI, SMA crossovers, support/resistance levels, trend direction\n5. Short-term momentum (10-minute to hourly timeframe for imminent crypto events)" : "4. Historical patterns and base rates"}
${cryptoSection ? "6" : "5"}. Your own knowledge of the topic

CRITICAL SAFETY RULES:
- YOUR TRAINING DATA MAY BE OUTDATED. Real-world events may have changed dramatically since your cutoff.
- If the news provided CONTRADICTS your prior knowledge, ALWAYS trust the news. The news is fetched in real-time RIGHT NOW.
- If NO news is provided for a market, you MUST set confidence to "low". You cannot be confident without current information.
- NEVER assume the status quo holds. Leaders get deposed, prices crash, wars start/end. Check the news.
- If news mentions a major event (arrest, coup, crash, deal, death), COMPLETELY reassess your probability.

ANALYSIS RULES:
- PRIORITIZE the news context - it's real-time and more current than your training data.
${cryptoSection ? `- For CRYPTO markets, use the FULL technical analysis provided across 3 timeframes (1h, 5m, 1m):
  * TREND ALIGNMENT: If all 3 timeframes agree (e.g. all BULLISH), this is a STRONG signal. Mixed signals = lower confidence.
  * RSI: >70 = overbought (reversal likely), <30 = oversold (bounce likely). RSI divergence across timeframes is significant.
  * MACD: BULLISH_CROSS on 5m with confirming 1h = strong short-term momentum. Watch histogram direction.
  * BOLLINGER BANDS: Price at upper band = resistance, lower band = support. Narrow width (squeeze) = imminent breakout.
  * ATR: High ATR = volatile, price targets further away are possible. Low ATR = range-bound, small moves likely.
  * VOLUME SPIKES: Volume spike on 1m/5m = institutional activity, confirms breakout direction. No volume = weak move.
  * SUPPORT/RESISTANCE: For price target questions, compare target with these levels. Price must break resistance to go higher.
  * For 5-min prediction windows: Focus on 1m and 5m trends, RSI, MACD. Hourly sets context but 1m/5m drives immediate action.
  * EMA(9) on 5m is the key line for short-term direction. Price above = bullish, below = bearish.` : ""}
- Look for signals: government announcements, polls, expert opinions, economic indicators, diplomatic moves.
- Consider sentiment: are headlines mostly positive or negative about the outcome?
- Do NOT just echo the market price. The whole point is to find where markets are WRONG.
- Be bold: if the news strongly suggests the market is mispriced, say so.
- "newsAlignment" should reflect whether the news leans toward YES, NO, is mixed, or absent.
- Use "high" confidence ONLY when you have multiple recent news sources confirming the same direction.
- Use "medium" when news gives some signal but is not conclusive.
- Use "low" when no news is found OR when your knowledge may be outdated for this topic.

${marketList}

Respond with ONLY a JSON array (no markdown, no backticks, no explanation outside the array):
[
  {
    "question": "exact question text",
    "estimatedProbability": 0.XX,
    "confidence": "low|medium|high",
    "reasoning": "2-3 sentences explaining your estimate, referencing specific news if available",
    "keyFactors": ["factor1", "factor2", "factor3"],
    "newsAlignment": "supports_yes|supports_no|mixed|no_news"
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
  aggressive = false,
): { fraction: number; suggestedBet: number; side: "YES" | "NO" } {
  const buyYes = estimatedProb > marketPrice;
  const p = buyYes ? estimatedProb : 1 - estimatedProb;
  const price = buyYes ? marketPrice : 1 - marketPrice;

  const b = 1 / price - 1;
  const q = 1 - p;
  const kelly = (b * p - q) / b;

  // Aggressive: half-Kelly, cap 30% | Normal: quarter-Kelly, cap 15%
  const kellyFraction = aggressive ? 0.5 : 0.25;
  const balanceCap = aggressive ? 0.30 : 0.15;

  const fraction = Math.max(0, kelly * kellyFraction);
  let suggestedBet = Math.min(fraction * balance, balance * balanceCap);
  suggestedBet = Math.round(suggestedBet * 100) / 100;
  if (suggestedBet > 0 && suggestedBet < 1) suggestedBet = 1; // Polymarket minimum

  return {
    fraction,
    suggestedBet,
    side: buyYes ? "YES" : "NO",
  };
}

// -----------------------------------------------------------------------------
// Trade history logging
// -----------------------------------------------------------------------------

function logTrade(trade: {
  timestamp: string;
  question: string;
  side: string;
  amount: number;
  price: number;
  expectedReturn: number;
  confidence: string;
  newsAlignment: string;
  orderId?: string;
  status: string;
}) {
  const historyPath = path.resolve(process.cwd(), "trade-history.jsonl");
  const line = JSON.stringify(trade) + "\n";
  try {
    fs.appendFileSync(historyPath, line);
  } catch { /* non-critical */ }
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

  const modeLabel = opts.auto
    ? `${RED}${BOLD}AUTO-TRADE${RESET}${opts.aggressive ? ` ${YELLOW}AGGRESSIVE${RESET}` : ""}`
    : "interactive";
  logHeader("Polymarket Market Scanner");
  log(`Mode: ${modeLabel}${opts.crypto ? ` | ${CYAN}CRYPTO${RESET}` : ""}`);

  // Auto-detect real balance if wallet is configured
  if (process.env.POLYMARKET_PRIVATE_KEY && process.env.POLYMARKET_WALLET_ADDRESS) {
    try {
      const quickClient = await initClobClient();
      const bal = await quickClient.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
      const realBalance = parseFloat(bal.balance) / 1_000_000;
      if (realBalance > 0) {
        opts.balance = Math.floor(realBalance * 100) / 100;
        log(`  Live balance from Polymarket: ${GREEN}${BOLD}$${opts.balance}${RESET}`);
      }
    } catch {
      log(`  ${DIM}Could not fetch live balance, using --balance${RESET}`);
    }
  }

  log(`Fetching up to ${BOLD}${opts.limit}${RESET} markets`);
  log(`Min edge: ${BOLD}${(opts.minEdge * 100).toFixed(0)}%${RESET} | Min return: ${BOLD}${(opts.minReturn * 100).toFixed(0)}%${RESET} | Min bet: ${BOLD}$${opts.minBet}${RESET} | Min confidence: ${BOLD}${opts.minConf}${RESET}`);
  log(`Balance: ${BOLD}$${opts.balance}${RESET}${opts.aggressive ? ` | Kelly: ${YELLOW}half-Kelly (aggressive)${RESET}` : ""}`);
  console.log();

  // 1. Fetch open markets from Gamma API
  log(`Fetching active ${opts.crypto ? "CRYPTO " : ""}markets from Polymarket...`);
  const openMarkets = await getActiveMarkets(opts.limit, opts.crypto, opts.minDuration, opts.maxDuration);
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

  // 2b. If crypto mode, fetch live BTC/ETH technical analysis
  let cryptoTA: CryptoTA[] = [];
  if (opts.crypto) {
    log(`\nFetching live BTC/ETH technical analysis from Binance...`);
    cryptoTA = await fetchCryptoTA();
    if (cryptoTA.length > 0) {
      for (const ta of cryptoTA) {
        const tC = ta.trend === "bullish" ? GREEN : ta.trend === "bearish" ? RED : YELLOW;
        const t5C = ta.trend5m === "bullish" ? GREEN : ta.trend5m === "bearish" ? RED : YELLOW;
        const t1C = ta.trend1m === "bullish" ? GREEN : ta.trend1m === "bearish" ? RED : YELLOW;
        const aligned = ta.trend === ta.trend5m && ta.trend5m === ta.trend1m;
        log(`  ${BOLD}${ta.symbol}${RESET} $${ta.price.toLocaleString("en-US", {maximumFractionDigits: 2})} | 24h: ${ta.change24h > 0 ? GREEN + "+" : RED}${ta.change24h.toFixed(2)}%${RESET}`);
        log(`    1h: ${tC}${ta.trend}${RESET} RSI:${ta.rsi14.toFixed(0)} MACD:${ta.macdHistogram > 0 ? GREEN + "+" : RED}${ta.macdHistogram.toFixed(1)}${RESET} | 5m: ${t5C}${ta.trend5m}${RESET} RSI:${ta.rsi14_5m.toFixed(0)}${ta.volumeSpike_5m ? ` ${YELLOW}VOL!${RESET}` : ""} | 1m: ${t1C}${ta.trend1m}${RESET} RSI:${ta.rsi14_1m.toFixed(0)}${ta.volumeSpike_1m ? ` ${YELLOW}VOL!${RESET}` : ""}`);
        if (aligned) log(`    ${GREEN}${BOLD}>> ALL TIMEFRAMES ALIGNED: ${ta.trend.toUpperCase()} <<${RESET}`);
      }
    } else {
      log(`  ${YELLOW}Could not fetch crypto data (Binance API unavailable)${RESET}`);
    }
  }

  // 3. Search real-time news for each market
  log(`\nSearching real-time news for ${BOLD}${marketsWithPrices.length}${RESET} markets...`);
  const newsContext = await fetchNewsForMarkets(
    marketsWithPrices.map((m) => ({ question: m.market.question })),
  );
  const marketsWithNews = [...newsContext.entries()].filter(([, news]) => news.length > 0).length;
  const newsFailRate = marketsWithPrices.length > 0 ? ((marketsWithPrices.length - marketsWithNews) / marketsWithPrices.length * 100) : 0;
  const newsColor = newsFailRate > 50 ? RED : newsFailRate > 25 ? YELLOW : GREEN;
  log(
    `Found news for ${GREEN}${BOLD}${marketsWithNews}${RESET} of ${marketsWithPrices.length} markets (${newsColor}${newsFailRate.toFixed(0)}% blind${RESET})`,
  );
  if (newsFailRate > 50) {
    log(`  ${RED}${BOLD}WARNING: News search failing for >50% of markets. Analysis will be less reliable.${RESET}`);
  }

  // 4. Analyze markets in batches with Claude (enriched with news + crypto TA)
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
      `Analyzing batch ${BOLD}${batchNum}/${totalBatches}${RESET} (${batch.length} markets) with Claude${opts.crypto ? " + crypto TA" : ""} + news...`,
    );

    const batchInput = batch.map((m) => ({
      question: m.market.question,
      description: m.market.description ?? "",
      yesPrice: m.yesPrice,
    }));

    const analyses = await analyzeMarketBatch(batchInput, newsContext, cryptoTA);

    for (let j = 0; j < analyses.length && j < batch.length; j++) {
      allAnalyses.push({
        analysis: analyses[j],
        market: batch[j].market,
        yesPrice: batch[j].yesPrice,
      });
    }
  }

  // 5. Calculate edge and filter opportunities
  interface Opportunity {
    question: string;
    marketPrice: number;
    estimatedProb: number;
    edge: number;
    expectedReturn: number;
    side: "YES" | "NO";
    suggestedBet: number;
    confidence: string;
    reasoning: string;
    keyFactors: string[];
    newsAlignment: string;
    conditionId: string;
  }

  const opportunities: Opportunity[] = [];

  console.log(`\n${BOLD}  All Markets Analyzed:${RESET}\n`);

  const confRank = { low: 0, medium: 1, high: 2 };

  for (const { analysis, market, yesPrice } of allAnalyses) {
    const edge = Math.abs(analysis.estimatedProbability - yesPrice);
    const kelly = kellyBet(analysis.estimatedProbability, yesPrice, opts.balance, opts.aggressive);

    // Expected return: if you buy at marketPrice and true prob is estimatedProb
    const buyPrice = kelly.side === "YES" ? yesPrice : 1 - yesPrice;
    const expectedReturn = buyPrice > 0 ? (analysis.estimatedProbability > yesPrice
      ? (analysis.estimatedProbability / buyPrice) - 1
      : ((1 - analysis.estimatedProbability) / (1 - yesPrice)) - 1) : 0;

    const hasNews = analysis.newsAlignment !== "no_news";

    const meetsEdge = edge >= opts.minEdge;
    const meetsConf = confRank[analysis.confidence] >= confRank[opts.minConf];
    const meetsBet = kelly.suggestedBet >= opts.minBet;
    const meetsReturn = expectedReturn >= opts.minReturn;

    // SAFETY: Markets with no news get downgraded
    // - "no_news" + auto mode = BLOCKED (too risky to auto-trade without info)
    // - "no_news" + interactive = allowed but flagged with warning
    const blockedNoNews = !hasNews && opts.auto;
    const isOpportunity = meetsEdge && meetsConf && meetsBet && meetsReturn && !blockedNoNews;

    const edgeColor = isOpportunity ? GREEN : DIM;
    const confColor =
      analysis.confidence === "high"
        ? GREEN
        : analysis.confidence === "medium"
          ? YELLOW
          : DIM;
    const newsIcon =
      analysis.newsAlignment === "supports_yes"
        ? `${GREEN}+news${RESET}`
        : analysis.newsAlignment === "supports_no"
          ? `${RED}-news${RESET}`
          : analysis.newsAlignment === "mixed"
            ? `${YELLOW}~news${RESET}`
            : `${DIM}?news${RESET}`;

    const shortQ =
      market.question.length > 50
        ? market.question.substring(0, 50) + "..."
        : market.question;

    console.log(
      `  ${isOpportunity ? BOLD : ""}${shortQ}${RESET}${blockedNoNews && meetsEdge ? ` ${RED}[BLOCKED: no news]${RESET}` : ""}`,
    );
    console.log(
      `    Market: ${(yesPrice * 100).toFixed(0)}% | AI: ${(analysis.estimatedProbability * 100).toFixed(0)}% | Edge: ${edgeColor}${(edge * 100).toFixed(1)}%${RESET} | Conf: ${confColor}${analysis.confidence}${RESET} | ${newsIcon}`,
    );

    if (isOpportunity) {
      opportunities.push({
        question: market.question,
        marketPrice: yesPrice,
        estimatedProb: analysis.estimatedProbability,
        edge,
        expectedReturn,
        side: kelly.side,
        suggestedBet: kelly.suggestedBet,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        keyFactors: analysis.keyFactors,
        newsAlignment: analysis.newsAlignment ?? "no_news",
        conditionId: market.condition_id,
      });
    }
  }

  // 6. Sort and display opportunities
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
    const newsLabel =
      opp.newsAlignment === "supports_yes"
        ? `${GREEN}News supports YES${RESET}`
        : opp.newsAlignment === "supports_no"
          ? `${RED}News supports NO${RESET}`
          : opp.newsAlignment === "mixed"
            ? `${YELLOW}News is mixed${RESET}`
            : `${RED}${BOLD}!! NO NEWS - HIGH RISK !!${RESET}`;

    const returnColor = opp.expectedReturn >= 0.5 ? GREEN : opp.expectedReturn >= 0.3 ? YELLOW : DIM;

    console.log(`  ${BOLD}${WHITE}${i + 1}. ${opp.question}${RESET}`);
    console.log(
      `     Market: ${(opp.marketPrice * 100).toFixed(1)}%  |  AI estimate: ${(opp.estimatedProb * 100).toFixed(1)}%  |  Edge: ${edgeColor}${BOLD}${(opp.edge * 100).toFixed(1)}%${RESET}  |  Return: ${returnColor}${BOLD}${(opp.expectedReturn * 100).toFixed(0)}%${RESET}`,
    );
    console.log(
      `     Buy ${sideColor}${BOLD}${opp.side}${RESET}  |  Bet: ${GREEN}$${opp.suggestedBet.toFixed(2)}${RESET}  |  Confidence: ${opp.confidence}  |  ${newsLabel}`,
    );
    console.log(`     ${DIM}${opp.reasoning}${RESET}`);
    if (opp.keyFactors.length > 0) {
      console.log(`     ${DIM}Factors: ${opp.keyFactors.join(" | ")}${RESET}`);
    }
    console.log();
  }

  // 7. Summary
  const totalSuggested = opportunities.reduce((s, o) => s + o.suggestedBet, 0);
  const newsBackedCount = opportunities.filter((o) => o.newsAlignment !== "no_news").length;
  console.log(`${MAGENTA}${"─".repeat(70)}${RESET}`);
  console.log(`  Scanned: ${allAnalyses.length} markets`);
  console.log(`  Opportunities: ${GREEN}${opportunities.length}${RESET} (${newsBackedCount} with news backing)`);
  console.log(`  Total suggested: $${totalSuggested.toFixed(2)} of $${opts.balance}`);
  console.log();
  console.log(`  ${DIM}Analysis based on: real-time news, geopolitical context, sentiment analysis${RESET}`);
  console.log(`  ${YELLOW}${BOLD}DISCLAIMER:${RESET} ${YELLOW}AI analysis, not financial advice. DYOR.${RESET}\n`);

  // 8. Trade execution
  const privateKey = process.env.POLYMARKET_PRIVATE_KEY;
  if (!privateKey) {
    log(`${DIM}Set POLYMARKET_PRIVATE_KEY in .env.local to enable trade execution.${RESET}`);
    return;
  }

  if (opts.auto) {
    await autoTradeFlow(opportunities, marketsWithPrices, opts);
  } else {
    await interactiveTradeFlow(opportunities, marketsWithPrices);
  }
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
// Auto trade flow - executes best opportunities without prompting
// -----------------------------------------------------------------------------

async function autoTradeFlow(
  opportunities: Opportunity[],
  marketsWithPrices: MarketWithPrice[],
  opts: { maxTrades: number; maxPerTrade: number; aggressive: boolean },
) {
  logHeader("AUTO-TRADE MODE");

  if (opportunities.length === 0) {
    log(`${YELLOW}No opportunities to trade. Exiting.${RESET}`);
    return;
  }

  // Sort by expected return (best first), then by confidence
  const confRank = { low: 0, medium: 1, high: 2 };
  const sorted = [...opportunities].sort((a, b) => {
    // Prioritize high confidence + high return
    const scoreA = a.expectedReturn * (1 + confRank[a.confidence as keyof typeof confRank]);
    const scoreB = b.expectedReturn * (1 + confRank[b.confidence as keyof typeof confRank]);
    return scoreB - scoreA;
  });

  // Take top N
  const selected = sorted.slice(0, opts.maxTrades);

  log(`Selected ${BOLD}${selected.length}${RESET} best trades (of ${opportunities.length} opportunities):`);
  console.log();

  // Build trade list
  interface TradeToExecute {
    opportunity: Opportunity;
    amount: number;
    tokenId: string;
  }
  const trades: TradeToExecute[] = [];

  for (const opp of selected) {
    let amount = opp.suggestedBet;
    if (opts.maxPerTrade > 0) amount = Math.min(amount, opts.maxPerTrade);
    if (amount < 1) amount = 1;

    const marketData = marketsWithPrices.find(
      (m) => m.market.condition_id === opp.conditionId,
    );
    if (!marketData) continue;

    const tokenForSide =
      opp.side === "YES"
        ? marketData.market.tokens.find((t) => t.outcome === "Yes") ?? marketData.market.tokens[0]
        : marketData.market.tokens.find((t) => t.outcome === "No") ?? marketData.market.tokens[1];
    if (!tokenForSide) continue;

    trades.push({ opportunity: opp, amount, tokenId: tokenForSide.token_id });

    const sideColor = opp.side === "YES" ? GREEN : RED;
    const returnColor = opp.expectedReturn >= 0.5 ? GREEN : YELLOW;
    console.log(
      `  ${sideColor}${BOLD}${opp.side}${RESET} $${amount.toFixed(2)} | Return: ${returnColor}${BOLD}${(opp.expectedReturn * 100).toFixed(0)}%${RESET} | ${opp.confidence} | ${opp.question.substring(0, 55)}`,
    );
  }

  const totalCost = trades.reduce((s, t) => s + t.amount, 0);
  console.log(`\n  ${BOLD}Total: $${totalCost.toFixed(2)}${RESET}\n`);

  // Initialize client and execute
  log("Initializing Polymarket client...");
  let clobClient: ClobClient;
  try {
    clobClient = await initClobClient();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${RED}Failed to initialize client: ${msg}${RESET}`);
    return;
  }

  // Pre-flight
  try {
    const balanceAllowance = await clobClient.getBalanceAllowance({
      asset_type: AssetType.COLLATERAL,
    });
    const usdcBalance = parseFloat(balanceAllowance.balance) / 1_000_000;
    log(`  USDC Balance: ${GREEN}$${usdcBalance.toFixed(2)}${RESET}`);

    if (usdcBalance < totalCost) {
      log(`  ${YELLOW}WARNING: Balance $${usdcBalance.toFixed(2)} < Total $${totalCost.toFixed(2)}. Reducing bets.${RESET}`);
      // Scale down proportionally
      const scale = (usdcBalance * 0.95) / totalCost; // keep 5% buffer
      for (const t of trades) {
        t.amount = Math.max(1, Math.round(t.amount * scale * 100) / 100);
      }
    }
  } catch {
    log(`  ${YELLOW}Could not check balance, proceeding anyway${RESET}`);
  }

  try {
    await clobClient.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });
  } catch { /* ignore */ }

  // Execute each trade
  let successCount = 0;
  for (const trade of trades) {
    const opp = trade.opportunity;
    const shortQ = opp.question.length > 45 ? opp.question.substring(0, 45) + "..." : opp.question;

    log(`Placing: ${opp.side} "${shortQ}" | $${trade.amount.toFixed(2)}`);

    try {
      const signedOrder = await clobClient.createMarketOrder({
        tokenID: trade.tokenId,
        amount: trade.amount,
        side: Side.BUY,
      });

      const result = await clobClient.postOrder(signedOrder, OrderType.FOK);
      const response = typeof result === "string" ? JSON.parse(result) : result;
      const status = response?.status ?? "unknown";

      if (status === "matched" || status === "delayed" || response?.success) {
        log(`  ${GREEN}${BOLD}OK${RESET} (${status}) ${DIM}${response?.orderID ?? ""}${RESET}`);
        successCount++;
        logTrade({
          timestamp: new Date().toISOString(),
          question: opp.question,
          side: opp.side,
          amount: trade.amount,
          price: opp.side === "YES" ? opp.marketPrice : 1 - opp.marketPrice,
          expectedReturn: opp.expectedReturn,
          confidence: opp.confidence,
          newsAlignment: opp.newsAlignment,
          orderId: response?.orderID,
          status,
        });
      } else {
        log(`  ${YELLOW}${status}${RESET}: ${JSON.stringify(response).substring(0, 150)}`);
        logTrade({
          timestamp: new Date().toISOString(),
          question: opp.question,
          side: opp.side,
          amount: trade.amount,
          price: opp.side === "YES" ? opp.marketPrice : 1 - opp.marketPrice,
          expectedReturn: opp.expectedReturn,
          confidence: opp.confidence,
          newsAlignment: opp.newsAlignment,
          status: `failed: ${status}`,
        });
      }
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`  ${RED}ERROR: ${msg.substring(0, 150)}${RESET}`);
    }
  }

  console.log();
  log(`${GREEN}${BOLD}Auto-trade complete: ${successCount}/${trades.length} trades executed${RESET}`);
  log(`Trade history saved to ${BOLD}trade-history.jsonl${RESET}`);
  log(`Check positions at polymarket.com/portfolio`);
}

// -----------------------------------------------------------------------------
// Trade execution with Polymarket CLOB
// -----------------------------------------------------------------------------

async function initClobClient(): Promise<ClobClient> {
  const privateKey = process.env.POLYMARKET_PRIVATE_KEY!;
  const host = process.env.POLYMARKET_API_URL ?? "https://clob.polymarket.com";
  const proxyAddress = process.env.POLYMARKET_WALLET_ADDRESS;

  // Create ethers wallet as signer (EOA that controls the Polymarket proxy wallet)
  const wallet = new ethers.Wallet(privateKey);
  const eoaAddress = await wallet.getAddress();
  log(`  EOA address:   ${eoaAddress}`);
  log(`  Proxy address: ${proxyAddress ?? "NOT SET"}`);

  if (!proxyAddress) {
    console.error(
      `${RED}Error: POLYMARKET_WALLET_ADDRESS not set in .env.local${RESET}\n` +
        `This is your Polymarket proxy wallet address (shown on polymarket.com/portfolio).\n` +
        `It's different from your MetaMask/EOA address.`,
    );
    process.exit(1);
  }

  // Polymarket uses proxy wallets - when you deposit via the web UI, funds go to a
  // proxy contract controlled by your EOA. We need:
  //   signatureType = POLY_PROXY (tells exchange: "EOA signs on behalf of proxy")
  //   funderAddress = proxy wallet address (becomes the "maker" in orders)

  // Create client without creds first, then derive them
  const clientForDerive = new ClobClient(
    host,
    Chain.POLYGON,
    wallet,
    undefined,                // creds (derive below)
    SignatureType.POLY_PROXY, // proxy wallet signature
    proxyAddress,             // funderAddress = proxy wallet
  );

  log("Deriving API credentials from your wallet...");
  const creds = await clientForDerive.createOrDeriveApiKey();
  log(`  API Key: ${creds.key}`);
  log(`  API credentials derived successfully`);

  // Create fully authenticated client with POLY_PROXY + funderAddress
  return new ClobClient(
    host,
    Chain.POLYGON,
    wallet,
    creds,
    SignatureType.POLY_PROXY,
    proxyAddress,             // funderAddress = proxy wallet (maker in orders)
  );
}

interface Opportunity {
  question: string;
  marketPrice: number;
  estimatedProb: number;
  edge: number;
  expectedReturn: number;
  side: "YES" | "NO";
  suggestedBet: number;
  confidence: string;
  reasoning: string;
  keyFactors: string[];
  newsAlignment: string;
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
    if (isNaN(amount) || amount < 1) {
      console.log(`  ${RED}Invalid amount (minimum $1), skipping.${RESET}`);
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
      logTrade({
        timestamp: new Date().toISOString(),
        question: opp.question,
        side: opp.side,
        amount: trade.amount,
        price: rawPrice,
        expectedReturn: 0,
        confidence: opp.confidence,
        newsAlignment: opp.newsAlignment,
        orderId: orderId ?? undefined,
        status: String(status ?? "unknown"),
      });
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
