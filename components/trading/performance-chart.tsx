"use client";

import type { PerformanceSnapshot } from "@/types/trading-ui";

interface PerformanceChartProps {
  snapshots: PerformanceSnapshot[];
}

export function PerformanceChart({ snapshots }: PerformanceChartProps) {
  if (snapshots.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No hay datos de rendimiento disponibles todavía.
      </div>
    );
  }

  const maxBalance = Math.max(...snapshots.map((s) => s.balance));
  const minBalance = Math.min(...snapshots.map((s) => s.balance));
  const range = maxBalance - minBalance || 1;
  const chartHeight = 200;
  const chartWidth = 100; // percentage-based

  const points = snapshots.map((s, i) => {
    const x = (i / (snapshots.length - 1)) * chartWidth;
    const y = chartHeight - ((s.balance - minBalance) / range) * chartHeight;
    return { x, y, snapshot: s };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const areaD = `${pathD} L ${points[points.length - 1].x} ${chartHeight} L ${points[0].x} ${chartHeight} Z`;

  const lastPnl = snapshots[snapshots.length - 1].totalPnl;
  const isPositive = lastPnl >= 0;

  return (
    <div className="space-y-4">
      {/* SVG Chart */}
      <div className="relative">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-48"
          preserveAspectRatio="none"
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
            <line
              key={pct}
              x1="0"
              y1={chartHeight * pct}
              x2={chartWidth}
              y2={chartHeight * pct}
              stroke="currentColor"
              strokeOpacity="0.07"
              strokeWidth="0.3"
            />
          ))}

          {/* Area fill */}
          <path
            d={areaD}
            fill={isPositive ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)"}
            fillOpacity="0.1"
          />

          {/* Line */}
          <path
            d={pathD}
            fill="none"
            stroke={isPositive ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)"}
            strokeWidth="0.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Dots on data points */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="0.8"
              fill={isPositive ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)"}
            />
          ))}
        </svg>

        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 h-48 flex flex-col justify-between text-xs text-muted-foreground py-1">
          <span>${maxBalance.toFixed(0)}</span>
          <span>${((maxBalance + minBalance) / 2).toFixed(0)}</span>
          <span>${minBalance.toFixed(0)}</span>
        </div>
      </div>

      {/* Date labels */}
      <div className="flex justify-between text-xs text-muted-foreground px-8">
        {snapshots
          .filter(
            (_, i) =>
              i === 0 ||
              i === Math.floor(snapshots.length / 2) ||
              i === snapshots.length - 1
          )
          .map((s) => (
            <span key={s.id}>
              {new Date(s.snapshotAt).toLocaleDateString("es", {
                month: "short",
                day: "numeric",
              })}
            </span>
          ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 pt-2 border-t">
        <div className="text-center">
          <div className="text-xs text-muted-foreground">Balance Inicial</div>
          <div className="text-sm font-semibold">
            ${snapshots[0].balance.toFixed(0)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-muted-foreground">Balance Actual</div>
          <div className="text-sm font-semibold">
            ${snapshots[snapshots.length - 1].balance.toFixed(0)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-muted-foreground">PnL Total</div>
          <div
            className={`text-sm font-semibold ${
              isPositive ? "text-green-600" : "text-red-600"
            }`}
          >
            {isPositive ? "+" : ""}${lastPnl.toFixed(2)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-muted-foreground">Win Rate</div>
          <div className="text-sm font-semibold">
            {snapshots[snapshots.length - 1].winRate.toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}
