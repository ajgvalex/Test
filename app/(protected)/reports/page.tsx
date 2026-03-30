"use client";

import React, { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  FileText,
  FileSpreadsheet,
  Building2,
  Download,
  Loader2,
  BarChart3,
} from "lucide-react";

import type { CountryCode } from "@/types";
import { COUNTRY_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/mock-data";
import { getActiveEmployees } from "@/lib/data";
import { useAuth } from "@/lib/auth/auth-context";
import { calculateHondurasPayroll } from "@/lib/payroll-engine/honduras";
import { calculateElSalvadorPayroll } from "@/lib/payroll-engine/el-salvador";
import { getDeductionRules } from "@/lib/mock-data";
import type { PayslipData } from "@/lib/reports/payslip-pdf";
import { generateIHSSCSV, getIHSSTotals, type IHSSExportInput } from "@/lib/reports/ihss-csv";
import {
  generateOVISSSFile,
  getOVISSTotals,
  type OVISSSExportInput,
} from "@/lib/reports/ovisss-export";
import {
  generateBankCSV,
  getBankDisbursementTotals,
  type BankDisbursementInput,
} from "@/lib/reports/bank-csv";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PDFDownloadButton } from "@/components/reports/pdf-download-button";

// Lazy load dashboard (recharts is heavy)
const PayrollDashboard = dynamic(
  () =>
    import("@/components/reports/payroll-dashboard").then((mod) => mod.PayrollDashboard),
  {
    ssr: false,
    loading: () => <DashboardSkeleton />,
  }
);

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="h-4 w-24 animate-pulse rounded bg-muted mb-2" />
              <div className="h-6 w-32 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="flex items-center justify-center h-[300px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Constants
// ============================================================================

const PERIOD_NAME = "Marzo 2026 - 1ra Quincena";
const PERIOD_START = "2026-03-01";
const PERIOD_END = "2026-03-15";
const PAYMENT_DATE = "2026-03-15";

const COMPANY = {
  name: "Planilla Demo",
  legalName: "Planilla S.A. de C.V.",
  taxId: "0801-9999-00001",
  address: "Tegucigalpa, Honduras",
};

function fmt(amount: number, country: string): string {
  const sym = country === "HN" ? "L" : "$";
  return `${sym} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Helper to create a payslip PDF document element (called lazily client-side)
function makePayslipDoc(data: PayslipData) {
  // Inline require to avoid SSR bundling of @react-pdf/renderer
  const { PayslipDocument } = require("@/lib/reports/payslip-pdf");
  return React.createElement(PayslipDocument, { data });
}

function makeBulkPayslipDoc(payslips: PayslipData[]) {
  const { BulkPayslipDocument } = require("@/lib/reports/payslip-pdf");
  return React.createElement(BulkPayslipDocument, { payslips });
}

// ============================================================================
// Page
// ============================================================================

export default function ReportsPage() {
  const { user } = useAuth();
  const companyId = user?.company_id ?? "";
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>("HN");

  // Calculate payroll for all active employees in selected country
  const payrollResults = useMemo(() => {
    const rules = getDeductionRules(selectedCountry);
    const employees = getActiveEmployees(companyId, selectedCountry);

    return employees.map((emp) => {
      if (selectedCountry === "SV") {
        const result = calculateElSalvadorPayroll(
          { id: emp.id, base_salary: emp.base_salary, hire_date: emp.hire_date },
          { start_date: PERIOD_START, end_date: PERIOD_END },
          rules
        );
        return { employee: emp, result, country: "SV" as const };
      }
      const result = calculateHondurasPayroll(
        { id: emp.id, base_salary: emp.base_salary, hire_date: emp.hire_date },
        { start_date: PERIOD_START, end_date: PERIOD_END },
        rules
      );
      return { employee: emp, result, country: "HN" as const };
    });
  }, [selectedCountry]);

  // Build payslip data for PDFs
  const payslips: PayslipData[] = useMemo(
    () =>
      payrollResults.map(({ employee: emp, result, country }) => {
        const isHN = country === "HN";
        const hnResult = result as ReturnType<typeof calculateHondurasPayroll>;
        const svResult = result as ReturnType<typeof calculateElSalvadorPayroll>;
        const deductions: Record<string, number> = isHN
          ? {
              "IHSS E/M": hnResult.deductions.ihss_em,
              "IHSS IVM": hnResult.deductions.ihss_ivm,
              RAP: hnResult.deductions.rap,
              ISR: hnResult.deductions.isr,
            }
          : {
              ISSS: svResult.deductions.isss,
              AFP: svResult.deductions.afp,
              ISR: svResult.deductions.isr,
            };

        return {
          companyName: COMPANY.name,
          companyLegalName: COMPANY.legalName,
          companyTaxId: COMPANY.taxId,
          companyAddress: COMPANY.address,
          employeeName: `${emp.first_name} ${emp.last_name}`,
          employeeCode: emp.employee_code,
          identityNumber: emp.identity_number,
          position: emp.position,
          department: emp.department ?? "N/A",
          hireDate: emp.hire_date,
          paymentMethod: PAYMENT_METHOD_LABELS[emp.payment_method] ?? emp.payment_method,
          bankName: emp.bank_name ?? "",
          bankAccount: emp.bank_account ?? "",
          periodName: PERIOD_NAME,
          startDate: PERIOD_START,
          endDate: PERIOD_END,
          paymentDate: PAYMENT_DATE,
          baseSalary: result.base_salary,
          overtimeHours: 0,
          overtimeAmount: result.overtime_amount,
          bonuses: result.bonuses,
          commissions: result.commissions,
          otherEarnings: result.other_earnings,
          grossSalary: result.gross_salary,
          deductions,
          totalDeductions: isHN ? hnResult.deductions.total : svResult.deductions.total,
          netSalary: result.net_pay,
          currencySymbol: isHN ? "L" : "$",
        };
      }),
    [payrollResults]
  );

  // IHSS data
  const ihssInput: IHSSExportInput = useMemo(
    () => ({
      patronalNumber: "HN-PAT-001234",
      period: "202603",
      employees: payrollResults
        .filter((r) => r.country === "HN")
        .map(({ employee, result }) => {
          const hn = result as ReturnType<typeof calculateHondurasPayroll>;
          return {
            employee,
            grossSalary: hn.gross_salary,
            ihssEM_employee: hn.deductions.ihss_em,
            ihssIVM_employee: hn.deductions.ihss_ivm,
            ihssEM_employer: hn.employer_contributions.ihss_em,
            ihssIVM_employer: hn.employer_contributions.ihss_ivm,
            daysWorked: 15,
          };
        }),
    }),
    [payrollResults]
  );
  const ihssTotals = useMemo(() => getIHSSTotals(ihssInput), [ihssInput]);

  // OVISSS data
  const ovisssInput: OVISSSExportInput = useMemo(
    () => ({
      patronalNumber: "SV-PAT-005678",
      nit: "0614-050678-001-0",
      period: "202603",
      afpCode: "01",
      employees: payrollResults
        .filter((r) => r.country === "SV")
        .map(({ employee, result }) => {
          const sv = result as ReturnType<typeof calculateElSalvadorPayroll>;
          return {
            employee,
            nup: `NUP-${employee.identity_number}`,
            grossSalary: sv.gross_salary,
            isssEmployee: sv.deductions.isss,
            afpEmployee: sv.deductions.afp,
            isssEmployer: sv.employer_contributions.isss,
            afpEmployer: sv.employer_contributions.afp,
            daysCotized: 15,
          };
        }),
    }),
    [payrollResults]
  );
  const ovisssTotals = useMemo(() => getOVISSTotals(ovisssInput), [ovisssInput]);

  // Bank data
  const bankInput: BankDisbursementInput = useMemo(
    () => ({
      companyName: COMPANY.name,
      sourceAccount: "001-000-0000-CORP",
      periodName: PERIOD_NAME,
      paymentDate: PAYMENT_DATE,
      currency: selectedCountry === "HN" ? "HNL" : "USD",
      employees: payrollResults.map(({ employee, result }) => ({
        employee,
        netSalary: result.net_pay,
      })),
    }),
    [payrollResults, selectedCountry]
  );
  const bankTotals = useMemo(() => getBankDisbursementTotals(bankInput), [bankInput]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reportes</h1>
          <p className="text-sm text-muted-foreground">
            Recibos, planillas regulatorias, archivos bancarios y dashboard.
          </p>
        </div>
        <Select
          value={selectedCountry}
          onValueChange={(v) => setSelectedCountry(v as CountryCode)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="HN">{COUNTRY_LABELS.HN}</SelectItem>
            <SelectItem value="SV">{COUNTRY_LABELS.SV}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-6">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="dashboard">
            <BarChart3 className="mr-2 h-4 w-4 hidden sm:inline-block" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="payslips">
            <FileText className="mr-2 h-4 w-4 hidden sm:inline-block" />
            Recibos PDF
          </TabsTrigger>
          <TabsTrigger value="regulatory">
            <FileSpreadsheet className="mr-2 h-4 w-4 hidden sm:inline-block" />
            Planillas
          </TabsTrigger>
          <TabsTrigger value="bank">
            <Building2 className="mr-2 h-4 w-4 hidden sm:inline-block" />
            Archivo Bancario
          </TabsTrigger>
        </TabsList>

        {/* ============ DASHBOARD ============ */}
        <TabsContent value="dashboard">
          <PayrollDashboard />
        </TabsContent>

        {/* ============ PAYSLIPS ============ */}
        <TabsContent value="payslips">
          <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Recibos de Pago</h2>
                <p className="text-sm text-muted-foreground">
                  {PERIOD_NAME} — {payslips.length} empleados
                </p>
              </div>
              {payslips.length > 0 && (
                <PDFDownloadButton
                  getDocument={() => makeBulkPayslipDoc(payslips)}
                  fileName={`recibos-${PERIOD_START}-masivo.pdf`}
                  label="Descargar Todos (PDF)"
                  variant="default"
                  size="default"
                />
              )}
            </div>

            <div className="space-y-3">
              {payslips.map((ps, i) => (
                <Card key={i}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">{ps.employeeName}</p>
                        <p className="text-xs text-muted-foreground">
                          {ps.employeeCode} &middot; {ps.department} &middot;{" "}
                          <span className="font-mono">
                            Neto: {fmt(ps.netSalary, selectedCountry)}
                          </span>
                        </p>
                      </div>
                    </div>
                    <PDFDownloadButton
                      getDocument={() => makePayslipDoc(ps)}
                      fileName={`recibo-${ps.employeeCode}-${PERIOD_START}.pdf`}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ============ REGULATORY ============ */}
        <TabsContent value="regulatory">
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">Planillas Regulatorias</h2>

            {/* IHSS Honduras */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      Planilla IHSS
                      <Badge variant="outline">Honduras</Badge>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Formato CSV requerido por el portal del IHSS. Período: 202603
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() =>
                      downloadFile(
                        generateIHSSCSV(ihssInput),
                        `planilla-ihss-202603.csv`,
                        "text/csv"
                      )
                    }
                    disabled={ihssInput.employees.length === 0}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    CSV
                  </Button>
                </div>
              </CardHeader>
              {ihssInput.employees.length > 0 ? (
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Identidad</TableHead>
                          <TableHead>Nombre</TableHead>
                          <TableHead className="text-right">Cotizable</TableHead>
                          <TableHead className="text-right">Emp. EM</TableHead>
                          <TableHead className="text-right">Emp. IVM</TableHead>
                          <TableHead className="text-right">Pat. EM</TableHead>
                          <TableHead className="text-right">Pat. IVM</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ihssInput.employees.map((e) => (
                          <TableRow key={e.employee.id}>
                            <TableCell className="font-mono text-xs">
                              {e.employee.identity_number}
                            </TableCell>
                            <TableCell>
                              {e.employee.last_name} {e.employee.first_name}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {fmt(Math.min(e.grossSalary, 11290.28), "HN")}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {fmt(e.ihssEM_employee, "HN")}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {fmt(e.ihssIVM_employee, "HN")}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {fmt(e.ihssEM_employer, "HN")}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {fmt(e.ihssIVM_employer, "HN")}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-semibold bg-muted/50">
                          <TableCell colSpan={2}>Totales</TableCell>
                          <TableCell className="text-right font-mono">
                            {fmt(ihssTotals.cotizable, "HN")}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmt(ihssTotals.employeeEM, "HN")}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmt(ihssTotals.employeeIVM, "HN")}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmt(ihssTotals.employerEM, "HN")}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmt(ihssTotals.employerIVM, "HN")}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              ) : (
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Selecciona Honduras para ver la planilla IHSS.
                  </p>
                </CardContent>
              )}
            </Card>

            <Separator />

            {/* OVISSS El Salvador */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      Planilla ISSS/AFP (OVISSS)
                      <Badge variant="outline">El Salvador</Badge>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Formato pipe-delimited OVISSS. Período: 202603
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() =>
                      downloadFile(
                        generateOVISSSFile(ovisssInput),
                        `planilla-ovisss-202603.txt`,
                        "text/plain"
                      )
                    }
                    disabled={ovisssInput.employees.length === 0}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    OVISSS
                  </Button>
                </div>
              </CardHeader>
              {ovisssInput.employees.length > 0 ? (
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>DUI</TableHead>
                          <TableHead>Nombre</TableHead>
                          <TableHead className="text-right">Salario</TableHead>
                          <TableHead className="text-right">ISSS Emp.</TableHead>
                          <TableHead className="text-right">AFP Emp.</TableHead>
                          <TableHead className="text-right">ISSS Pat.</TableHead>
                          <TableHead className="text-right">AFP Pat.</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ovisssInput.employees.map((e) => (
                          <TableRow key={e.employee.id}>
                            <TableCell className="font-mono text-xs">
                              {e.employee.identity_number}
                            </TableCell>
                            <TableCell>
                              {e.employee.last_name}, {e.employee.first_name}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {fmt(e.grossSalary, "SV")}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {fmt(e.isssEmployee, "SV")}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {fmt(e.afpEmployee, "SV")}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {fmt(e.isssEmployer, "SV")}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {fmt(e.afpEmployer, "SV")}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-semibold bg-muted/50">
                          <TableCell colSpan={2}>Totales</TableCell>
                          <TableCell className="text-right font-mono">
                            {fmt(ovisssTotals.salary, "SV")}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmt(ovisssTotals.isssEmployee, "SV")}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmt(ovisssTotals.afpEmployee, "SV")}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmt(ovisssTotals.isssEmployer, "SV")}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmt(ovisssTotals.afpEmployer, "SV")}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              ) : (
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Selecciona El Salvador para ver la planilla OVISSS.
                  </p>
                </CardContent>
              )}
            </Card>
          </div>
        </TabsContent>

        {/* ============ BANK FILE ============ */}
        <TabsContent value="bank">
          <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">
                  Archivo Bancario — Dispersión de Salarios
                </h2>
                <p className="text-sm text-muted-foreground">
                  {PERIOD_NAME} — Formato CSV genérico
                </p>
              </div>
              <Button
                onClick={() =>
                  downloadFile(
                    generateBankCSV(bankInput),
                    `dispersion-bancaria-${PAYMENT_DATE}.csv`,
                    "text/csv"
                  )
                }
              >
                <Download className="mr-2 h-4 w-4" />
                Descargar CSV
              </Button>
            </div>

            {/* Summary */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Transferencias</p>
                  <p className="text-xl font-bold">{bankTotals.transferCount}</p>
                  <p className="text-sm font-mono">
                    {fmt(bankTotals.transferTotal, selectedCountry)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">
                    Otros Pagos (cheque/efectivo)
                  </p>
                  <p className="text-xl font-bold">{bankTotals.otherCount}</p>
                  <p className="text-sm font-mono">
                    {fmt(bankTotals.otherTotal, selectedCountry)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-xl font-bold">
                    {bankTotals.transferCount + bankTotals.otherCount}
                  </p>
                  <p className="text-sm font-mono font-semibold">
                    {fmt(bankTotals.grandTotal, selectedCountry)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Preview table */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Preview del Archivo</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cuenta</TableHead>
                        <TableHead>Beneficiario</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                        <TableHead>Referencia</TableHead>
                        <TableHead>Método</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bankInput.employees.map(({ employee, netSalary }, i) => (
                        <TableRow key={employee.id}>
                          <TableCell className="font-mono text-xs">
                            {employee.bank_account ?? "—"}
                          </TableCell>
                          <TableCell>
                            {employee.first_name} {employee.last_name}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmt(netSalary, selectedCountry)}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            PAY-{PAYMENT_DATE.replace(/-/g, "")}-
                            {String(i + 1).padStart(4, "0")}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                employee.payment_method === "bank_transfer"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {PAYMENT_METHOD_LABELS[employee.payment_method]}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
