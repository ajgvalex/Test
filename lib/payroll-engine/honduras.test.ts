import { describe, it, expect } from "vitest";
import type { DeductionRule } from "@/types";
import {
  calculateHondurasPayroll,
  calculateIHSS,
  calculateRAP,
  calculateINFOP,
  calculateISR,
  calculateOvertime,
  calculateProvisions,
  getYearsOfService,
  getVacationDays,
  round2,
  IHSS_SALARY_CAP,
  MONTHLY_HOURS,
  OVERTIME_MULTIPLIER,
  type PayrollEmployee,
  type PayrollPeriodInput,
} from "./honduras";

// ============================================================================
// Test fixtures: Honduras deduction rules (matching seed data)
// ============================================================================

function makeRule(overrides: Partial<DeductionRule>): DeductionRule {
  return {
    id: "test-rule",
    company_id: "test-company",
    country: "HN",
    code: "",
    name: "",
    description: null,
    deduction_type: "social_security",
    calculation_method: "percentage",
    party: "both",
    employee_rate: 0,
    employer_rate: 0,
    fixed_amount: 0,
    salary_cap: null,
    min_amount: null,
    max_amount: null,
    tiers: null,
    is_mandatory: true,
    is_active: true,
    effective_from: "2024-01-01",
    effective_to: null,
    sort_order: 0,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

const HONDURAS_RULES: DeductionRule[] = [
  makeRule({
    code: "ihss_em",
    name: "IHSS Enfermedad y Maternidad",
    employee_rate: 2.5,
    employer_rate: 5,
    salary_cap: IHSS_SALARY_CAP,
  }),
  makeRule({
    code: "ihss_ivm",
    name: "IHSS Invalidez, Vejez y Muerte",
    employee_rate: 1,
    employer_rate: 4,
    salary_cap: IHSS_SALARY_CAP,
  }),
  makeRule({
    code: "rap",
    name: "RAP",
    deduction_type: "pension",
    employee_rate: 1.5,
    employer_rate: 1.5,
  }),
  makeRule({
    code: "infop",
    name: "INFOP",
    deduction_type: "other",
    party: "employer",
    employee_rate: 0,
    employer_rate: 1,
  }),
  makeRule({
    code: "isr",
    name: "ISR",
    deduction_type: "income_tax",
    calculation_method: "tiered",
    party: "employee",
    employee_rate: 0,
    employer_rate: 0,
    tiers: [
      { from: 0, to: 197_985.2, rate: 0, fixed: 0 },
      { from: 197_985.21, to: 302_041.07, rate: 0.15, fixed: 0 },
      { from: 302_041.08, to: 704_695.89, rate: 0.2, fixed: 15_608.38 },
      { from: 704_695.9, to: null, rate: 0.25, fixed: 96_139.34 },
    ],
  }),
];

const EMPLOYEE: PayrollEmployee = {
  id: "emp-001",
  base_salary: 25_000,
  hire_date: "2021-03-01",
};

const PERIOD: PayrollPeriodInput = {
  start_date: "2024-11-01",
  end_date: "2024-11-30",
};

// ============================================================================
// round2
// ============================================================================

describe("round2", () => {
  it("rounds to 2 decimal places", () => {
    expect(round2(1.235)).toBe(1.24);
    expect(round2(1.234)).toBe(1.23);
    expect(round2(100.005)).toBe(100.01);
    expect(round2(0)).toBe(0);
    expect(round2(99.999)).toBe(100);
  });

  it("handles negative numbers", () => {
    expect(round2(-1.235)).toBe(-1.23);
  });
});

// ============================================================================
// IHSS calculations
// ============================================================================

describe("calculateIHSS", () => {
  it("calculates IHSS for salary below cap", () => {
    const result = calculateIHSS(10_000, HONDURAS_RULES);

    // EM employee: 10,000 * 2.5% = 250
    expect(result.employee.em).toBe(250);
    // IVM employee: 10,000 * 1% = 100
    expect(result.employee.ivm).toBe(100);
    // EM employer: 10,000 * 5% = 500
    expect(result.employer.em).toBe(500);
    // IVM employer: 10,000 * 4% = 400
    expect(result.employer.ivm).toBe(400);
  });

  it("caps IHSS at salary ceiling", () => {
    const result = calculateIHSS(50_000, HONDURAS_RULES);

    // Should use cap of 11,290.28 not 50,000
    // EM employee: 11,290.28 * 2.5% = 282.257 → 282.26
    expect(result.employee.em).toBe(282.26);
    // IVM employee: 11,290.28 * 1% = 112.9028 → 112.90
    expect(result.employee.ivm).toBe(112.9);
    // EM employer: 11,290.28 * 5% = 564.514 → 564.51
    expect(result.employer.em).toBe(564.51);
    // IVM employer: 11,290.28 * 4% = 451.6112 → 451.61
    expect(result.employer.ivm).toBe(451.61);
  });

  it("calculates correctly at exactly the cap", () => {
    const result = calculateIHSS(IHSS_SALARY_CAP, HONDURAS_RULES);
    expect(result.employee.em).toBe(round2(IHSS_SALARY_CAP * 0.025));
    expect(result.employee.ivm).toBe(round2(IHSS_SALARY_CAP * 0.01));
  });

  it("handles zero salary", () => {
    const result = calculateIHSS(0, HONDURAS_RULES);
    expect(result.employee.em).toBe(0);
    expect(result.employee.ivm).toBe(0);
    expect(result.employer.em).toBe(0);
    expect(result.employer.ivm).toBe(0);
  });

  it("uses default rates when rules are empty", () => {
    const result = calculateIHSS(10_000, []);
    // Defaults: EM 2.5%/5%, IVM 1%/4%
    expect(result.employee.em).toBe(250);
    expect(result.employee.ivm).toBe(100);
  });
});

// ============================================================================
// RAP calculations
// ============================================================================

describe("calculateRAP", () => {
  it("calculates RAP at 1.5% both sides", () => {
    const result = calculateRAP(25_000, HONDURAS_RULES);
    // 25,000 * 1.5% = 375
    expect(result.employee).toBe(375);
    expect(result.employer).toBe(375);
  });

  it("has no salary cap", () => {
    const result = calculateRAP(100_000, HONDURAS_RULES);
    // 100,000 * 1.5% = 1,500
    expect(result.employee).toBe(1_500);
    expect(result.employer).toBe(1_500);
  });

  it("handles zero salary", () => {
    const result = calculateRAP(0, HONDURAS_RULES);
    expect(result.employee).toBe(0);
    expect(result.employer).toBe(0);
  });
});

// ============================================================================
// INFOP calculations
// ============================================================================

describe("calculateINFOP", () => {
  it("calculates INFOP at 1% employer only", () => {
    expect(calculateINFOP(25_000, HONDURAS_RULES)).toBe(250);
  });

  it("applies to full salary (no cap)", () => {
    expect(calculateINFOP(100_000, HONDURAS_RULES)).toBe(1_000);
  });

  it("handles zero salary", () => {
    expect(calculateINFOP(0, HONDURAS_RULES)).toBe(0);
  });
});

// ============================================================================
// ISR calculations
// ============================================================================

describe("calculateISR", () => {
  it("returns 0 for income in first bracket (exempt)", () => {
    // Annual taxable < 197,985.20 → exempt
    // Monthly: 197,985.20 / 12 = ~16,498.77
    // Salary 15,000, deductions ~600 → taxable ~14,400 → annual 172,800
    const isr = calculateISR(15_000, 600, HONDURAS_RULES);
    expect(isr).toBe(0);
  });

  it("calculates 15% bracket correctly", () => {
    // Need annual taxable between 197,985.21 and 302,041.07
    // Monthly taxable of ~20,000 → annual 240,000
    // ISR = (240,000 - 197,985.21) * 0.15 = 42,014.79 * 0.15 = 6,302.2185
    // Monthly = 6,302.2185 / 12 = 525.18
    const isr = calculateISR(21_000, 1_000, HONDURAS_RULES);
    // taxable: 20,000/mo → 240,000/yr
    // (240,000 - 197,985.21) * 0.15 = 42,014.79 * 0.15 = 6,302.2185
    // monthly: 525.18
    expect(isr).toBe(525.18);
  });

  it("calculates 20% bracket correctly", () => {
    // Need annual taxable between 302,041.08 and 704,695.89
    // Monthly taxable ~35,000 → annual 420,000
    // ISR = 15,608.38 + (420,000 - 302,041.08) * 0.20
    //     = 15,608.38 + 117,958.92 * 0.20
    //     = 15,608.38 + 23,591.784
    //     = 39,200.164
    // Monthly = 39,200.164 / 12 = 3,266.68
    const isr = calculateISR(36_000, 1_000, HONDURAS_RULES);
    // taxable: 35,000/mo → 420,000/yr
    const annualTax =
      15_608.38 + (420_000 - 302_041.08) * 0.2;
    expect(isr).toBe(round2(annualTax / 12));
  });

  it("calculates 25% bracket correctly", () => {
    // Need annual taxable > 704,695.90
    // Monthly taxable ~70,000 → annual 840,000
    // ISR = 96,139.34 + (840,000 - 704,695.90) * 0.25
    //     = 96,139.34 + 135,304.10 * 0.25
    //     = 96,139.34 + 33,826.025
    //     = 129,965.365
    // Monthly = 129,965.365 / 12 = 10,830.45
    const isr = calculateISR(71_000, 1_000, HONDURAS_RULES);
    const annualTax =
      96_139.34 + (840_000 - 704_695.9) * 0.25;
    expect(isr).toBe(round2(annualTax / 12));
  });

  it("returns 0 when gross equals deductions", () => {
    expect(calculateISR(5_000, 5_000, HONDURAS_RULES)).toBe(0);
  });

  it("returns 0 when deductions exceed gross", () => {
    expect(calculateISR(5_000, 6_000, HONDURAS_RULES)).toBe(0);
  });

  it("uses default tiers when no ISR rule provided", () => {
    const rulesWithoutISR = HONDURAS_RULES.filter((r) => r.code !== "isr");
    const isr = calculateISR(15_000, 600, rulesWithoutISR);
    expect(isr).toBe(0);
  });
});

// ============================================================================
// Overtime calculations
// ============================================================================

describe("calculateOvertime", () => {
  it("calculates overtime with 1.5x multiplier", () => {
    // Hourly: 25,000 / 240 = 104.1667
    // 10 hrs * 104.1667 * 1.5 = 1,562.50
    const ot = calculateOvertime(25_000, 10);
    expect(ot).toBe(round2((25_000 / MONTHLY_HOURS) * 10 * OVERTIME_MULTIPLIER));
  });

  it("returns 0 for zero hours", () => {
    expect(calculateOvertime(25_000, 0)).toBe(0);
  });

  it("returns 0 for negative hours", () => {
    expect(calculateOvertime(25_000, -5)).toBe(0);
  });

  it("handles fractional hours", () => {
    const ot = calculateOvertime(24_000, 5.5);
    // Hourly: 24,000 / 240 = 100, OT: 5.5 * 100 * 1.5 = 825
    expect(ot).toBe(825);
  });
});

// ============================================================================
// Vacation days by seniority
// ============================================================================

describe("getVacationDays", () => {
  it("returns 0 for less than 1 year", () => {
    expect(getVacationDays(0.5)).toBe(0);
  });

  it("returns 10 days for 1-2 years", () => {
    expect(getVacationDays(1)).toBe(10);
    expect(getVacationDays(1.9)).toBe(10);
  });

  it("returns 12 days for 2-3 years", () => {
    expect(getVacationDays(2)).toBe(12);
    expect(getVacationDays(2.5)).toBe(12);
  });

  it("returns 15 days for 3-4 years", () => {
    expect(getVacationDays(3)).toBe(15);
    expect(getVacationDays(3.9)).toBe(15);
  });

  it("returns 20 days for 4+ years", () => {
    expect(getVacationDays(4)).toBe(20);
    expect(getVacationDays(10)).toBe(20);
    expect(getVacationDays(25)).toBe(20);
  });
});

// ============================================================================
// getYearsOfService
// ============================================================================

describe("getYearsOfService", () => {
  it("calculates years correctly", () => {
    const years = getYearsOfService("2020-01-01", "2024-01-01");
    expect(years).toBeCloseTo(4, 0);
  });

  it("returns 0 for same date", () => {
    const years = getYearsOfService("2024-01-01", "2024-01-01");
    expect(years).toBe(0);
  });

  it("calculates partial years", () => {
    const years = getYearsOfService("2024-01-01", "2024-07-01");
    expect(years).toBeGreaterThan(0.4);
    expect(years).toBeLessThan(0.6);
  });
});

// ============================================================================
// Provisions
// ============================================================================

describe("calculateProvisions", () => {
  const emp: PayrollEmployee = {
    id: "emp-test",
    base_salary: 30_000,
    hire_date: "2020-01-01",
  };

  it("calculates aguinaldo as 1/12 of gross", () => {
    const provisions = calculateProvisions(30_000, emp);
    expect(provisions.aguinaldo).toBe(2_500);
  });

  it("calculates 14to mes as 1/12 of gross", () => {
    const provisions = calculateProvisions(30_000, emp);
    expect(provisions.catorce).toBe(2_500);
  });

  it("calculates cesantía as 1/12 of gross", () => {
    const provisions = calculateProvisions(30_000, emp);
    expect(provisions.cesantia).toBe(2_500);
  });

  it("calculates vacation provision with 30% surcharge", () => {
    // 4+ years → 20 days
    // Daily: 30,000 / 30 = 1,000
    // Vacation: 1,000 * 20 * 1.3 / 12 = 2,166.67
    const provisions = calculateProvisions(30_000, emp);
    expect(provisions.vacaciones).toBe(round2((30_000 / 30) * 20 * 1.3 / 12));
  });

  it("returns 0 vacation for employee with less than 1 year", () => {
    const newEmp: PayrollEmployee = {
      id: "new-emp",
      base_salary: 20_000,
      hire_date: new Date().toISOString().split("T")[0], // hired today
    };
    const provisions = calculateProvisions(20_000, newEmp);
    expect(provisions.vacaciones).toBe(0);
  });

  it("sums total correctly", () => {
    const provisions = calculateProvisions(30_000, emp);
    expect(provisions.total).toBe(
      round2(
        provisions.aguinaldo +
          provisions.catorce +
          provisions.vacaciones +
          provisions.cesantia
      )
    );
  });
});

// ============================================================================
// Full payroll calculation — standard case
// ============================================================================

describe("calculateHondurasPayroll", () => {
  describe("standard salary (L 25,000)", () => {
    const result = calculateHondurasPayroll(EMPLOYEE, PERIOD, HONDURAS_RULES);

    it("returns correct gross salary", () => {
      expect(result.gross_salary).toBe(25_000);
      expect(result.base_salary).toBe(25_000);
      expect(result.overtime_amount).toBe(0);
      expect(result.bonuses).toBe(0);
      expect(result.commissions).toBe(0);
      expect(result.other_earnings).toBe(0);
    });

    it("calculates IHSS employee deductions with cap", () => {
      // Salary 25,000 > cap 11,290.28
      // EM: 11,290.28 * 2.5% = 282.257 → 282.26
      expect(result.deductions.ihss_em).toBe(282.26);
      // IVM: 11,290.28 * 1% = 112.9028 → 112.90
      expect(result.deductions.ihss_ivm).toBe(112.9);
    });

    it("calculates RAP employee deduction", () => {
      // 25,000 * 1.5% = 375
      expect(result.deductions.rap).toBe(375);
    });

    it("calculates ISR correctly", () => {
      // Pre-ISR deductions: 282.26 + 112.90 + 375 = 770.16
      // Monthly taxable: 25,000 - 770.16 = 24,229.84
      // Annual taxable: 24,229.84 * 12 = 290,758.08
      // Bracket: 197,985.21 - 302,041.07 at 15%
      // ISR = (290,758.08 - 197,985.21) * 0.15 = 92,772.87 * 0.15 = 13,915.9305
      // Monthly: 13,915.9305 / 12 = 1,159.66
      const preISR = round2(282.26 + 112.9 + 375);
      const monthlyTaxable = 25_000 - preISR;
      const annualTaxable = monthlyTaxable * 12;
      const annualTax = (annualTaxable - 197_985.21) * 0.15;
      const expectedISR = round2(annualTax / 12);
      expect(result.deductions.isr).toBe(expectedISR);
    });

    it("calculates total deductions", () => {
      expect(result.deductions.total).toBe(
        round2(
          result.deductions.ihss_em +
            result.deductions.ihss_ivm +
            result.deductions.rap +
            result.deductions.isr
        )
      );
    });

    it("calculates net pay", () => {
      expect(result.net_pay).toBe(
        round2(result.gross_salary - result.deductions.total)
      );
    });

    it("calculates employer IHSS contributions with cap", () => {
      // EM: 11,290.28 * 5% = 564.514 → 564.51
      expect(result.employer_contributions.ihss_em).toBe(564.51);
      // IVM: 11,290.28 * 4% = 451.6112 → 451.61
      expect(result.employer_contributions.ihss_ivm).toBe(451.61);
    });

    it("calculates employer RAP", () => {
      expect(result.employer_contributions.rap).toBe(375);
    });

    it("calculates INFOP", () => {
      expect(result.employer_contributions.infop).toBe(250);
    });

    it("calculates total employer contributions", () => {
      expect(result.employer_contributions.total).toBe(
        round2(
          result.employer_contributions.ihss_em +
            result.employer_contributions.ihss_ivm +
            result.employer_contributions.rap +
            result.employer_contributions.infop
        )
      );
    });

    it("calculates provisions", () => {
      expect(result.provisions.aguinaldo).toBe(round2(25_000 / 12));
      expect(result.provisions.catorce).toBe(round2(25_000 / 12));
      expect(result.provisions.cesantia).toBe(round2(25_000 / 12));
      expect(result.provisions.vacaciones).toBeGreaterThan(0);
    });

    it("calculates total employer cost", () => {
      expect(result.employer_cost).toBe(
        round2(
          result.gross_salary +
            result.employer_contributions.total +
            result.provisions.total
        )
      );
    });

    it("ensures net + deductions = gross", () => {
      expect(round2(result.net_pay + result.deductions.total)).toBe(
        result.gross_salary
      );
    });
  });

  // ==========================================================================
  // With overtime
  // ==========================================================================

  describe("with overtime hours", () => {
    const periodWithOT: PayrollPeriodInput = {
      ...PERIOD,
      overtime_hours: 20,
    };

    const result = calculateHondurasPayroll(
      EMPLOYEE,
      periodWithOT,
      HONDURAS_RULES
    );

    it("includes overtime in gross", () => {
      // Hourly: 25,000 / 240 = 104.16667
      // OT: 20 * 104.16667 * 1.5 = 3,125.00
      const expectedOT = round2((25_000 / MONTHLY_HOURS) * 20 * OVERTIME_MULTIPLIER);
      expect(result.overtime_amount).toBe(expectedOT);
      expect(result.gross_salary).toBe(round2(25_000 + expectedOT));
    });

    it("calculates deductions on full gross including OT", () => {
      // RAP applies to full gross (no cap)
      expect(result.deductions.rap).toBe(round2(result.gross_salary * 0.015));
    });

    it("ensures net + deductions = gross", () => {
      expect(round2(result.net_pay + result.deductions.total)).toBe(
        result.gross_salary
      );
    });
  });

  // ==========================================================================
  // With bonuses and commissions
  // ==========================================================================

  describe("with bonuses and commissions", () => {
    const periodWithExtras: PayrollPeriodInput = {
      ...PERIOD,
      bonuses: 5_000,
      commissions: 3_000,
      other_earnings: 1_000,
    };

    const result = calculateHondurasPayroll(
      EMPLOYEE,
      periodWithExtras,
      HONDURAS_RULES
    );

    it("includes all earnings in gross", () => {
      expect(result.gross_salary).toBe(25_000 + 5_000 + 3_000 + 1_000);
      expect(result.bonuses).toBe(5_000);
      expect(result.commissions).toBe(3_000);
      expect(result.other_earnings).toBe(1_000);
    });

    it("calculates deductions on total gross", () => {
      // IHSS still capped
      expect(result.deductions.ihss_em).toBe(
        round2(IHSS_SALARY_CAP * 0.025)
      );
    });
  });

  // ==========================================================================
  // Minimum wage scenario
  // ==========================================================================

  describe("minimum wage employee (L 8,000)", () => {
    const minWageEmployee: PayrollEmployee = {
      id: "emp-min",
      base_salary: 8_000,
      hire_date: "2023-06-01",
    };

    const result = calculateHondurasPayroll(
      minWageEmployee,
      PERIOD,
      HONDURAS_RULES
    );

    it("IHSS uses full salary (below cap)", () => {
      expect(result.deductions.ihss_em).toBe(round2(8_000 * 0.025));
      expect(result.deductions.ihss_ivm).toBe(round2(8_000 * 0.01));
    });

    it("ISR is 0 (below exempt threshold)", () => {
      // Pre-ISR: 200 + 80 + 120 = 400
      // Monthly taxable: 7,600 → Annual: 91,200 < 197,985.20
      expect(result.deductions.isr).toBe(0);
    });

    it("net pay is gross minus social security only", () => {
      const expectedDeductions = round2(
        8_000 * 0.025 + 8_000 * 0.01 + 8_000 * 0.015
      );
      expect(result.deductions.total).toBe(expectedDeductions);
      expect(result.net_pay).toBe(round2(8_000 - expectedDeductions));
    });
  });

  // ==========================================================================
  // High salary (into 25% bracket)
  // ==========================================================================

  describe("high salary employee (L 80,000)", () => {
    const highEarner: PayrollEmployee = {
      id: "emp-high",
      base_salary: 80_000,
      hire_date: "2015-01-01",
    };

    const result = calculateHondurasPayroll(
      highEarner,
      PERIOD,
      HONDURAS_RULES
    );

    it("IHSS is capped", () => {
      expect(result.deductions.ihss_em).toBe(
        round2(IHSS_SALARY_CAP * 0.025)
      );
      expect(result.deductions.ihss_ivm).toBe(
        round2(IHSS_SALARY_CAP * 0.01)
      );
    });

    it("RAP applies to full 80,000", () => {
      expect(result.deductions.rap).toBe(round2(80_000 * 0.015));
    });

    it("ISR is in 25% bracket", () => {
      const preISR = round2(
        result.deductions.ihss_em +
          result.deductions.ihss_ivm +
          result.deductions.rap
      );
      const monthlyTaxable = 80_000 - preISR;
      const annualTaxable = monthlyTaxable * 12;
      // Should be in 25% bracket (> 704,695.90)
      expect(annualTaxable).toBeGreaterThan(704_695.9);
      expect(result.deductions.isr).toBeGreaterThan(0);
    });

    it("employer contributions reflect cap on IHSS", () => {
      expect(result.employer_contributions.ihss_em).toBe(
        round2(IHSS_SALARY_CAP * 0.05)
      );
      expect(result.employer_contributions.ihss_ivm).toBe(
        round2(IHSS_SALARY_CAP * 0.04)
      );
      // RAP & INFOP on full salary
      expect(result.employer_contributions.rap).toBe(
        round2(80_000 * 0.015)
      );
      expect(result.employer_contributions.infop).toBe(
        round2(80_000 * 0.01)
      );
    });

    it("provisions for senior employee (4+ years → 20 vacation days)", () => {
      const dailySalary = 80_000 / 30;
      const expectedVacation = round2((dailySalary * 20 * 1.3) / 12);
      expect(result.provisions.vacaciones).toBe(expectedVacation);
    });

    it("ensures net + deductions = gross", () => {
      expect(round2(result.net_pay + result.deductions.total)).toBe(
        result.gross_salary
      );
    });
  });

  // ==========================================================================
  // Edge: salary exactly at IHSS cap
  // ==========================================================================

  describe("salary exactly at IHSS cap", () => {
    const capEmployee: PayrollEmployee = {
      id: "emp-cap",
      base_salary: IHSS_SALARY_CAP,
      hire_date: "2022-06-01",
    };

    const result = calculateHondurasPayroll(
      capEmployee,
      PERIOD,
      HONDURAS_RULES
    );

    it("uses full salary for IHSS (equals cap)", () => {
      expect(result.deductions.ihss_em).toBe(
        round2(IHSS_SALARY_CAP * 0.025)
      );
      expect(result.deductions.ihss_ivm).toBe(
        round2(IHSS_SALARY_CAP * 0.01)
      );
    });
  });

  // ==========================================================================
  // Edge: zero salary
  // ==========================================================================

  describe("zero salary", () => {
    const zeroEmployee: PayrollEmployee = {
      id: "emp-zero",
      base_salary: 0,
      hire_date: "2020-01-01",
    };

    const result = calculateHondurasPayroll(
      zeroEmployee,
      PERIOD,
      HONDURAS_RULES
    );

    it("all values are 0", () => {
      expect(result.gross_salary).toBe(0);
      expect(result.deductions.total).toBe(0);
      expect(result.net_pay).toBe(0);
      expect(result.employer_contributions.total).toBe(0);
    });
  });

  // ==========================================================================
  // Edge: missing/empty rules fallback to defaults
  // ==========================================================================

  describe("empty rules (fallback to defaults)", () => {
    const result = calculateHondurasPayroll(EMPLOYEE, PERIOD, []);

    it("still calculates using default rates", () => {
      expect(result.deductions.ihss_em).toBe(
        round2(IHSS_SALARY_CAP * 0.025)
      );
      expect(result.deductions.rap).toBe(round2(25_000 * 0.015));
      expect(result.gross_salary).toBe(25_000);
    });

    it("net + deductions = gross", () => {
      expect(round2(result.net_pay + result.deductions.total)).toBe(
        result.gross_salary
      );
    });
  });

  // ==========================================================================
  // Edge: inactive rules should be skipped
  // ==========================================================================

  describe("inactive rules are skipped", () => {
    const inactiveRules = HONDURAS_RULES.map((r) => ({
      ...r,
      is_active: false,
    }));

    const result = calculateHondurasPayroll(
      EMPLOYEE,
      PERIOD,
      inactiveRules
    );

    it("falls back to defaults when all rules inactive", () => {
      expect(result.deductions.ihss_em).toBe(
        round2(IHSS_SALARY_CAP * 0.025)
      );
      expect(result.gross_salary).toBe(25_000);
    });
  });

  // ==========================================================================
  // ISR bracket boundary: just below exempt threshold
  // ==========================================================================

  describe("ISR boundary: just below exempt threshold", () => {
    // Need monthly taxable * 12 ≤ 197,985.20
    // Monthly taxable ≤ 16,498.77
    const borderEmployee: PayrollEmployee = {
      id: "emp-border",
      base_salary: 17_000,
      hire_date: "2022-01-01",
    };

    const result = calculateHondurasPayroll(
      borderEmployee,
      PERIOD,
      HONDURAS_RULES
    );

    it("ISR is 0 when annual taxable is below threshold", () => {
      // Pre-ISR deductions on 17,000:
      // IHSS EM: 11,290.28 * 2.5% = 282.26 (capped)
      // IHSS IVM: 11,290.28 * 1% = 112.90 (capped)
      // RAP: 17,000 * 1.5% = 255
      // Pre-ISR = 650.16
      // Monthly taxable: 17,000 - 650.16 = 16,349.84
      // Annual: 196,198.08 < 197,985.20 → exempt
      expect(result.deductions.isr).toBe(0);
    });
  });

  // ==========================================================================
  // ISR bracket boundary: just above exempt threshold
  // ==========================================================================

  describe("ISR boundary: just above exempt threshold", () => {
    const borderEmployee: PayrollEmployee = {
      id: "emp-border2",
      base_salary: 18_000,
      hire_date: "2022-01-01",
    };

    const result = calculateHondurasPayroll(
      borderEmployee,
      PERIOD,
      HONDURAS_RULES
    );

    it("ISR is small but positive", () => {
      // IHSS EM: 282.26 (capped), IVM: 112.90 (capped), RAP: 270
      // Pre-ISR: 665.16
      // Monthly taxable: 17,334.84
      // Annual: 208,018.08 > 197,985.20 → 15% bracket
      // ISR = (208,018.08 - 197,985.21) * 0.15 = 10,032.87 * 0.15 = 1,504.9305
      // Monthly: 125.41
      expect(result.deductions.isr).toBeGreaterThan(0);
      expect(result.deductions.isr).toBeLessThan(200);
    });
  });

  // ==========================================================================
  // Combined overtime + bonuses + high salary
  // ==========================================================================

  describe("combined scenario: overtime + bonuses on high salary", () => {
    const emp: PayrollEmployee = {
      id: "emp-combined",
      base_salary: 50_000,
      hire_date: "2018-01-01",
    };

    const per: PayrollPeriodInput = {
      start_date: "2024-12-01",
      end_date: "2024-12-31",
      overtime_hours: 15,
      bonuses: 10_000,
      commissions: 5_000,
    };

    const result = calculateHondurasPayroll(emp, per, HONDURAS_RULES);

    it("gross includes all components", () => {
      const expectedOT = round2(
        (50_000 / MONTHLY_HOURS) * 15 * OVERTIME_MULTIPLIER
      );
      expect(result.gross_salary).toBe(
        round2(50_000 + expectedOT + 10_000 + 5_000)
      );
    });

    it("IHSS is capped regardless of high gross", () => {
      expect(result.deductions.ihss_em).toBe(
        round2(IHSS_SALARY_CAP * 0.025)
      );
    });

    it("provisions are based on total gross", () => {
      expect(result.provisions.aguinaldo).toBe(
        round2(result.gross_salary / 12)
      );
    });

    it("employer cost > gross + employer contributions + provisions", () => {
      expect(result.employer_cost).toBe(
        round2(
          result.gross_salary +
            result.employer_contributions.total +
            result.provisions.total
        )
      );
    });

    it("net + deductions = gross", () => {
      expect(round2(result.net_pay + result.deductions.total)).toBe(
        result.gross_salary
      );
    });
  });
});
