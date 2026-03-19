-- Migration: Polymarket Trading Bot
-- Created: 2026-03-19

-- =============================================================================
-- 1. trading_bots - Bot configurations
-- =============================================================================
CREATE TABLE trading_bots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id),
    name TEXT NOT NULL,
    strategy_type TEXT NOT NULL CHECK (strategy_type IN ('market_making', 'momentum', 'mean_reversion', 'value', 'arbitrage')),
    strategy_params JSONB NOT NULL DEFAULT '{}',
    risk_limits JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'paused', 'error')),
    mode TEXT NOT NULL DEFAULT 'paper' CHECK (mode IN ('paper', 'live')),
    initial_balance NUMERIC(18,6) NOT NULL DEFAULT 1000,
    current_balance NUMERIC(18,6) NOT NULL DEFAULT 1000,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 2. bot_trades - Trade history
-- =============================================================================
CREATE TABLE bot_trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID REFERENCES trading_bots(id) ON DELETE CASCADE,
    market_id TEXT NOT NULL,
    market_title TEXT,
    token_id TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    price NUMERIC(18,8) NOT NULL,
    size NUMERIC(18,8) NOT NULL,
    total NUMERIC(18,6) NOT NULL,
    fee NUMERIC(18,6) DEFAULT 0,
    pnl NUMERIC(18,6),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'filled', 'partial', 'cancelled', 'failed')),
    executed_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 3. bot_positions - Current positions
-- =============================================================================
CREATE TABLE bot_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID REFERENCES trading_bots(id) ON DELETE CASCADE,
    market_id TEXT NOT NULL,
    market_title TEXT,
    token_id TEXT NOT NULL,
    outcome TEXT NOT NULL,
    avg_entry_price NUMERIC(18,8) NOT NULL,
    current_price NUMERIC(18,8),
    size NUMERIC(18,8) NOT NULL,
    unrealized_pnl NUMERIC(18,6) DEFAULT 0,
    opened_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (bot_id, token_id)
);

-- =============================================================================
-- 4. bot_performance_snapshots - Periodic performance snapshots
-- =============================================================================
CREATE TABLE bot_performance_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID REFERENCES trading_bots(id) ON DELETE CASCADE,
    balance NUMERIC(18,6) NOT NULL,
    total_pnl NUMERIC(18,6) NOT NULL,
    win_rate NUMERIC(5,2),
    total_trades INT DEFAULT 0,
    open_positions INT DEFAULT 0,
    snapshot_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 5. watched_markets - Markets the bot is tracking
-- =============================================================================
CREATE TABLE watched_markets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID REFERENCES trading_bots(id) ON DELETE CASCADE,
    condition_id TEXT NOT NULL,
    title TEXT,
    category TEXT,
    end_date TIMESTAMPTZ,
    active BOOLEAN DEFAULT true,
    added_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (bot_id, condition_id)
);

-- =============================================================================
-- Indexes
-- =============================================================================
CREATE INDEX idx_bot_trades_bot_id ON bot_trades(bot_id);
CREATE INDEX idx_bot_trades_executed_at ON bot_trades(executed_at);

CREATE INDEX idx_bot_positions_bot_id ON bot_positions(bot_id);
CREATE INDEX idx_bot_positions_token_id ON bot_positions(token_id);

CREATE INDEX idx_bot_performance_snapshots_bot_id ON bot_performance_snapshots(bot_id);

CREATE INDEX idx_watched_markets_bot_id ON watched_markets(bot_id);

-- =============================================================================
-- Row Level Security
-- =============================================================================
ALTER TABLE trading_bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE watched_markets ENABLE ROW LEVEL SECURITY;

-- Policies for trading_bots: users can manage bots belonging to their company
CREATE POLICY "Users can view their company bots"
    ON trading_bots FOR SELECT
    TO authenticated
    USING (company_id = auth.uid());

CREATE POLICY "Users can insert bots for their company"
    ON trading_bots FOR INSERT
    TO authenticated
    WITH CHECK (company_id = auth.uid());

