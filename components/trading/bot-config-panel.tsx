"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Settings, Shield, Cpu, Save } from "lucide-react";
import type { BotConfig } from "@/types/trading-ui";

interface BotConfigPanelProps {
  config: BotConfig;
  onUpdate: (config: BotConfig) => void;
}

const STRATEGY_LABELS: Record<string, string> = {
  value: "Value (Kelly Criterion)",
  market_making: "Market Making",
  momentum: "Momentum",
  mean_reversion: "Mean Reversion",
  arbitrage: "Arbitrage Detection",
};

export function BotConfigPanel({ config, onUpdate }: BotConfigPanelProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Bot General Config */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cpu className="h-4 w-4" />
            Configuración General
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bot-name">Nombre del Bot</Label>
            <Input
              id="bot-name"
              value={config.name}
              onChange={(e) =>
                onUpdate({ ...config, name: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Estrategia</Label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(STRATEGY_LABELS).map(([key, label]) => (
                <Badge
                  key={key}
                  variant={config.strategy === key ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() =>
                    onUpdate({
                      ...config,
                      strategy: key as BotConfig["strategy"],
                    })
                  }
                >
                  {label}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Modo de Trading</Label>
            <div className="flex gap-2">
              <Badge
                variant={config.mode === "paper" ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => onUpdate({ ...config, mode: "paper" })}
              >
                Paper Trading
              </Badge>
              <Badge
                variant={config.mode === "live" ? "destructive" : "outline"}
                className="cursor-pointer"
                onClick={() => onUpdate({ ...config, mode: "live" })}
              >
                Live Trading
              </Badge>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="interval">Intervalo de ejecución (segundos)</Label>
            <Input
              id="interval"
              type="number"
              value={config.intervalMs / 1000}
              onChange={(e) =>
                onUpdate({
                  ...config,
                  intervalMs: Number(e.target.value) * 1000,
                })
              }
              min={10}
              max={3600}
            />
          </div>
        </CardContent>
      </Card>

      {/* Strategy Parameters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-4 w-4" />
            Parámetros de Estrategia
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {config.strategy === "value" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="min-edge">Edge mínimo (%)</Label>
                <Input
                  id="min-edge"
                  type="number"
                  step="0.01"
                  value={config.strategyParams.minEdge ?? 0.05}
                  onChange={(e) =>
                    onUpdate({
                      ...config,
                      strategyParams: {
                        ...config.strategyParams,
                        minEdge: Number(e.target.value),
                      },
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Solo se ejecutan trades cuando el edge supera este umbral
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="kelly">Fracción de Kelly</Label>
                <Input
                  id="kelly"
                  type="number"
                  step="0.05"
                  value={config.strategyParams.kellyFraction ?? 0.25}
                  onChange={(e) =>
                    onUpdate({
                      ...config,
                      strategyParams: {
                        ...config.strategyParams,
                        kellyFraction: Number(e.target.value),
                      },
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Porcentaje del Kelly Criterion a utilizar (0.25 = quarter Kelly)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="max-pos-strat">Tamaño máximo de posición ($)</Label>
                <Input
                  id="max-pos-strat"
                  type="number"
                  value={config.strategyParams.maxPositionSize ?? 500}
                  onChange={(e) =>
                    onUpdate({
                      ...config,
                      strategyParams: {
                        ...config.strategyParams,
                        maxPositionSize: Number(e.target.value),
                      },
                    })
                  }
                />
              </div>
            </>
          )}

          {config.strategy === "momentum" && (
            <>
              <div className="space-y-2">
                <Label>Período de lookback (horas)</Label>
                <Input type="number" defaultValue={24} min={1} />
              </div>
              <div className="space-y-2">
                <Label>Umbral de momentum (%)</Label>
                <Input type="number" step="0.5" defaultValue={5} />
              </div>
            </>
          )}

          {config.strategy === "mean_reversion" && (
            <>
              <div className="space-y-2">
                <Label>Ventana (períodos)</Label>
                <Input type="number" defaultValue={20} min={5} />
              </div>
              <div className="space-y-2">
                <Label>Desviaciones estándar</Label>
                <Input type="number" step="0.1" defaultValue={2.0} />
              </div>
            </>
          )}

          {config.strategy === "market_making" && (
            <>
              <div className="space-y-2">
                <Label>Spread (%)</Label>
                <Input type="number" step="0.1" defaultValue={2.0} />
              </div>
              <div className="space-y-2">
                <Label>Liquidez mínima ($)</Label>
                <Input type="number" defaultValue={50000} />
              </div>
            </>
          )}

          {config.strategy === "arbitrage" && (
            <>
              <div className="space-y-2">
                <Label>Spread mínimo (%)</Label>
                <Input type="number" step="0.1" defaultValue={1.0} />
              </div>
              <div className="space-y-2">
                <Label>Exposición máxima ($)</Label>
                <Input type="number" defaultValue={2000} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Risk Limits */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" />
            Gestión de Riesgo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="max-pos">Posición máxima ($)</Label>
              <Input
                id="max-pos"
                type="number"
                value={config.riskLimits.maxPositionSize}
                onChange={(e) =>
                  onUpdate({
                    ...config,
                    riskLimits: {
                      ...config.riskLimits,
                      maxPositionSize: Number(e.target.value),
                    },
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-daily">Pérdida diaria máxima ($)</Label>
              <Input
                id="max-daily"
                type="number"
                value={config.riskLimits.maxDailyLoss}
                onChange={(e) =>
                  onUpdate({
                    ...config,
                    riskLimits: {
                      ...config.riskLimits,
                      maxDailyLoss: Number(e.target.value),
                    },
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stop-loss">Stop Loss (%)</Label>
              <Input
                id="stop-loss"
                type="number"
                step="0.01"
                value={config.riskLimits.stopLossPct * 100}
                onChange={(e) =>
                  onUpdate({
                    ...config,
                    riskLimits: {
                      ...config.riskLimits,
                      stopLossPct: Number(e.target.value) / 100,
                    },
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-drawdown">Drawdown máximo (%)</Label>
              <Input
                id="max-drawdown"
                type="number"
                step="0.01"
                value={(config.riskLimits.maxDrawdownPct ?? 0.2) * 100}
                onChange={(e) =>
                  onUpdate({
                    ...config,
                    riskLimits: {
                      ...config.riskLimits,
                      maxDrawdownPct: Number(e.target.value) / 100,
                    },
                  })
                }
              />
            </div>
          </div>

          <Separator className="my-4" />

          <div className="flex justify-end">
            <Button>
              <Save className="h-4 w-4 mr-2" />
              Guardar Configuración
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
