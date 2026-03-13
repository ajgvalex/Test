import type { DeductionRule, TaxTier } from "@/types";

// ============================================================================
// El Salvador payroll constants
// ============================================================================

/** ISSS salary cap (monthly base for contribution) */
export const ISSS_SALARY_CAP = 1_000.0;

/** ISSS maximum employee deduction ($1,000 * 3% = $30) */
export const ISSS_EMPLOYEE_MAX = 30.0;

/** Overtime multiplier (Código de Trabajo SV: 2x for regular overtime) */
export const OVERTIME_MULTIPLIER = 2.0;

/** Standard working hours per month (44h/week * 4.33) */
export const MONTHLY_HOURS = 190;

/** Minimum employees for INSAFORP obligation */
export const INSAFORP_MIN_EMPLOYEES = 10;

// ============================================================================
// Input / Output types
// ============================================================================

export interface SVPayrollEmployee {
  id: string;
  base_salary: number;
  hire_date: string;
}

export interface SVPayrollPeriodInput {
  start_date: string;
  end_date: string;
  overtime_hours?: number;
  bonuses?: number;
  commissions?: number;
  other_earnings?: number;
  /** Set to true for the February "Quincena 25" (50% salary, exempt) */
  is_quincena_25?: boolean;
}

export interface SVCompanyContext {
  /** Total active employees — required to determine INSAFORP applicability */
  employee_count: number;
}

export interface SVDeductions {
  isss: number;
  afp: number;
  isr: number;
  total: number;
}

export interface SVEmployerContributions {
  isss: number;
  afp: number;
  insaforp: number;
  total: number;
}

export interface SVProvisions {
  aguinaldo: number;
  vacaciones: number;
  total: number;
}

export interface SVPayrollResult {
  gross_salary: number;
  base_salary: number;
  overtime_amount: number;
  bonuses: number;
  commissions: number;
  other_earnings: number;
  is_quincena_25: boolean;
  deductions: SVDeductions;
  net_pay: number;
  employer_contributions: SVEmployerContributions;
  provisions: SVProvisions;
  employer_cost: number;
}

// ============================================================================
// Helper: round to 2 decimal places
// ============================================================================

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ============================================================================
// Core: find a rule by code from the rules array
// ============================================================================

function findRule(rules: DeductionRule[], code: string): DeductionRule | null {
  return rules.find((r) => r.code === code && r.is_active) ?? null;
}

// ============================================================================
// ISSS calculation (employee & employer)
// ============================================================================

export function calculateISS(
  grossSalary: number,
  rules: DeductionRule[]
): { employee: number; employer: number } {
  const rule = findRule(rules, "isss");
  const cap = rule?.salary_cap ?? ISSS_SALARY_CAP;
  const employeeRate = (rule?.employee_rate ?? 3) / 100;
  const employerRate = (rule?.employer_rate ?? 7.5) / 100;

  const base = Math.min(grossSalary, cap);

  return {
    employee: round2(base * employeeRate),
    employer: round2(base * employerRate),
  };
}

// ============================================================================
// AFP calculation (employee & employer) — no salary cap
// ============================================================================

export function calculateAFP(
  grossSalary: number,
  rules: DeductionRule[]
): { employee: number; employer: number } {
  const rule = findRule(rules, "afp");
  const employeeRate = (rule?.employee_rate ?? 7.25) / 100;
  const employerRate = (rule?.employer_rate ?? 8.75) / 100;

  return {
    employee: round2(grossSalary * employeeRate),
    employer: round2(grossSalary * employerRate),
  };
}

// ============================================================================
// INSAFORP calculation (employer only, 1% if company has 10+ employees)
// ============================================================================

export function calculateINSAFORP(
  grossSalary: number,
  employeeCount: number,
  rules: DeductionRule[]
): number {
  if (employeeCount < INSAFORP_MIN_EMPLOYEES) return 0;
  const rule = findRule(rules, "insaforp");
  const rate = (rule?.employer_rate ?? 1) / 100;
  return round2(grossSalary * rate);
}

// ============================================================================
// ISR calculation (monthly progressive tax — El Salvador uses monthly tiers)
//
// Updated tiers (May 2025):
//   Tramo 1: $0.01 – $550.00     → Exento
//   Tramo 2: $550.01 – $895.24   → 10% sobre exceso de $550.00 + $17.67
//   Tramo 3: $895.25 – $2,038.10 → 20% sobre exceso de $895.24 + $52.19
//   Tramo 4: $2,038.11+          → 30% sobre exceso de $2,038.10 + $280.76
// ============================================================================

const DEFAULT_ISR_TIERS_SV: TaxTier[] = [
  { from: 0.01, to: 550.0, rate: 0, fixed: 0, excess_over: 0 },
  { from: 550.01, to: 895.24, rate: 0.1, fixed: 17.67, excess_over: 550.0 },
  {
    from: 895.25,
    to: 2_038.1,
    rate: 0.2,
    fixed: 52.19,
    excess_over: 895.24,
  },
  {
    from: 2_038.11,
    to: null,
    rate: 0.3,
    fixed: 280.76,
    excess_over: 2_038.1,
  },
];

export function calculateISR(
  monthlyGross: number,
  monthlyDeductionsBeforeISR: number,
  rules: DeductionRule[]
): number {
  const isrRule = findRule(rules, "isr");
  const tiers: TaxTier[] =
    isrRule?.tiers && isrRule.tiers.length > 0
      ? isrRule.tiers
      : DEFAULT_ISR_TIERS_SV;

  // Taxable: gross minus ISSS and AFP employee contributions
  const taxable = monthlyGross - monthlyDeductionsBeforeISR;
  if (taxable <= 0) return 0;

  // SV ISR uses monthly tiers directly (not annualized)
  for (let i = tiers.length - 1; i >= 0; i--) {
    const tier = tiers[i];
    if (taxable >= tier.from) {
      if (tier.rate === 0) return 0;
      const excessOver = tier.excess_over ?? tier.from;
      const excess = taxable - excessOver;
      return round2(tier.fixed + excess * tier.rate);
    }
  }

  return 0;
}