CREATE POLICY "Users can update their company bots"
    ON trading_bots FOR UPDATE
    TO authenticated
    USING (company_id = auth.uid());

CREATE POLICY "Users can delete their company bots"
    ON trading_bots FOR DELETE
    TO authenticated
    USING (company_id = auth.uid());

-- Policies for bot_trades: access via bot ownership
CREATE POLICY "Users can view trades for their bots"
    ON bot_trades FOR SELECT
    TO authenticated
    USING (bot_id IN (SELECT id FROM trading_bots WHERE company_id = auth.uid()));

CREATE POLICY "Users can insert trades for their bots"
    ON bot_trades FOR INSERT
    TO authenticated
    WITH CHECK (bot_id IN (SELECT id FROM trading_bots WHERE company_id = auth.uid()));

CREATE POLICY "Users can update trades for their bots"
    ON bot_trades FOR UPDATE
    TO authenticated
    USING (bot_id IN (SELECT id FROM trading_bots WHERE company_id = auth.uid()));

CREATE POLICY "Users can delete trades for their bots"
    ON bot_trades FOR DELETE
    TO authenticated
    USING (bot_id IN (SELECT id FROM trading_bots WHERE company_id = auth.uid()));

-- Policies for bot_positions: access via bot ownership
CREATE POLICY "Users can view positions for their bots"
    ON bot_positions FOR SELECT
    TO authenticated
    USING (bot_id IN (SELECT id FROM trading_bots WHERE company_id = auth.uid()));

CREATE POLICY "Users can insert positions for their bots"
    ON bot_positions FOR INSERT
    TO authenticated
    WITH CHECK (bot_id IN (SELECT id FROM trading_bots WHERE company_id = auth.uid()));

CREATE POLICY "Users can update positions for their bots"
    ON bot_positions FOR UPDATE
    TO authenticated
    USING (bot_id IN (SELECT id FROM trading_bots WHERE company_id = auth.uid()));

CREATE POLICY "Users can delete positions for their bots"
    ON bot_positions FOR DELETE
    TO authenticated
    USING (bot_id IN (SELECT id FROM trading_bots WHERE company_id = auth.uid()));

-- Policies for bot_performance_snapshots: access via bot ownership
CREATE POLICY "Users can view snapshots for their bots"
    ON bot_performance_snapshots FOR SELECT
    TO authenticated
    USING (bot_id IN (SELECT id FROM trading_bots WHERE company_id = auth.uid()));

CREATE POLICY "Users can insert snapshots for their bots"
    ON bot_performance_snapshots FOR INSERT
    TO authenticated
    WITH CHECK (bot_id IN (SELECT id FROM trading_bots WHERE company_id = auth.uid()));

CREATE POLICY "Users can update snapshots for their bots"
    ON bot_performance_snapshots FOR UPDATE
    TO authenticated
    USING (bot_id IN (SELECT id FROM trading_bots WHERE company_id = auth.uid()));

CREATE POLICY "Users can delete snapshots for their bots"
    ON bot_performance_snapshots FOR DELETE
    TO authenticated
    USING (bot_id IN (SELECT id FROM trading_bots WHERE company_id = auth.uid()));

-- Policies for watched_markets: access via bot ownership
CREATE POLICY "Users can view watched markets for their bots"
    ON watched_markets FOR SELECT
    TO authenticated
    USING (bot_id IN (SELECT id FROM trading_bots WHERE company_id = auth.uid()));

CREATE POLICY "Users can insert watched markets for their bots"
    ON watched_markets FOR INSERT
    TO authenticated
    WITH CHECK (bot_id IN (SELECT id FROM trading_bots WHERE company_id = auth.uid()));

CREATE POLICY "Users can update watched markets for their bots"
    ON watched_markets FOR UPDATE
    TO authenticated
    USING (bot_id IN (SELECT id FROM trading_bots WHERE company_id = auth.uid()));

CREATE POLICY "Users can delete watched markets for their bots"
    ON watched_markets FOR DELETE
    TO authenticated
    USING (bot_id IN (SELECT id FROM trading_bots WHERE company_id = auth.uid()));
