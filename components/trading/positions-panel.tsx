"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { Position } from "@/types/trading-ui";

interface PositionsPanelProps {
  positions: Position[];
}

export function PositionsPanel({ positions }: PositionsPanelProps) {
  const totalUnrealized = positions.reduce((s, p) => s + p.unrealizedPnl, 0);
  const totalInvested = positions.reduce(
    (s, p) => s + p.avgEntryPrice * p.size,
    0
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Posiciones Abiertas</CardTitle>
          <div className="flex gap-4 text-sm">
            <span className="text-muted-foreground">
              Invertido:{" "}
              <span className="font-semibold text-foreground">
                ${totalInvested.toFixed(2)}
              </span>
            </span>
            <span className="text-muted-foreground">
              PnL:{" "}
              <span
                className={`font-semibold ${
                  totalUnrealized >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {totalUnrealized >= 0 ? "+" : ""}${totalUnrealized.toFixed(2)}
              </span>
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {positions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No hay posiciones abiertas actualmente.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mercado</TableHead>
                  <TableHead>Posición</TableHead>
                  <TableHead className="text-right">Tamaño</TableHead>
                  <TableHead className="text-right">Entrada</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">PnL</TableHead>
                  <TableHead className="text-right">ROI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.map((pos) => {
                  const roi =
                    ((pos.currentPrice - pos.avgEntryPrice) /
                      pos.avgEntryPrice) *
                    100;
                  const isProfit = pos.unrealizedPnl >= 0;
                  return (
                    <TableRow key={pos.id}>
                      <TableCell className="max-w-[250px]">
                        <div className="font-medium text-sm truncate">
                          {pos.marketTitle}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(pos.openedAt).toLocaleDateString("es")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            pos.outcome === "Yes"
                              ? "border-green-500/30 text-green-600"
                              : "border-red-500/30 text-red-600"
                          }
                        >
                          {pos.outcome}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {pos.size}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {(pos.avgEntryPrice * 100).toFixed(1)}¢
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {(pos.currentPrice * 100).toFixed(1)}¢
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`inline-flex items-center gap-1 font-mono font-medium ${
                            isProfit ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {isProfit ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {isProfit ? "+" : ""}${pos.unrealizedPnl.toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`font-mono text-sm ${
                            isProfit ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {isProfit ? "+" : ""}
                          {roi.toFixed(1)}%
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
