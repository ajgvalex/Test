"use client";

import { useState } from "react";
import {
  Bot,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  BarChart3,
  Target,
  Zap,
  Pause,
  Play,
  Square,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarketsPanel } from "@/components/trading/markets-panel";
import { PositionsPanel } from "@/components/trading/positions-panel";
import { TradesPanel } from "@/components/trading/trades-panel";
import { PerformanceChart } from "@/components/trading/performance-chart";
import { BotConfigPanel } from "@/components/trading/bot-config-panel";
import {
  MOCK_BOT_CONFIG,
  MOCK_PORTFOLIO,
  MOCK_POSITIONS,
  MOCK_TRADES,
  MOCK_MARKETS,
  MOCK_PERFORMANCE_SNAPSHOTS,
} from "@/lib/polymarket/mock-data";
import type { BotConfig } from "@/types/trading-ui";

const STATUS_STYLES: Record<string, string> = {
  running: "bg-green-500/10 text-green-600 border-green-500/20",
  idle: "bg-gray-500/10 text-gray-600 border-gray-500/20",
  paused: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  error: "bg-red-500/10 text-red-600 border-red-500/20",
};

export default function TradingPage() {
  const [botConfig, setBotConfig] = useState<BotConfig>(MOCK_BOT_CONFIG);
  const portfolio = MOCK_PORTFOLIO;

  const handleStatusChange = (newStatus: string) => {
    setBotConfig((prev) => ({ ...prev, status: newStatus as BotConfig["status"] }));
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Bot className="h-8 w-8" />
            Trading Bot — Polymarket
          </h1>
          <p className="mt-1 text-muted-foreground">
            Agente automatizado de trading en mercados de predicción
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={STATUS_STYLES[botConfig.status] || ""}>
            {botConfig.status === "running" && <Activity className="mr-1 h-3 w-3 animate-pulse" />}
            {botConfig.status.toUpperCase()}
          </Badge>
          <Badge variant="outline">
            {botConfig.mode === "paper" ? "PAPER" : "LIVE"} Trading
          </Badge>
          <div className="flex gap-1">
            {botConfig.status === "running" ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleStatusChange("paused")}
                >
                  <Pause className="h-4 w-4 mr-1" />
                  Pausar
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleStatusChange("idle")}
                >
                  <Square className="h-4 w-4 mr-1" />
                  Detener
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={() => handleStatusChange("running")}
              >
                <Play className="h-4 w-4 mr-1" />
                Iniciar
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Balance Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${portfolio.totalBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">
              ${portfolio.availableBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })} disponible
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">PnL Total</CardTitle>
            {portfolio.totalPnl >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                portfolio.totalPnl >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {portfolio.totalPnl >= 0 ? "+" : ""}$
              {portfolio.totalPnl.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">
              Realizado: ${portfolio.realizedPnl.toFixed(2)} | No realizado: $
              {portfolio.unrealizedPnl.toFixed(2)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{portfolio.winRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {portfolio.totalTrades} trades | {portfolio.openPositions} posiciones abiertas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Sharpe Ratio</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{portfolio.sharpeRatio.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              Max Drawdown: {portfolio.maxDrawdown.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Performance Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Rendimiento del Bot
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PerformanceChart snapshots={MOCK_PERFORMANCE_SNAPSHOTS} />
        </CardContent>
      </Card>

      {/* Tabs: Markets, Positions, Trades, Config */}
      <Tabs defaultValue="positions" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="positions">
            Posiciones ({MOCK_POSITIONS.length})
          </TabsTrigger>
          <TabsTrigger value="markets">
            Mercados ({MOCK_MARKETS.length})
          </TabsTrigger>
          <TabsTrigger value="trades">
            Historial ({MOCK_TRADES.length})
          </TabsTrigger>
          <TabsTrigger value="config">Configuración</TabsTrigger>
        </TabsList>

        <TabsContent value="positions">
          <PositionsPanel positions={MOCK_POSITIONS} />
        </TabsContent>

        <TabsContent value="markets">
          <MarketsPanel markets={MOCK_MARKETS} />
        </TabsContent>

        <TabsContent value="trades">
          <TradesPanel trades={MOCK_TRADES} />
        </TabsContent>

        <TabsContent value="config">
          <BotConfigPanel config={botConfig} onUpdate={setBotConfig} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
