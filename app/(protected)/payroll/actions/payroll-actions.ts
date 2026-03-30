"use server";

import type { CountryCode, DeductionRule, PayrollEntry } from "@/types";
import type { Employee } from "@/types";
import { calculateHondurasPayroll } from "@/lib/payroll-engine/honduras";
import { calculateElSalvadorPayroll } from "@/lib/payroll-engine/el-salvador";
import { getDeductionRules } from "@/lib/mock-data";
import { getActiveEmployees } from "@/lib/data";
import type { Novedad } from "@/lib/mock-data";

// ============================================================================
// Types for the payroll wizard
// ============================================================================

export interface PayrollCalcInput {
  period_id: string;
  period_name: string;
  start_date: string;
  end_date: string;
  country: CountryCode;
  company_id: string;
  novedades: Novedad[];
  /** Override map: employee_id → overridden fields */
  overrides: Record<string, EmployeeOverride>;
}

export interface EmployeeOverride {
  overtime_hours?: number;
  bonuses?: number;
  commissions?: number;
  other_earnings?: number;
  net_salary_override?: number;
}

export interface EmployeePayrollPreview {
  employee: Employee;
  gross_salary: number;
  base_salary: number;
  overtime_hours: number;
  overtime_amount: number;
  bonuses: number;
  commissions: number;
  other_earnings: number;
  deductions: Record<string, number>;
  total_deductions: number;
  net_salary: number;
  employer_cost: number;
  has_override: boolean;
}

export interface PayrollPreviewResult {
  entries: EmployeePayrollPreview[];
  totals: {
    gross: number;
    deductions: number;
    net: number;
    employer_cost: number;
    employee_count: number;
  };
}

export interface PayrollApprovalResult {
  success: boolean;
  period_id: string;
  entries_created: number;
  pdf_receipts_generated: number;
  provisions_updated: number;
  message: string;
}

// ============================================================================
// Server Action: Calculate payroll preview
// ============================================================================

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

