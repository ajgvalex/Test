"use client";

import { useState } from "react";
import { Pencil, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

import type { CountryCode } from "@/types";
import type {
  EmployeePayrollPreview,
  PayrollPreviewResult,
  EmployeeOverride,
} from "@/app/payroll/actions/payroll-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface StepPreviewProps {
  preview: PayrollPreviewResult | null;
  loading: boolean;
  country: CountryCode;
  overrides: Record<string, EmployeeOverride>;
  onOverrideChange: (
    employeeId: string,
    override: EmployeeOverride
  ) => void;
}

function fmt(amount: number, country: string) {
  const sym = country === "HN" ? "L" : "$";
  return `${sym} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export function StepPreview({
  preview,
  loading,
  country,
  overrides,
  onOverrideChange,
}: StepPreviewProps) {
  const [editEntry, setEditEntry] = useState<EmployeePayrollPreview | null>(
    null
  );
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Override form state
  const [overrideOT, setOverrideOT] = useState("");
  const [overrideBonuses, setOverrideBonuses] = useState("");
  const [overrideCommissions, setOverrideCommissions] = useState("");
  const [overrideOther, setOverrideOther] = useState("");
  const [overrideNet, setOverrideNet] = useState("");

  function openOverride(entry: EmployeePayrollPreview) {
    setEditEntry(entry);
    const existing = overrides[entry.employee.id];
    setOverrideOT(
      String(existing?.overtime_hours ?? entry.overtime_hours)
    );
    setOverrideBonuses(String(existing?.bonuses ?? entry.bonuses));
    setOverrideCommissions(
      String(existing?.commissions ?? entry.commissions)
    );
    setOverrideOther(
      String(existing?.other_earnings ?? entry.other_earnings)
    );
    setOverrideNet("");
  }

  function saveOverride() {
    if (!editEntry) return;
    const override: EmployeeOverride = {};
    if (overrideOT !== String(editEntry.overtime_hours))
      override.overtime_hours = Number(overrideOT) || 0;
    if (overrideBonuses !== String(editEntry.bonuses))
      override.bonuses = Number(overrideBonuses) || 0;
    if (overrideCommissions !== String(editEntry.commissions))
      override.commissions = Number(overrideCommissions) || 0;
    if (overrideOther !== String(editEntry.other_earnings))
      override.other_earnings = Number(overrideOther) || 0;
    if (overrideNet)
      override.net_salary_override = Number(overrideNet) || undefined;

    onOverrideChange(editEntry.employee.id, override);
    setEditEntry(null);
  }

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="text-sm text-muted-foreground">
            Calculando nómina...
          </p>
        </div>
      </div>
    );
  }

  if (!preview) {
    return (
      <Card>
        <CardContent className="flex min-h-[200px] items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">
            Esperando cálculo de nómina.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { entries, totals } = preview;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Preview de Cálculo</h2>
        <p className="text-sm text-muted-foreground">
          Revisa el desglose por empleado. Puedes hacer override manual antes de
          aprobar.
        </p>
      </div>

      {/* Totals summary */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Bruto</p>
            <p className="text-lg font-bold">{fmt(totals.gross, country)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Deducciones</p>
            <p className="text-lg font-bold text-destructive">
              {fmt(totals.deductions, country)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Neto</p>
            <p className="text-lg font-bold">{fmt(totals.net, country)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Empleados</p>
            <p className="text-lg font-bold">{totals.employee_count}</p>
          </CardContent>
        </Card>
      </div>

      {/* Employee breakdown table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Desglose por Empleado</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empleado</TableHead>
                  <TableHead className="text-right">Bruto</TableHead>
                  <TableHead className="text-right">Deducciones</TableHead>
                  <TableHead className="text-right">Neto</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <>
                    <TableRow
                      key={entry.employee.id}
                      className="cursor-pointer"
                      onClick={() =>
                        setExpandedRow(
                          expandedRow === entry.employee.id
                            ? null
                            : entry.employee.id
                        )
                      }
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="font-medium">
                              {entry.employee.first_name}{" "}
                              {entry.employee.last_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {entry.employee.employee_code} &middot;{" "}
                              {entry.employee.position}
                            </p>
                          </div>
                          {entry.has_override && (
                            <Badge variant="outline" className="text-xs">
                              <AlertTriangle className="mr-1 h-3 w-3" />
                              Override
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {fmt(entry.gross_salary, country)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-destructive">
                        {fmt(entry.total_deductions, country)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {fmt(entry.net_salary, country)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              openOverride(entry);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {expandedRow === entry.employee.id ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedRow === entry.employee.id && (
                      <TableRow key={`${entry.employee.id}-detail`}>
                        <TableCell colSpan={5} className="bg-muted/30 p-4">
                          <div className="grid gap-4 sm:grid-cols-3">
                            {/* Ingresos */}
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                                Ingresos
                              </p>
                              <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                  <span>Salario base</span>
                                  <span className="font-mono">
                                    {fmt(entry.base_salary, country)}
                                  </span>
                                </div>
                                {entry.overtime_amount > 0 && (
                                  <div className="flex justify-between">
                                    <span>
                                      Horas extra ({entry.overtime_hours}h)
                                    </span>
                                    <span className="font-mono">
                                      {fmt(entry.overtime_amount, country)}
                                    </span>
                                  </div>
                                )}
                                {entry.bonuses > 0 && (
                                  <div className="flex justify-between">
                                    <span>Bonos</span>
                                    <span className="font-mono">
                                      {fmt(entry.bonuses, country)}
                                    </span>
                                  </div>
                                )}
                                {entry.commissions > 0 && (
                                  <div className="flex justify-between">
                                    <span>Comisiones</span>
                                    <span className="font-mono">
                                      {fmt(entry.commissions, country)}
                                    </span>
                                  </div>
                                )}
                                {entry.other_earnings > 0 && (
                                  <div className="flex justify-between">
                                    <span>Otros</span>
                                    <span className="font-mono">
                                      {fmt(entry.other_earnings, country)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Deducciones */}
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                                Deducciones
                              </p>
                              <div className="space-y-1 text-sm">
                                {Object.entries(entry.deductions).map(
                                  ([key, val]) => (
                                    <div
                                      key={key}
                                      className="flex justify-between"
                                    >
                                      <span>{key}</span>
                                      <span className="font-mono text-destructive">
                                        {fmt(val, country)}
                                      </span>
                                    </div>
                                  )
                                )}
                              </div>
                            </div>

                            {/* Resumen */}
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                                Resumen
                              </p>
                              <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                  <span>Bruto</span>
                                  <span className="font-mono">
                                    {fmt(entry.gross_salary, country)}
                                  </span>
                                </div>
                                <div className="flex justify-between text-destructive">
                                  <span>Deducciones</span>
                                  <span className="font-mono">
                                    -{fmt(entry.total_deductions, country)}
                                  </span>
                                </div>
                                <Separator />
                                <div className="flex justify-between font-semibold">
                                  <span>Neto</span>
                                  <span className="font-mono">
                                    {fmt(entry.net_salary, country)}
                                  </span>
                                </div>
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span>Costo patronal</span>
                                  <span className="font-mono">
                                    {fmt(entry.employer_cost, country)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile card list */}
          <div className="space-y-3 p-4 md:hidden">
            {entries.map((entry) => (
              <div
                key={entry.employee.id}
                className="rounded-lg border p-4 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">
                      {entry.employee.first_name} {entry.employee.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {entry.employee.employee_code}
                    </p>
                  </div>
                  {entry.has_override && (
                    <Badge variant="outline" className="text-xs">
                      Override
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Bruto</p>
                    <p className="text-sm font-mono font-medium">
                      {fmt(entry.gross_salary, country)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Deduc.</p>
                    <p className="text-sm font-mono text-destructive">
                      {fmt(entry.total_deductions, country)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Neto</p>
                    <p className="text-sm font-mono font-semibold">
                      {fmt(entry.net_salary, country)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => openOverride(entry)}
                >
                  <Pencil className="mr-2 h-3 w-3" />
                  Override
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Override dialog */}
      <Dialog open={!!editEntry} onOpenChange={() => setEditEntry(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Override Manual</DialogTitle>
            <DialogDescription>
              {editEntry
                ? `${editEntry.employee.first_name} ${editEntry.employee.last_name} — ${editEntry.employee.employee_code}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Horas extra</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={overrideOT}
                  onChange={(e) => setOverrideOT(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Bonos</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={overrideBonuses}
                  onChange={(e) => setOverrideBonuses(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Comisiones</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={overrideCommissions}
                  onChange={(e) => setOverrideCommissions(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Otros ingresos</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={overrideOther}
                  onChange={(e) => setOverrideOther(e.target.value)}
                />
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>
                Override neto (dejar vacío para cálculo automático)
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Calculado automáticamente"
                value={overrideNet}
                onChange={(e) => setOverrideNet(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Solo usar en casos excepcionales. El neto se recalculará
                automáticamente si se dejan los campos de arriba.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntry(null)}>
              Cancelar
            </Button>
            <Button onClick={saveOverride}>Aplicar Override</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
