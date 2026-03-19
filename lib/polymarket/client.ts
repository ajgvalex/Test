import type {
  PolymarketMarket,
  TradeExecution,
  OrderBook,
  PaginatedResponse,
} from "@/types/polymarket";

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

export class PolymarketApiError extends Error {
  public readonly status: number;
  public readonly body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "PolymarketApiError";
    this.status = status;
    this.body = body;
  }
}

// ---------------------------------------------------------------------------
// Rate limiter – simple token-bucket (max 10 requests / second)
// ---------------------------------------------------------------------------

class TokenBucket {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms
  private lastRefill: number;

  constructor(maxTokens: number, refillPerSecond: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillPerSecond / 1000;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Wait until a token is available
    const waitMs = Math.ceil((1 - this.tokens) / this.refillRate);
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens -= 1;
  }
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Convert a market price (0-1) to an implied probability percentage (0-100).
 */
export function calculateImpliedProbability(price: number): number {
  return price * 100;
}

/**
 * Calculate the expected value of a position.
 *
 * EV = (probability * payout) - cost
 * where payout = 1 (binary market) and cost = price.
 */
export function calculateExpectedValue(probability: number, price: number): number {
  return probability * 1 - price;
}

/**
 * Format a raw USDC amount (6-decimal fixed-point) to a human-readable string.
 */
export function formatUSDC(amount: number): string {
  return `$${(amount / 1e6).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Client configuration
// ---------------------------------------------------------------------------

export interface PolymarketClientConfig {
  apiUrl?: string;
  apiKey?: string;
}

// ---------------------------------------------------------------------------
// Response types used internally
// ---------------------------------------------------------------------------

interface GetMarketsParams {
  next_cursor?: string;
  limit?: number;
  active?: boolean;
}

interface PriceResponse {
  price: number;
  spread: number;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class PolymarketClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly rateLimiter: TokenBucket;

  constructor(config: PolymarketClientConfig = {}) {
    this.baseUrl = (config.apiUrl ?? "https://clob.polymarket.com").replace(
      /\/$/,
      "",
    );
    this.apiKey = config.apiKey;
    this.rateLimiter = new TokenBucket(10, 10);
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    return headers;
  }

  private async request<T>(path: string, query?: Record<string, string>): Promise<T> {
    await this.rateLimiter.acquire();

    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== "") {
          url.searchParams.set(key, value);
        }
      }
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: this.buildHeaders(),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new PolymarketApiError(
        `Polymarket API error: ${response.status} ${response.statusText}`,
        response.status,
        body,
      );
    }

    return (await response.json()) as T;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Fetch a paginated list of markets.
   */
  async getMarkets(
    params?: GetMarketsParams,
  ): Promise<PaginatedResponse<PolymarketMarket>> {
    const query: Record<string, string> = {};

    if (params?.next_cursor) {
      query["next_cursor"] = params.next_cursor;
    }
    if (params?.limit !== undefined) {
      query["limit"] = String(params.limit);
    }
    if (params?.active !== undefined) {
      query["active"] = String(params.active);
    }

    return this.request<PaginatedResponse<PolymarketMarket>>("/markets", query);
  }

  /**
   * Fetch a single market by its condition ID.
   */
  async getMarket(conditionId: string): Promise<PolymarketMarket> {
    return this.request<PolymarketMarket>(`/markets/${encodeURIComponent(conditionId)}`);
  }

  /**
   * Fetch the order book for a given token ID.
   */
  async getOrderBook(tokenId: string): Promise<OrderBook> {
    return this.request<OrderBook>(
      `/book`,
      { token_id: tokenId },
    );
  }

  /**
   * Get the current best price and spread for a token.
   */
  async getPrice(tokenId: string): Promise<PriceResponse> {
    return this.request<PriceResponse>(
      `/price`,
      { token_id: tokenId },
    );
  }

  /**
   * Get the midpoint price for a token.
   */
  async getMidpoint(tokenId: string): Promise<number> {
    const data = await this.request<{ mid: number }>(
      `/midpoint`,
      { token_id: tokenId },
    );
    return data.mid;
  }

  /**
   * Fetch the trade history for a market identified by its condition ID.
   */
  async getMarketTradeHistory(conditionId: string): Promise<TradeExecution[]> {
    const data = await this.request<TradeExecution[]>(
      `/trades`,
      { condition_id: conditionId },
    );
    return data;
  }
}