export async function calculatePayrollPreview(
  input: PayrollCalcInput
): Promise<PayrollPreviewResult> {
  const { country, company_id, novedades, overrides } = input;
  const rules: DeductionRule[] = getDeductionRules(country);

  // Filter active employees for selected country and company
  const activeEmployees = getActiveEmployees(company_id, country);

  // Build per-employee novedad aggregation
  const novedadMap = new Map<
    string,
    { overtime_hours: number; bonuses: number; commissions: number; other_earnings: number; salary_change?: number }
  >();

  for (const n of novedades) {
    const current = novedadMap.get(n.employee_id) ?? {
      overtime_hours: 0,
      bonuses: 0,
      commissions: 0,
      other_earnings: 0,
    };
    switch (n.type) {
      case "overtime":
        current.overtime_hours += n.hours ?? 0;
        break;
      case "bonus":
        current.bonuses += n.amount;
        break;
      case "commission":
        current.commissions += n.amount;
        break;
      case "salary_change":
        current.salary_change = n.amount;
        break;
      case "other_earning":
        current.other_earnings += n.amount;
        break;
      case "deduction":
        // Handled as negative other_earnings for simplicity
        current.other_earnings -= n.amount;
        break;
    }
    novedadMap.set(n.employee_id, current);
  }

  const entries: EmployeePayrollPreview[] = [];

  for (const emp of activeEmployees) {
    const nov = novedadMap.get(emp.id);
    const override = overrides[emp.id];
    const hasOverride = !!override;

    // Apply salary change if any
    const effectiveSalary = nov?.salary_change ?? emp.base_salary;

    const overtimeHours = override?.overtime_hours ?? nov?.overtime_hours ?? 0;
    const bonuses = override?.bonuses ?? nov?.bonuses ?? 0;
    const commissions = override?.commissions ?? nov?.commissions ?? 0;
    const otherEarnings = override?.other_earnings ?? nov?.other_earnings ?? 0;

    if (country === "SV") {
      const result = calculateElSalvadorPayroll(
        { id: emp.id, base_salary: effectiveSalary, hire_date: emp.hire_date },
        {
          start_date: input.start_date,
          end_date: input.end_date,
          overtime_hours: overtimeHours,
          bonuses,
          commissions,
          other_earnings: otherEarnings,
        },
        rules
      );

      let netSalary = result.net_pay;
      if (override?.net_salary_override != null) {
        netSalary = override.net_salary_override;
      }

      entries.push({
        employee: emp,
        gross_salary: result.gross_salary,
        base_salary: result.base_salary,
        overtime_hours: overtimeHours,
        overtime_amount: result.overtime_amount,
        bonuses: result.bonuses,
        commissions: result.commissions,
        other_earnings: result.other_earnings,
        deductions: {
          ISSS: result.deductions.isss,
          AFP: result.deductions.afp,
          ISR: result.deductions.isr,
        },
        total_deductions: result.deductions.total,
        net_salary: netSalary,
        employer_cost: result.employer_cost,
        has_override: hasOverride,
      });
    } else {
      // Honduras (default)
      const result = calculateHondurasPayroll(
        { id: emp.id, base_salary: effectiveSalary, hire_date: emp.hire_date },
        {
          start_date: input.start_date,
          end_date: input.end_date,
          overtime_hours: overtimeHours,
          bonuses,
          commissions,
          other_earnings: otherEarnings,
        },
        rules
      );

      let netSalary = result.net_pay;
      if (override?.net_salary_override != null) {
        netSalary = override.net_salary_override;
      }

      entries.push({
        employee: emp,
        gross_salary: result.gross_salary,
        base_salary: result.base_salary,
        overtime_hours: overtimeHours,
        overtime_amount: result.overtime_amount,
        bonuses: result.bonuses,
        commissions: result.commissions,
        other_earnings: result.other_earnings,
        deductions: {
          "IHSS E/M": result.deductions.ihss_em,
          "IHSS IVM": result.deductions.ihss_ivm,
          RAP: result.deductions.rap,
          ISR: result.deductions.isr,
        },
        total_deductions: result.deductions.total,
        net_salary: netSalary,
        employer_cost: result.employer_cost,
        has_override: hasOverride,
      });
    }
  }

  const totals = {
    gross: round2(entries.reduce((s, e) => s + e.gross_salary, 0)),
    deductions: round2(entries.reduce((s, e) => s + e.total_deductions, 0)),
    net: round2(entries.reduce((s, e) => s + e.net_salary, 0)),
    employer_cost: round2(entries.reduce((s, e) => s + e.employer_cost, 0)),
    employee_count: entries.length,
  };

  return { entries, totals };
}

// ============================================================================
// Server Action: Approve & generate payroll
// ============================================================================

export async function approvePayroll(
  input: PayrollCalcInput
): Promise<PayrollApprovalResult> {
  // 1. Calculate final payroll
  const preview = await calculatePayrollPreview(input);

  // 2. Simulate creating payroll entries in DB
  const payrollEntries: PayrollEntry[] = preview.entries.map((entry) => ({
    id: crypto.randomUUID(),
    company_id: entry.employee.company_id,
    payroll_period_id: input.period_id,
    employee_id: entry.employee.id,
    base_salary: entry.base_salary,
    overtime_hours: entry.overtime_hours,
    overtime_amount: entry.overtime_amount,
    bonuses: entry.bonuses,
    commissions: entry.commissions,
    other_earnings: entry.other_earnings,
    gross_salary: entry.gross_salary,
    deductions: entry.deductions,
    total_deductions: entry.total_deductions,
    benefits: {},
    total_benefits: 0,
    net_salary: entry.net_salary,
    days_worked: 15,
    is_adjustment: false,
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  // Simulate DB insert delay
  await new Promise((resolve) => setTimeout(resolve, 800));

  // 3. Simulate PDF receipt generation
  const pdfCount = payrollEntries.length;
  await new Promise((resolve) => setTimeout(resolve, 500));

  // 4. Simulate provisions update
  const provisionsUpdated = payrollEntries.length;
  await new Promise((resolve) => setTimeout(resolve, 300));

  return {
    success: true,
    period_id: input.period_id,
    entries_created: payrollEntries.length,
    pdf_receipts_generated: pdfCount,
    provisions_updated: provisionsUpdated,
    message: `Nómina aprobada: ${payrollEntries.length} recibos generados para ${input.period_name}.`,
  };
}