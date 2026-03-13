"use client";

import type { CountryCode, PayrollPeriod, PayrollFrequency } from "@/types";
import { COUNTRY_LABELS, MOCK_PAYROLL_PERIODS } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar, Globe, Clock } from "lucide-react";

interface StepPeriodSelectProps {
  country: CountryCode | "";
  onCountryChange: (country: CountryCode) => void;
  selectedPeriod: PayrollPeriod | null;
  onPeriodChange: (period: PayrollPeriod) => void;
  frequency: PayrollFrequency;
  onFrequencyChange: (freq: PayrollFrequency) => void;
}

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Semanal",
  biweekly: "Quincenal",
  semimonthly: "Quincenal",
  monthly: "Mensual",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  draft: "outline",
  paid: "secondary",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  calculating: "Calculando",
  review: "Revisión",
  approved: "Aprobado",
  paid: "Pagado",
  voided: "Anulado",
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("es-HN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function StepPeriodSelect({
  country,
  onCountryChange,
  selectedPeriod,
  onPeriodChange,
  frequency,
  onFrequencyChange,
}: StepPeriodSelectProps) {
  const draftPeriods = MOCK_PAYROLL_PERIODS.filter(
    (p) => p.status === "draft"
  );
  const recentPeriods = MOCK_PAYROLL_PERIODS.filter(
    (p) => p.status !== "draft"
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Seleccionar Período y País</h2>
        <p className="text-sm text-muted-foreground">
          Define el período de nómina y el país a procesar.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Country selection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4" />
              País
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={country}
              onValueChange={(v) => onCountryChange(v as CountryCode)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar país" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="HN">{COUNTRY_LABELS.HN}</SelectItem>
                <SelectItem value="SV">{COUNTRY_LABELS.SV}</SelectItem>
                <SelectItem value="GT">{COUNTRY_LABELS.GT}</SelectItem>
                <SelectItem value="NI">{COUNTRY_LABELS.NI}</SelectItem>
                <SelectItem value="CR">{COUNTRY_LABELS.CR}</SelectItem>
                <SelectItem value="PA">{COUNTRY_LABELS.PA}</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Frequency selection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" />
              Frecuencia
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={frequency}
              onValueChange={(v) =>
                onFrequencyChange(v as PayrollFrequency)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="semimonthly">Quincenal</SelectItem>
                <SelectItem value="biweekly">Bi-semanal</SelectItem>
                <SelectItem value="monthly">Mensual</SelectItem>
                <SelectItem value="weekly">Semanal</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      {/* Available periods */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4" />
            Períodos Disponibles
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {draftPeriods.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay períodos en borrador.
            </p>
          ) : (
            draftPeriods.map((period) => (
              <button
                key={period.id}
                type="button"
                onClick={() => onPeriodChange(period)}
                className={`w-full rounded-lg border p-4 text-left transition-colors hover:bg-accent ${
                  selectedPeriod?.id === period.id
                    ? "border-primary bg-accent"
                    : "border-border"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{period.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(period.start_date)} —{" "}
                      {formatDate(period.end_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[period.status] ?? "outline"}>
                      {STATUS_LABELS[period.status] ?? period.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {FREQUENCY_LABELS[period.frequency]}
                    </span>
                  </div>
                </div>
              </button>
            ))
          )}

          {/* Recent (non-draft) periods for reference */}
          {recentPeriods.length > 0 && (
            <>
              <p className="pt-2 text-xs font-medium text-muted-foreground uppercase">
                Períodos recientes
              </p>
              {recentPeriods.map((period) => (
                <div
                  key={period.id}
                  className="flex items-center justify-between rounded-lg border border-dashed p-3 opacity-60"
                >
                  <div>
                    <p className="text-sm font-medium">{period.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(period.start_date)} —{" "}
                      {formatDate(period.end_date)}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {STATUS_LABELS[period.status]}
                  </Badge>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