// ============================================================================
// Overtime calculation (SV: 2x regular hourly rate)
// ============================================================================

export function calculateOvertime(
  baseSalary: number,
  overtimeHours: number
): number {
  if (overtimeHours <= 0) return 0;
  const hourlyRate = baseSalary / MONTHLY_HOURS;
  return round2(hourlyRate * overtimeHours * OVERTIME_MULTIPLIER);
}

// ============================================================================
// Years of service
// ============================================================================

export function getYearsOfService(hireDate: string, asOf?: string): number {
  const hire = new Date(hireDate);
  const now = asOf ? new Date(asOf) : new Date();
  const diffMs = now.getTime() - hire.getTime();
  return diffMs / (365.25 * 24 * 60 * 60 * 1000);
}

// ============================================================================
// Aguinaldo days by seniority (Art. 198 Código de Trabajo SV)
//   1–3 años: 15 días
//   3–10 años: 19 días
//   10+ años: 21 días
// ============================================================================

export function getAguinaldoDays(yearsOfService: number): number {
  if (yearsOfService < 1) return 0;
  if (yearsOfService < 3) return 15;
  if (yearsOfService < 10) return 19;
  return 21;
}

// ============================================================================
// Provisions (monthly accruals)
// ============================================================================

export function calculateProvisions(
  grossSalary: number,
  employee: SVPayrollEmployee
): SVProvisions {
  const yearsOfService = getYearsOfService(employee.hire_date);

  // Aguinaldo: seniority-based days / 12 (monthly accrual)
  const aguinaldoDays = getAguinaldoDays(yearsOfService);
  const dailySalary = grossSalary / 30;
  const aguinaldo = round2((dailySalary * aguinaldoDays) / 12);

  // Vacaciones: 15 days + 30% bonus (Art. 177 CT SV)
  // Accrued after 1+ year of service
  const vacationDays = yearsOfService >= 1 ? 15 : 0;
  const vacaciones = round2((dailySalary * vacationDays * 1.3) / 12);

  return {
    aguinaldo,
    vacaciones,
    total: round2(aguinaldo + vacaciones),
  };
}

// ============================================================================
// Main: calculateElSalvadorPayroll
// ============================================================================

export function calculateElSalvadorPayroll(
  employee: SVPayrollEmployee,
  period: SVPayrollPeriodInput,
  rules: DeductionRule[],
  company: SVCompanyContext = { employee_count: 10 }
): SVPayrollResult {
  const baseSalary = employee.base_salary;
  const overtimeHours = period.overtime_hours ?? 0;
  const bonuses = period.bonuses ?? 0;
  const commissions = period.commissions ?? 0;
  const otherEarnings = period.other_earnings ?? 0;
  const isQuincena25 = period.is_quincena_25 ?? false;

  // 1. Gross salary
  let effectiveBase = baseSalary;
  if (isQuincena25) {
    // Quincena 25 (February): 50% of monthly salary, exempt from ISSS/AFP/ISR
    effectiveBase = round2(baseSalary * 0.5);
  }

  const overtimeAmount = calculateOvertime(baseSalary, overtimeHours);
  const grossSalary = round2(
    effectiveBase + overtimeAmount + bonuses + commissions + otherEarnings
  );

  // 2. Deductions — Quincena 25 is exempt from social security & ISR
  let isss = { employee: 0, employer: 0 };
  let afp = { employee: 0, employer: 0 };
  let isr = 0;
  let insaforp = 0;

  if (!isQuincena25) {
    // ISSS
    isss = calculateISS(grossSalary, rules);

    // AFP
    afp = calculateAFP(grossSalary, rules);

    // Pre-ISR deductions (ISSS + AFP are deductible for ISR purposes)
    const preISRDeductions = round2(isss.employee + afp.employee);

    // ISR (monthly progressive)
    isr = calculateISR(grossSalary, preISRDeductions, rules);

    // INSAFORP (employer)
    insaforp = calculateINSAFORP(grossSalary, company.employee_count, rules);
  }

  // 3. Total employee deductions
  const totalDeductions = round2(isss.employee + afp.employee + isr);

  // 4. Net pay
  const netPay = round2(grossSalary - totalDeductions);

  // 5. Employer contributions
  const totalEmployerContributions = round2(
    isss.employer + afp.employer + insaforp
  );

  // 6. Provisions (calculated on full-month gross for accrual purposes, not quincena)
  const provisionBase = isQuincena25 ? baseSalary : grossSalary;
  const provisions = calculateProvisions(provisionBase, employee);

  // 7. Total employer cost
  const employerCost = round2(
    grossSalary + totalEmployerContributions + provisions.total
  );

  return {
    gross_salary: grossSalary,
    base_salary: effectiveBase,
    overtime_amount: overtimeAmount,
    bonuses,
    commissions,
    other_earnings: otherEarnings,
    is_quincena_25: isQuincena25,
    deductions: {
      isss: isss.employee,
      afp: afp.employee,
      isr,
      total: totalDeductions,
    },
    net_pay: netPay,
    employer_contributions: {
      isss: isss.employer,
      afp: afp.employer,
      insaforp,
      total: totalEmployerContributions,
    },
    provisions,
    employer_cost: employerCost,
  };
}
