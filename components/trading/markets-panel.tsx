"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, ExternalLink, TrendingUp } from "lucide-react";
import type { PolymarketMarket } from "@/types/trading-ui";

interface MarketsPanelProps {
  markets: PolymarketMarket[];
}

export function MarketsPanel({ markets }: MarketsPanelProps) {
  const [search, setSearch] = useState("");

  const filtered = markets.filter(
    (m) =>
      m.title.toLowerCase().includes(search.toLowerCase()) ||
      m.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar mercados por título o categoría..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map((market) => {
          const yesOutcome = market.outcomes.find((o) => o.name === "Yes");
          const noOutcome = market.outcomes.find((o) => o.name === "No");
          return (
            <Card key={market.conditionId} className="hover:border-primary/30 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm leading-tight">
                    {market.title}
                  </CardTitle>
                  <Badge variant="outline" className="shrink-0 text-xs">
                    {market.category}
                  </Badge>
                </div>
                <CardDescription className="text-xs line-clamp-2">
                  {market.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Price bars */}
                <div className="space-y-2">
                  {yesOutcome && (
                    <div className="flex items-center gap-2">
                      <span className="w-8 text-xs font-medium text-green-600">
                        YES
                      </span>
                      <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500/20 flex items-center px-2 rounded-full"
                          style={{ width: `${yesOutcome.price * 100}%` }}
                        >
                          <span className="text-xs font-bold text-green-700">
                            {(yesOutcome.price * 100).toFixed(0)}¢
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  {noOutcome && (
                    <div className="flex items-center gap-2">
                      <span className="w-8 text-xs font-medium text-red-600">
                        NO
                      </span>
                      <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-red-500/20 flex items-center px-2 rounded-full"
                          style={{ width: `${noOutcome.price * 100}%` }}
                        >
                          <span className="text-xs font-bold text-red-700">
                            {(noOutcome.price * 100).toFixed(0)}¢
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Stats */}
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
                  <div className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    Vol: ${(market.volume / 1_000_000).toFixed(2)}M
                  </div>
                  <div>
                    Liquidez: ${(market.liquidity / 1_000).toFixed(0)}K
                  </div>
                  <div>
                    Vence:{" "}
                    {new Date(market.endDate).toLocaleDateString("es", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No se encontraron mercados con ese criterio de búsqueda.
        </div>
      )}
    </div>
  );
}
