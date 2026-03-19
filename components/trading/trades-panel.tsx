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
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import type { TradeRecord } from "@/types/trading-ui";

interface TradesPanelProps {
  trades: TradeRecord[];
}

export function TradesPanel({ trades }: TradesPanelProps) {
  const sortedTrades = [...trades].sort(
    (a, b) =>
      new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime()
  );

  const totalRealized = trades
    .filter((t) => t.pnl != null)
    .reduce((s, t) => s + (t.pnl ?? 0), 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Historial de Trades</CardTitle>
          <span className="text-sm text-muted-foreground">
            PnL Realizado:{" "}
            <span
              className={`font-semibold ${
                totalRealized >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {totalRealized >= 0 ? "+" : ""}${totalRealized.toFixed(2)}
            </span>
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Mercado</TableHead>
                <TableHead>Lado</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">PnL</TableHead>
                <TableHead>Razón</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTrades.map((trade) => (
                <TableRow key={trade.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {new Date(trade.executedAt).toLocaleDateString("es", {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    <span className="text-muted-foreground">
                      {new Date(trade.executedAt).toLocaleTimeString("es", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    <div className="text-sm truncate">{trade.marketTitle}</div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        trade.side === "buy"
                          ? "border-green-500/30 text-green-600"
                          : "border-red-500/30 text-red-600"
                      }
                    >
                      {trade.side === "buy" ? (
                        <ArrowUpRight className="h-3 w-3 mr-1" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3 mr-1" />
                      )}
                      {trade.side.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {(trade.price * 100).toFixed(1)}¢
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {trade.size}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    ${trade.total.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    {trade.pnl != null ? (
                      <span
                        className={`font-mono font-medium ${
                          trade.pnl >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[180px]">
                    <span className="text-xs text-muted-foreground truncate block">
                      {trade.reason}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
