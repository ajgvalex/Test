import type { DeductionRule, TaxTier } from "@/types";

// ============================================================================
// Honduras payroll constants
// ============================================================================

/** IHSS salary cap (monthly) */
export const IHSS_SALARY_CAP = 11_290.28;

/** Default overtime multiplier (Código del Trabajo Honduras: 1.25 diurna, 1.5 mixta, 1.75 nocturna) */
export const OVERTIME_MULTIPLIER = 1.5;

/** Standard working hours per month */
export const MONTHLY_HOURS = 240;

// ============================================================================
// Input / Output types
// ============================================================================

export interface PayrollEmployee {
  id: string;
  base_salary: number;
  hire_date: string;
}

export interface PayrollPeriodInput {
  start_date: string;
  end_date: string;
  overtime_hours?: number;
  bonuses?: number;
  commissions?: number;
  other_earnings?: number;
}

export interface HondurasDeductions {
  ihss_em: number;
  ihss_ivm: number;
  rap: number;
  isr: number;
  total: number;
}

export interface HondurasEmployerContributions {
  ihss_em: number;
  ihss_ivm: number;
  rap: number;
  infop: number;
  total: number;
}

export interface HondurasProvisions {
  aguinaldo: number;
  catorce: number;
  vacaciones: number;
  cesantia: number;
  total: number;
}

export interface HondurasPayrollResult {
  gross_salary: number;
  base_salary: number;
  overtime_amount: number;
  bonuses: number;
  commissions: number;
  other_earnings: number;
  deductions: HondurasDeductions;
  net_pay: number;
  employer_contributions: HondurasEmployerContributions;
  provisions: HondurasProvisions;
  employer_cost: number;
}

// ============================================================================
// Helper: round to 2 decimal places (banker's rounding)
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
// IHSS calculation (employee & employer)
// ============================================================================

export function calculateIHSS(
  grossSalary: number,
  rules: DeductionRule[]
): {
  employee: { em: number; ivm: number };
  employer: { em: number; ivm: number };
} {
  const emRule = findRule(rules, "ihss_em");
  const ivmRule = findRule(rules, "ihss_ivm");

  const emCap = emRule?.salary_cap ?? IHSS_SALARY_CAP;
  const ivmCap = ivmRule?.salary_cap ?? IHSS_SALARY_CAP;

  const emBase = Math.min(grossSalary, emCap);
  const ivmBase = Math.min(grossSalary, ivmCap);

  return {
    employee: {
      em: round2(emBase * ((emRule?.employee_rate ?? 2.5) / 100)),
      ivm: round2(ivmBase * ((ivmRule?.employee_rate ?? 1) / 100)),
    },
    employer: {
      em: round2(emBase * ((emRule?.employer_rate ?? 5) / 100)),
      ivm: round2(ivmBase * ((ivmRule?.employer_rate ?? 4) / 100)),
    },
  };
}

// ============================================================================
// RAP calculation
// ============================================================================

export function calculateRAP(
  grossSalary: number,
  rules: DeductionRule[]
): { employee: number; employer: number } {
  const rapRule = findRule(rules, "rap");
  const employeeRate = (rapRule?.employee_rate ?? 1.5) / 100;
  const employerRate = (rapRule?.employer_rate ?? 1.5) / 100;

  return {
    employee: round2(grossSalary * employeeRate),
    employer: round2(grossSalary * employerRate),
  };
}

// ============================================================================
// INFOP calculation (employer only)
// ============================================================================

export function calculateINFOP(
  grossSalary: number,
  rules: DeductionRule[]
): number {
  const infopRule = findRule(rules, "infop");
  const rate = (infopRule?.employer_rate ?? 1) / 100;
  return round2(grossSalary * rate);
}

// ============================================================================
// ISR calculation (annual progressive tax, returns monthly amount)
// ============================================================================

const DEFAULT_ISR_TIERS: TaxTier[] = [
  { from: 0, to: 197_985.2, rate: 0, fixed: 0 },
  { from: 197_985.21, to: 302_041.07, rate: 0.15, fixed: 0 },
  { from: 302_041.08, to: 704_695.89, rate: 0.2, fixed: 15_608.38 },
  { from: 704_695.9, to: null, rate: 0.25, fixed: 96_139.34 },
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
      : DEFAULT_ISR_TIERS;

  // Taxable income is gross minus social security deductions (IHSS + RAP)
  const monthlyTaxable = monthlyGross - monthlyDeductionsBeforeISR;
  if (monthlyTaxable <= 0) return 0;

  // Annualize for tier lookup
  const annualTaxable = monthlyTaxable * 12;

  let annualTax = 0;

  for (const tier of tiers) {
    const tierMax = tier.to ?? Infinity;

    if (annualTaxable > tier.from) {
      if (tier.rate === 0) continue;

      // Amount subject to this tier
      const taxableInTier = Math.min(annualTaxable, tierMax) - tier.from;
      annualTax = tier.fixed + taxableInTier * tier.rate;
    }
  }

  // Return monthly ISR
  return round2(annualTax / 12);
}

