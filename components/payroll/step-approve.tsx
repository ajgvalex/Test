"use client";

import {
  CheckCircle2,
  FileText,
  Database,
  Download,
  Loader2,
  AlertTriangle,
} from "lucide-react";

import type { CountryCode } from "@/types";
import type {
  PayrollPreviewResult,
  PayrollApprovalResult,
} from "@/app/(protected)/payroll/actions/payroll-actions";
import { generateZohoJournalCSV } from "@/lib/reports/zoho-journal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface StepApproveProps {
  preview: PayrollPreviewResult | null;
  periodName: string;
  periodStartDate: string;
  periodEndDate: string;
  country: CountryCode;
  approving: boolean;
  result: PayrollApprovalResult | null;
  onApprove: () => void;
}

function fmt(amount: number, country: string) {
  const sym = country === "HN" ? "L" : "$";
  return `${sym} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function StepApprove({
  preview,
  periodName,
  periodStartDate,
  periodEndDate,
  country,
  approving,
  result,
  onApprove,
}: StepApproveProps) {
  function handleDownloadZohoCSV() {
    if (!preview) return;
    const currency = country === "SV" ? "USD" : "HNL";
    // Build reference from period dates: NOM-YYYY-MM-QX
    const endParts = periodEndDate.split("-");
    const refNumber = `NOM-${endParts[0]}-${endParts[1]}`;
    const csv = generateZohoJournalCSV(
      preview.entries,
      {
        journalDate: periodEndDate,
        referenceNumber: refNumber,
        currency,
        notes: `Nómina ${periodName}`,
      },
      country
    );
    downloadCsv(csv, `diario-contable-${refNumber}.csv`);
  }
  if (result?.success) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold">Nómina Aprobada</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            {result.message}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <Database className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm font-medium">Registros creados</p>
                <p className="text-2xl font-bold">{result.entries_created}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <FileText className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm font-medium">Recibos PDF</p>
                <p className="text-2xl font-bold">
                  {result.pdf_receipts_generated}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <Download className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-sm font-medium">Provisiones actualizadas</p>
                <p className="text-2xl font-bold">
                  {result.provisions_updated}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="space-y-3 p-4">
            <Button variant="outline" className="w-full">
              <Download className="mr-2 h-4 w-4" />
              Descargar todos los recibos (PDF)
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleDownloadZohoCSV}
            >
              <FileText className="mr-2 h-4 w-4" />
              Descargar Diario Contable (Zoho CSV)
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!preview) return null;

  const { totals, entries } = preview;
  const overrideCount = entries.filter((e) => e.has_override).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Aprobar y Generar</h2>
        <p className="text-sm text-muted-foreground">
          Revisa el resumen final antes de aprobar la nómina.
        </p>
      </div>

      {/* Summary card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumen de Nómina</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Período</span>
            <span className="font-medium">{periodName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Empleados</span>
            <span className="font-medium">{totals.employee_count}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total bruto</span>
            <span className="font-mono font-medium">
              {fmt(totals.gross, country)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Total deducciones
            </span>
            <span className="font-mono text-destructive">
              -{fmt(totals.deductions, country)}
            </span>
          </div>
          <Separator />
          <div className="flex items-center justify-between text-lg">
            <span className="font-semibold">Total neto a pagar</span>
            <span className="font-mono font-bold">
              {fmt(totals.net, country)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Costo patronal total
            </span>
            <span className="font-mono">
              {fmt(totals.employer_cost, country)}
            </span>
          </div>

          {overrideCount > 0 && (
            <>
              <Separator />
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <span>
                  {overrideCount} empleado(s) con override manual aplicado.
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Actions on approve */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Al aprobar se ejecutarán las siguientes acciones
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Badge variant="outline">1</Badge>
            <div>
              <p className="text-sm font-medium">
                Guardar registros de nómina
              </p>
              <p className="text-xs text-muted-foreground">
                Se crearán {totals.employee_count} payroll_entries en la base de
                datos.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline">2</Badge>
            <div>
              <p className="text-sm font-medium">Generar recibos PDF</p>
              <p className="text-xs text-muted-foreground">
                Se generarán {totals.employee_count} recibos de pago
                individuales.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline">3</Badge>
            <div>
              <p className="text-sm font-medium">Actualizar provisiones</p>
              <p className="text-xs text-muted-foreground">
                Se actualizarán aguinaldo, vacaciones, cesantía y demás
                provisiones.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Approve button */}
      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={onApprove}
          disabled={approving}
          className="min-w-[200px]"
        >
          {approving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Procesando...
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Aprobar Nómina
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