// ============================================================================
// Overtime calculation
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
// Provisions (monthly accruals)
// ============================================================================

export function calculateProvisions(
  grossSalary: number,
  employee: PayrollEmployee
): HondurasProvisions {
  // Aguinaldo: 1 month salary / 12 (accrued monthly)
  const aguinaldo = round2(grossSalary / 12);

  // 14to mes: 1 month salary / 12 (accrued monthly)
  const catorce = round2(grossSalary / 12);

  // Vacaciones: proportional based on seniority
  const yearsOfService = getYearsOfService(employee.hire_date);
  const vacationDays = getVacationDays(yearsOfService);
  // Daily salary * vacation days with 30% surcharge / 12 months
  const dailySalary = grossSalary / 30;
  const vacaciones = round2((dailySalary * vacationDays * 1.3) / 12);

  // Cesantía: 1 month per year of service, provision = salary / 12
  const cesantia = round2(grossSalary / 12);

  return {
    aguinaldo,
    catorce,
    vacaciones,
    cesantia,
    total: round2(aguinaldo + catorce + vacaciones + cesantia),
  };
}

export function getYearsOfService(hireDate: string, asOf?: string): number {
  const hire = new Date(hireDate);
  const now = asOf ? new Date(asOf) : new Date();
  const diffMs = now.getTime() - hire.getTime();
  return diffMs / (365.25 * 24 * 60 * 60 * 1000);
}

export function getVacationDays(yearsOfService: number): number {
  if (yearsOfService < 1) return 0;
  if (yearsOfService < 2) return 10;
  if (yearsOfService < 3) return 12;
  if (yearsOfService < 4) return 15;
  return 20;
}

// ============================================================================
// Main: calculateHondurasPayroll
// ============================================================================

export function calculateHondurasPayroll(
  employee: PayrollEmployee,
  period: PayrollPeriodInput,
  rules: DeductionRule[]
): HondurasPayrollResult {
  const baseSalary = employee.base_salary;
  const overtimeHours = period.overtime_hours ?? 0;
  const bonuses = period.bonuses ?? 0;
  const commissions = period.commissions ?? 0;
  const otherEarnings = period.other_earnings ?? 0;

  // 1. Gross salary
  const overtimeAmount = calculateOvertime(baseSalary, overtimeHours);
  const grossSalary = round2(
    baseSalary + overtimeAmount + bonuses + commissions + otherEarnings
  );

  // 2. Employee deductions: IHSS
  const ihss = calculateIHSS(grossSalary, rules);

  // 3. Employee deductions: RAP
  const rap = calculateRAP(grossSalary, rules);

  // 4. Pre-ISR deductions (social security contributions are deductible)
  const preISRDeductions = round2(
    ihss.employee.em + ihss.employee.ivm + rap.employee
  );

  // 5. ISR
  const isr = calculateISR(grossSalary, preISRDeductions, rules);

  // 6. Total employee deductions
  const totalDeductions = round2(
    ihss.employee.em + ihss.employee.ivm + rap.employee + isr
  );

  // 7. Net pay
  const netPay = round2(grossSalary - totalDeductions);

  // 8. Employer contributions
  const infop = calculateINFOP(grossSalary, rules);
  const totalEmployerContributions = round2(
    ihss.employer.em + ihss.employer.ivm + rap.employer + infop
  );

  // 9. Provisions
  const provisions = calculateProvisions(grossSalary, employee);

  // 10. Total employer cost
  const employerCost = round2(
    grossSalary + totalEmployerContributions + provisions.total
  );

  return {
    gross_salary: grossSalary,
    base_salary: baseSalary,
    overtime_amount: overtimeAmount,
    bonuses,
    commissions,
    other_earnings: otherEarnings,
    deductions: {
      ihss_em: ihss.employee.em,
      ihss_ivm: ihss.employee.ivm,
      rap: rap.employee,
      isr,
      total: totalDeductions,
    },
    net_pay: netPay,
    employer_contributions: {
      ihss_em: ihss.employer.em,
      ihss_ivm: ihss.employer.ivm,
      rap: rap.employer,
      infop,
      total: totalEmployerContributions,
    },
    provisions,
    employer_cost: employerCost,
  };
}
