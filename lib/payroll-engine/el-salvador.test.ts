import { describe, it, expect } from "vitest";
import type { DeductionRule } from "@/types";
import {
  calculateElSalvadorPayroll,
  calculateISS,
  calculateAFP,
  calculateINSAFORP,
  calculateISR,
  calculateOvertime,
  calculateProvisions,
  getYearsOfService,
  getAguinaldoDays,
  round2,
  ISSS_SALARY_CAP,
  ISSS_EMPLOYEE_MAX,
  MONTHLY_HOURS,
  OVERTIME_MULTIPLIER,
  INSAFORP_MIN_EMPLOYEES,
  type SVPayrollEmployee,
  type SVPayrollPeriodInput,
  type SVCompanyContext,
} from "./el-salvador";

// ============================================================================
// Test fixtures
// ============================================================================

function makeRule(overrides: Partial<DeductionRule>): DeductionRule {
  return {
    id: "test-rule",
    company_id: "test-company",
    country: "SV",
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

const SV_RULES: DeductionRule[] = [
  makeRule({
    code: "isss",
    name: "ISSS",
    employee_rate: 3,
    employer_rate: 7.5,
    salary_cap: ISSS_SALARY_CAP,
  }),
  makeRule({
    code: "afp",
    name: "AFP",
    deduction_type: "pension",
    employee_rate: 7.25,
    employer_rate: 8.75,
  }),
  makeRule({
    code: "insaforp",
    name: "INSAFORP",
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
      { from: 0.01, to: 550.0, rate: 0, fixed: 0, excess_over: 0 },
      {
        from: 550.01,
        to: 895.24,
        rate: 0.1,
        fixed: 17.67,
        excess_over: 550.0,
      },
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
    ],
  }),
];

const EMPLOYEE: SVPayrollEmployee = {
  id: "emp-sv-001",
  base_salary: 800,
  hire_date: "2021-03-01",
};

const PERIOD: SVPayrollPeriodInput = {
  start_date: "2024-11-01",
  end_date: "2024-11-30",
};

const COMPANY: SVCompanyContext = { employee_count: 25 };

// ============================================================================
// round2
// ============================================================================

describe("round2", () => {
  it("rounds to 2 decimal places", () => {
    expect(round2(1.235)).toBe(1.24);
    expect(round2(1.234)).toBe(1.23);
    expect(round2(0)).toBe(0);
  });
});

// ============================================================================
// ISSS calculations
// ============================================================================

describe("calculateISS", () => {
  it("calculates ISSS for salary below cap", () => {
    const result = calculateISS(800, SV_RULES);
    // Employee: 800 * 3% = 24
    expect(result.employee).toBe(24);
    // Employer: 800 * 7.5% = 60
    expect(result.employer).toBe(60);
  });

  it("caps ISSS at $1,000 base", () => {
    const result = calculateISS(3_000, SV_RULES);
    // Employee: 1,000 * 3% = 30 (max $30)
    expect(result.employee).toBe(ISSS_EMPLOYEE_MAX);
    // Employer: 1,000 * 7.5% = 75
    expect(result.employer).toBe(75);
  });

  it("calculates at exactly the cap", () => {
    const result = calculateISS(ISSS_SALARY_CAP, SV_RULES);
    expect(result.employee).toBe(30);
    expect(result.employer).toBe(75);
  });

  it("handles zero salary", () => {
    const result = calculateISS(0, SV_RULES);
    expect(result.employee).toBe(0);
    expect(result.employer).toBe(0);
  });

  it("uses default rates when rules are empty", () => {
    const result = calculateISS(800, []);
    expect(result.employee).toBe(24);
    expect(result.employer).toBe(60);
  });

  it("salary just below cap uses full salary", () => {
    const result = calculateISS(999.99, SV_RULES);
    expect(result.employee).toBe(round2(999.99 * 0.03));
    expect(result.employer).toBe(round2(999.99 * 0.075));
  });
});

// ============================================================================
// AFP calculations
// ============================================================================

describe("calculateAFP", () => {
  it("calculates AFP at 7.25% employee / 8.75% employer", () => {
    const result = calculateAFP(800, SV_RULES);
    // Employee: 800 * 7.25% = 58
    expect(result.employee).toBe(58);
    // Employer: 800 * 8.75% = 70
    expect(result.employer).toBe(70);
  });

  it("has no salary cap (applies to full salary)", () => {
    const result = calculateAFP(5_000, SV_RULES);
    // Employee: 5,000 * 7.25% = 362.50
    expect(result.employee).toBe(362.5);
    // Employer: 5,000 * 8.75% = 437.50
    expect(result.employer).toBe(437.5);
  });

  it("handles zero salary", () => {
    const result = calculateAFP(0, SV_RULES);
    expect(result.employee).toBe(0);
    expect(result.employer).toBe(0);
  });

  it("handles large salary precisely", () => {
    const result = calculateAFP(10_000, SV_RULES);
    expect(result.employee).toBe(725);
    expect(result.employer).toBe(875);
  });

  it("uses defaults when rules are empty", () => {
    const result = calculateAFP(1_000, []);
    expect(result.employee).toBe(72.5);
    expect(result.employer).toBe(87.5);
  });
});

// ============================================================================
// INSAFORP calculations
// ============================================================================

describe("calculateINSAFORP", () => {
  it("calculates 1% when company has 10+ employees", () => {
    expect(calculateINSAFORP(800, 10, SV_RULES)).toBe(8);
    expect(calculateINSAFORP(800, 25, SV_RULES)).toBe(8);
    expect(calculateINSAFORP(800, 100, SV_RULES)).toBe(8);
  });

  it("returns 0 when company has fewer than 10 employees", () => {
    expect(calculateINSAFORP(800, 9, SV_RULES)).toBe(0);
    expect(calculateINSAFORP(800, 1, SV_RULES)).toBe(0);
    expect(calculateINSAFORP(800, 0, SV_RULES)).toBe(0);
  });

  it("applies to full salary (no cap)", () => {
    expect(calculateINSAFORP(5_000, 15, SV_RULES)).toBe(50);
  });

  it("handles zero salary", () => {
    expect(calculateINSAFORP(0, 20, SV_RULES)).toBe(0);
  });

  it("boundary: exactly 10 employees", () => {
    expect(calculateINSAFORP(1_000, INSAFORP_MIN_EMPLOYEES, SV_RULES)).toBe(
      10
    );
  });

  it("uses defaults when rules are empty", () => {
    expect(calculateINSAFORP(2_000, 10, [])).toBe(20);
  });
});

// ============================================================================
// ISR calculations (monthly tiers, May 2025 update)
// ============================================================================

describe("calculateISR", () => {
  it("returns 0 for income in exempt bracket (≤$550)", () => {
    // Salary $500, deductions ~$50 → taxable $450
    expect(calculateISR(500, 50, SV_RULES)).toBe(0);
  });

  it("returns 0 for taxable exactly $550", () => {
    expect(calculateISR(600, 50, SV_RULES)).toBe(0);
  });

  it("calculates 10% bracket ($550.01–$895.24)", () => {
    // Taxable = 700
    // ISR = 17.67 + (700 - 550) * 0.10 = 17.67 + 15.00 = 32.67
    const isr = calculateISR(750, 50, SV_RULES);
    expect(isr).toBe(round2(17.67 + (700 - 550) * 0.1));
  });

  it("calculates at the boundary of 10% bracket", () => {
    // Taxable = 550.01 (just entered 10% bracket)
    // ISR = 17.67 + (550.01 - 550) * 0.10 = 17.67 + 0.001 = 17.67
    const isr = calculateISR(600.01, 50, SV_RULES);
    expect(isr).toBe(round2(17.67 + 0.01 * 0.1));
  });

  it("calculates 20% bracket ($895.25–$2,038.10)", () => {
    // Taxable = 1,200
    // ISR = 52.19 + (1,200 - 895.24) * 0.20 = 52.19 + 60.952 = 113.14
    const isr = calculateISR(1_300, 100, SV_RULES);
    expect(isr).toBe(round2(52.19 + (1_200 - 895.24) * 0.2));
  });

  it("calculates 30% bracket ($2,038.11+)", () => {
    // Taxable = 3,000
    // ISR = 280.76 + (3,000 - 2,038.10) * 0.30 = 280.76 + 288.57 = 569.33
    const isr = calculateISR(3_200, 200, SV_RULES);
    expect(isr).toBe(round2(280.76 + (3_000 - 2_038.1) * 0.3));
  });

  it("handles large salary in 30% bracket", () => {
    // Taxable = 8,000
    // ISR = 280.76 + (8,000 - 2,038.10) * 0.30 = 280.76 + 1,788.57 = 2,069.33
    const isr = calculateISR(9_000, 1_000, SV_RULES);
    expect(isr).toBe(round2(280.76 + (8_000 - 2_038.1) * 0.3));
  });

  it("returns 0 when deductions exceed gross", () => {
    expect(calculateISR(500, 600, SV_RULES)).toBe(0);
  });

  it("returns 0 when gross is zero", () => {
    expect(calculateISR(0, 0, SV_RULES)).toBe(0);
  });

  it("uses default tiers when ISR rule is absent", () => {
    const rulesWithoutISR = SV_RULES.filter((r) => r.code !== "isr");
    // Taxable = 700 → 10% bracket
    const isr = calculateISR(750, 50, rulesWithoutISR);
    expect(isr).toBe(round2(17.67 + (700 - 550) * 0.1));
  });
});

// ============================================================================
// Overtime calculations
// ============================================================================

describe("calculateOvertime", () => {
  it("calculates overtime at 2x multiplier", () => {
    // Hourly: 800 / 190 = 4.2105...
    // OT: 10 * 4.2105... * 2 = 84.21
    const ot = calculateOvertime(800, 10);
    expect(ot).toBe(
      round2((800 / MONTHLY_HOURS) * 10 * OVERTIME_MULTIPLIER)
    );
  });

  it("returns 0 for zero hours", () => {
    expect(calculateOvertime(800, 0)).toBe(0);
  });

  it("returns 0 for negative hours", () => {
    expect(calculateOvertime(800, -5)).toBe(0);
  });

  it("handles fractional hours", () => {
    const ot = calculateOvertime(950, 3.5);
    expect(ot).toBe(
      round2((950 / MONTHLY_HOURS) * 3.5 * OVERTIME_MULTIPLIER)
    );
  });
});

// ============================================================================
// getYearsOfService
// ============================================================================

describe("getYearsOfService", () => {
  it("calculates years between dates", () => {
    const years = getYearsOfService("2020-01-01", "2025-01-01");
    expect(years).toBeCloseTo(5, 0);
  });

  it("returns 0 for same date", () => {
    expect(getYearsOfService("2024-06-01", "2024-06-01")).toBe(0);
  });

  it("calculates partial years", () => {
    const years = getYearsOfService("2024-01-01", "2024-07-01");
    expect(years).toBeGreaterThan(0.4);
    expect(years).toBeLessThan(0.6);
  });
});

// ============================================================================
// Aguinaldo days by seniority
// ============================================================================

describe("getAguinaldoDays", () => {
  it("returns 0 for less than 1 year", () => {
    expect(getAguinaldoDays(0)).toBe(0);
    expect(getAguinaldoDays(0.5)).toBe(0);
    expect(getAguinaldoDays(0.99)).toBe(0);
  });

  it("returns 15 days for 1–3 years", () => {
    expect(getAguinaldoDays(1)).toBe(15);
    expect(getAguinaldoDays(1.5)).toBe(15);
    expect(getAguinaldoDays(2.99)).toBe(15);
  });

  it("returns 19 days for 3–10 years", () => {
    expect(getAguinaldoDays(3)).toBe(19);
    expect(getAguinaldoDays(5)).toBe(19);
    expect(getAguinaldoDays(9.99)).toBe(19);
  });

  it("returns 21 days for 10+ years", () => {
    expect(getAguinaldoDays(10)).toBe(21);
    expect(getAguinaldoDays(15)).toBe(21);
    expect(getAguinaldoDays(30)).toBe(21);
  });
});

// ============================================================================
// Provisions
// ============================================================================

describe("calculateProvisions", () => {
  const emp: SVPayrollEmployee = {
    id: "emp-prov",
    base_salary: 1_200,
    hire_date: "2020-01-01",
  };

  it("calculates aguinaldo with seniority-based days", () => {
    // 4+ years but <10 → 19 days
    // Daily: 1,200 / 30 = 40
    // Aguinaldo provision: 40 * 19 / 12 = 63.33
    const provisions = calculateProvisions(1_200, emp);
    expect(provisions.aguinaldo).toBe(round2((1_200 / 30) * 19 / 12));
  });

  it("calculates vacation provision (15 days + 30% bonus)", () => {
    // Daily: 1,200 / 30 = 40
    // Vacation: 40 * 15 * 1.3 / 12 = 65.00
    const provisions = calculateProvisions(1_200, emp);
    expect(provisions.vacaciones).toBe(round2((1_200 / 30) * 15 * 1.3 / 12));
  });

  it("returns 0 provisions for employee with <1 year", () => {
    const newEmp: SVPayrollEmployee = {
      id: "new-emp",
      base_salary: 800,
      hire_date: new Date().toISOString().split("T")[0],
    };
    const provisions = calculateProvisions(800, newEmp);
    expect(provisions.aguinaldo).toBe(0);
    expect(provisions.vacaciones).toBe(0);
    expect(provisions.total).toBe(0);
  });

  it("uses 15 aguinaldo days for 1–3 year employee", () => {
    const emp2yr: SVPayrollEmployee = {
      id: "emp-2yr",
      base_salary: 900,
      hire_date: "2024-06-01", // ~1.7 years
    };
    const provisions = calculateProvisions(900, emp2yr);
    expect(provisions.aguinaldo).toBe(round2((900 / 30) * 15 / 12));
  });

  it("uses 21 aguinaldo days for 10+ year employee", () => {
    const seniorEmp: SVPayrollEmployee = {
      id: "emp-senior",
      base_salary: 2_000,
      hire_date: "2010-01-01",
    };
    const provisions = calculateProvisions(2_000, seniorEmp);
    expect(provisions.aguinaldo).toBe(round2((2_000 / 30) * 21 / 12));
  });

  it("totals correctly", () => {
    const provisions = calculateProvisions(1_200, emp);
    expect(provisions.total).toBe(
      round2(provisions.aguinaldo + provisions.vacaciones)
    );
  });
});

// ============================================================================
// Full payroll — standard case ($800 salary)
// ============================================================================

describe("calculateElSalvadorPayroll", () => {
  describe("standard salary ($800/month)", () => {
    const result = calculateElSalvadorPayroll(
      EMPLOYEE,
      PERIOD,
      SV_RULES,
      COMPANY
    );

    it("returns correct gross salary", () => {
      expect(result.gross_salary).toBe(800);
      expect(result.base_salary).toBe(800);
      expect(result.overtime_amount).toBe(0);
      expect(result.bonuses).toBe(0);
      expect(result.is_quincena_25).toBe(false);
    });

    it("calculates ISSS employee deduction (below cap)", () => {
      // 800 * 3% = 24
      expect(result.deductions.isss).toBe(24);
    });

    it("calculates AFP employee deduction", () => {
      // 800 * 7.25% = 58
      expect(result.deductions.afp).toBe(58);
    });

    it("calculates ISR on taxable income", () => {
      // Taxable = 800 - 24 - 58 = 718
      // Bracket: $550.01–$895.24 → 10%
      // ISR = 17.67 + (718 - 550) * 0.10 = 17.67 + 16.80 = 34.47
      const taxable = 800 - 24 - 58;
      const expectedISR = round2(17.67 + (taxable - 550) * 0.1);
      expect(result.deductions.isr).toBe(expectedISR);
    });

    it("calculates total deductions", () => {
      expect(result.deductions.total).toBe(
        round2(
          result.deductions.isss + result.deductions.afp + result.deductions.isr
        )
      );
    });

    it("calculates net pay", () => {
      expect(result.net_pay).toBe(
        round2(result.gross_salary - result.deductions.total)
      );
    });

    it("calculates ISSS employer contribution", () => {
      // 800 * 7.5% = 60
      expect(result.employer_contributions.isss).toBe(60);
    });

    it("calculates AFP employer contribution", () => {
      // 800 * 8.75% = 70
      expect(result.employer_contributions.afp).toBe(70);
    });

    it("calculates INSAFORP (company has 25 employees)", () => {
      // 800 * 1% = 8
      expect(result.employer_contributions.insaforp).toBe(8);
    });

    it("calculates employer contributions total", () => {
      expect(result.employer_contributions.total).toBe(
        round2(
          result.employer_contributions.isss +
            result.employer_contributions.afp +
            result.employer_contributions.insaforp
        )
      );
    });

    it("calculates provisions", () => {
      expect(result.provisions.aguinaldo).toBeGreaterThan(0);
      expect(result.provisions.vacaciones).toBeGreaterThan(0);
    });

    it("calculates employer cost", () => {
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
    const periodWithOT: SVPayrollPeriodInput = {
      ...PERIOD,
      overtime_hours: 10,
    };

    const result = calculateElSalvadorPayroll(
      EMPLOYEE,
      periodWithOT,
      SV_RULES,
      COMPANY
    );

    it("includes overtime in gross (2x rate)", () => {
      const expectedOT = round2(
        (800 / MONTHLY_HOURS) * 10 * OVERTIME_MULTIPLIER
      );
      expect(result.overtime_amount).toBe(expectedOT);
      expect(result.gross_salary).toBe(round2(800 + expectedOT));
    });

    it("ISSS is still capped when gross exceeds $1,000", () => {
      // 800 + ~84.21 OT = 884.21 (below cap so full applies)
      expect(result.deductions.isss).toBe(
        round2(result.gross_salary * 0.03)
      );
    });

    it("ensures net + deductions = gross", () => {
      expect(round2(result.net_pay + result.deductions.total)).toBe(
        result.gross_salary
      );
    });
  });

  // ==========================================================================
  // Salary above ISSS cap
  // ==========================================================================

  describe("salary above ISSS cap ($2,500)", () => {
    const highEmployee: SVPayrollEmployee = {
      id: "emp-high",
      base_salary: 2_500,
      hire_date: "2018-01-01",
    };

    const result = calculateElSalvadorPayroll(
      highEmployee,
      PERIOD,
      SV_RULES,
      COMPANY
    );

    it("ISSS employee is capped at $30", () => {
      expect(result.deductions.isss).toBe(ISSS_EMPLOYEE_MAX);
    });

    it("ISSS employer is capped at $75", () => {
      // 1,000 * 7.5% = 75
      expect(result.employer_contributions.isss).toBe(75);
    });

    it("AFP applies to full salary (no cap)", () => {
      // 2,500 * 7.25% = 181.25
      expect(result.deductions.afp).toBe(181.25);
      // 2,500 * 8.75% = 218.75
      expect(result.employer_contributions.afp).toBe(218.75);
    });

    it("ISR falls in 30% bracket", () => {
      // Taxable = 2,500 - 30 - 181.25 = 2,288.75
      // Bracket: $2,038.11+ → 30%
      // ISR = 280.76 + (2,288.75 - 2,038.10) * 0.30 = 280.76 + 75.195 = 355.96
      const taxable = 2_500 - 30 - 181.25;
      const expectedISR = round2(280.76 + (taxable - 2_038.1) * 0.3);
      expect(result.deductions.isr).toBe(expectedISR);
    });

    it("ensures net + deductions = gross", () => {
      expect(round2(result.net_pay + result.deductions.total)).toBe(
        result.gross_salary
      );
    });
  });

  // ==========================================================================
  // Minimum wage scenario ($365)
  // ==========================================================================

  describe("minimum wage employee ($365)", () => {
    const minWageEmployee: SVPayrollEmployee = {
      id: "emp-min",
      base_salary: 365,
      hire_date: "2023-06-01",
    };

    const result = calculateElSalvadorPayroll(
      minWageEmployee,
      PERIOD,
      SV_RULES,
      COMPANY
    );

    it("ISSS uses full salary (well below cap)", () => {
      // 365 * 3% = 10.95
      expect(result.deductions.isss).toBe(10.95);
    });

    it("AFP at 7.25%", () => {
      // 365 * 7.25% = 26.46
      expect(result.deductions.afp).toBe(round2(365 * 0.0725));
    });

    it("ISR is 0 (taxable below $550 exempt threshold)", () => {
      // Taxable = 365 - 10.95 - 26.46 = 327.59 → exempt
      expect(result.deductions.isr).toBe(0);
    });

    it("net is gross minus social security only", () => {
      const expectedDeductions = round2(10.95 + round2(365 * 0.0725));
      expect(result.deductions.total).toBe(expectedDeductions);
      expect(result.net_pay).toBe(round2(365 - expectedDeductions));
    });
  });

  // ==========================================================================
  // Quincena 25 (February special — exempt from all deductions)
  // ==========================================================================

  describe("Quincena 25 (February, 50% salary, fully exempt)", () => {
    const febPeriod: SVPayrollPeriodInput = {
      start_date: "2025-02-01",
      end_date: "2025-02-28",
      is_quincena_25: true,
    };

    const result = calculateElSalvadorPayroll(
      EMPLOYEE,
      febPeriod,
      SV_RULES,
      COMPANY
    );

    it("gross is 50% of base salary", () => {
      expect(result.gross_salary).toBe(400);
      expect(result.base_salary).toBe(400);
      expect(result.is_quincena_25).toBe(true);
    });

    it("ISSS is 0 (exempt)", () => {
      expect(result.deductions.isss).toBe(0);
    });

    it("AFP is 0 (exempt)", () => {
      expect(result.deductions.afp).toBe(0);
    });

    it("ISR is 0 (exempt)", () => {
      expect(result.deductions.isr).toBe(0);
    });

    it("total deductions are 0", () => {
      expect(result.deductions.total).toBe(0);
    });

    it("net equals gross (no deductions)", () => {
      expect(result.net_pay).toBe(400);
    });

    it("employer contributions are also 0", () => {
      expect(result.employer_contributions.isss).toBe(0);
      expect(result.employer_contributions.afp).toBe(0);
      expect(result.employer_contributions.insaforp).toBe(0);
      expect(result.employer_contributions.total).toBe(0);
    });

    it("provisions are based on full monthly salary, not quincena amount", () => {
      // Provisions should use base_salary (800), not the quincena (400)
      const dailySalary = 800 / 30;
      const yearsOfService = getYearsOfService(EMPLOYEE.hire_date);
      const aguinaldoDays = getAguinaldoDays(yearsOfService);
      const expectedAguinaldo = round2((dailySalary * aguinaldoDays) / 12);
      expect(result.provisions.aguinaldo).toBe(expectedAguinaldo);
    });

    it("employer cost includes gross + provisions only", () => {
      expect(result.employer_cost).toBe(
        round2(result.gross_salary + result.provisions.total)
      );
    });
  });

  // ==========================================================================
  // Company with fewer than 10 employees (no INSAFORP)
  // ==========================================================================

  describe("small company (no INSAFORP)", () => {
    const smallCompany: SVCompanyContext = { employee_count: 5 };

    const result = calculateElSalvadorPayroll(
      EMPLOYEE,
      PERIOD,
      SV_RULES,
      smallCompany
    );

    it("INSAFORP is 0", () => {
      expect(result.employer_contributions.insaforp).toBe(0);
    });

    it("employer total excludes INSAFORP", () => {
      expect(result.employer_contributions.total).toBe(
        round2(
          result.employer_contributions.isss +
            result.employer_contributions.afp
        )
      );
    });

    it("ISSS and AFP still apply normally", () => {
      expect(result.deductions.isss).toBe(24);
      expect(result.deductions.afp).toBe(58);
    });
  });

  // ==========================================================================
  // Company with exactly 9 employees (boundary)
  // ==========================================================================

  describe("company with 9 employees (INSAFORP boundary)", () => {
    const result = calculateElSalvadorPayroll(EMPLOYEE, PERIOD, SV_RULES, {
      employee_count: 9,
    });

    it("INSAFORP is 0", () => {
      expect(result.employer_contributions.insaforp).toBe(0);
    });
  });

  // ==========================================================================
  // Company with exactly 10 employees (INSAFORP applies)
  // ==========================================================================

  describe("company with 10 employees (INSAFORP boundary)", () => {
    const result = calculateElSalvadorPayroll(EMPLOYEE, PERIOD, SV_RULES, {
      employee_count: 10,
    });

    it("INSAFORP is calculated", () => {
      expect(result.employer_contributions.insaforp).toBe(8);
    });
  });

  // ==========================================================================
  // With bonuses and commissions
  // ==========================================================================

  describe("with bonuses and commissions", () => {
    const periodWithExtras: SVPayrollPeriodInput = {
      ...PERIOD,
      bonuses: 200,
      commissions: 150,
      other_earnings: 50,
    };

    const result = calculateElSalvadorPayroll(
      EMPLOYEE,
      periodWithExtras,
      SV_RULES,
      COMPANY
    );

    it("includes all earnings in gross", () => {
      expect(result.gross_salary).toBe(800 + 200 + 150 + 50);
      expect(result.bonuses).toBe(200);
      expect(result.commissions).toBe(150);
      expect(result.other_earnings).toBe(50);
    });

    it("ISSS is capped (gross $1,200 > cap $1,000)", () => {
      expect(result.deductions.isss).toBe(ISSS_EMPLOYEE_MAX);
    });

    it("AFP applies to full $1,200", () => {
      expect(result.deductions.afp).toBe(round2(1_200 * 0.0725));
    });

    it("ensures net + deductions = gross", () => {
      expect(round2(result.net_pay + result.deductions.total)).toBe(
        result.gross_salary
      );
    });
  });

  // ==========================================================================
  // Zero salary
  // ==========================================================================

  describe("zero salary", () => {
    const zeroEmployee: SVPayrollEmployee = {
      id: "emp-zero",
      base_salary: 0,
      hire_date: "2020-01-01",
    };

    const result = calculateElSalvadorPayroll(
      zeroEmployee,
      PERIOD,
      SV_RULES,
      COMPANY
    );

    it("all values are 0", () => {
      expect(result.gross_salary).toBe(0);
      expect(result.deductions.total).toBe(0);
      expect(result.net_pay).toBe(0);
      expect(result.employer_contributions.total).toBe(0);
    });
  });

  // ==========================================================================
  // Empty rules (defaults)
  // ==========================================================================

  describe("empty rules (fallback to defaults)", () => {
    const result = calculateElSalvadorPayroll(
      EMPLOYEE,
      PERIOD,
      [],
      COMPANY
    );

    it("still calculates using default rates", () => {
      expect(result.deductions.isss).toBe(24);
      expect(result.deductions.afp).toBe(58);
      expect(result.employer_contributions.insaforp).toBe(8);
    });

    it("net + deductions = gross", () => {
      expect(round2(result.net_pay + result.deductions.total)).toBe(
        result.gross_salary
      );
    });
  });

  // ==========================================================================
  // Inactive rules
  // ==========================================================================

  describe("inactive rules are skipped", () => {
    const inactiveRules = SV_RULES.map((r) => ({
      ...r,
      is_active: false,
    }));

    const result = calculateElSalvadorPayroll(
      EMPLOYEE,
      PERIOD,
      inactiveRules,
      COMPANY
    );

    it("falls back to defaults when all rules inactive", () => {
      expect(result.deductions.isss).toBe(24);
      expect(result.gross_salary).toBe(800);
    });
  });

  // ==========================================================================
  // ISR boundary: taxable just at $550 (exempt)
  // ==========================================================================

  describe("ISR boundary: taxable exactly at $550 threshold", () => {
    // Need gross - ISSS - AFP = 550
    // ISSS = min(gross, 1000) * 3%, AFP = gross * 7.25%
    // gross - gross*0.03 - gross*0.0725 = 550
    // gross * 0.8975 = 550 → gross = 612.81
    const borderEmployee: SVPayrollEmployee = {
      id: "emp-isr-border",
      base_salary: 612.81,
      hire_date: "2022-01-01",
    };

    const result = calculateElSalvadorPayroll(
      borderEmployee,
      PERIOD,
      SV_RULES,
      COMPANY
    );

    it("ISR is 0 at the boundary", () => {
      const taxable =
        612.81 -
        round2(612.81 * 0.03) -
        round2(612.81 * 0.0725);
      // taxable ≈ 550.00 → exactly at exempt boundary
      expect(taxable).toBeCloseTo(550, 0);
      expect(result.deductions.isr).toBe(0);
    });
  });

  // ==========================================================================
  // High salary in 30% bracket with all extras
  // ==========================================================================

  describe("high salary ($5,000) + overtime + bonuses", () => {
    const highEmp: SVPayrollEmployee = {
      id: "emp-high-combo",
      base_salary: 5_000,
      hire_date: "2012-01-01",
    };

    const per: SVPayrollPeriodInput = {
      ...PERIOD,
      overtime_hours: 20,
      bonuses: 1_000,
      commissions: 500,
    };

    const result = calculateElSalvadorPayroll(
      highEmp,
      per,
      SV_RULES,
      COMPANY
    );

    it("gross includes all components", () => {
      const expectedOT = round2(
        (5_000 / MONTHLY_HOURS) * 20 * OVERTIME_MULTIPLIER
      );
      expect(result.gross_salary).toBe(
        round2(5_000 + expectedOT + 1_000 + 500)
      );
    });

    it("ISSS is capped at $30/$75", () => {
      expect(result.deductions.isss).toBe(ISSS_EMPLOYEE_MAX);
      expect(result.employer_contributions.isss).toBe(75);
    });

    it("ISR is in 30% bracket", () => {
      const taxable =
        result.gross_salary -
        result.deductions.isss -
        result.deductions.afp;
      expect(taxable).toBeGreaterThan(2_038.11);
      expect(result.deductions.isr).toBeGreaterThan(280);
    });

    it("provisions use 21 aguinaldo days (10+ years)", () => {
      const dailySalary = result.gross_salary / 30;
      const expectedAguinaldo = round2((dailySalary * 21) / 12);
      expect(result.provisions.aguinaldo).toBe(expectedAguinaldo);
    });

    it("ensures net + deductions = gross", () => {
      expect(round2(result.net_pay + result.deductions.total)).toBe(
        result.gross_salary
      );
    });
  });

  // ==========================================================================
  // Quincena 25 with overtime (OT still calculated on full base)
  // ==========================================================================

  describe("Quincena 25 with overtime", () => {
    const q25WithOT: SVPayrollPeriodInput = {
      start_date: "2025-02-01",
      end_date: "2025-02-28",
      is_quincena_25: true,
      overtime_hours: 5,
    };

    const result = calculateElSalvadorPayroll(
      EMPLOYEE,
      q25WithOT,
      SV_RULES,
      COMPANY
    );

    it("base is 50% but overtime is on full salary rate", () => {
      expect(result.base_salary).toBe(400);
      // OT hourly rate uses full 800 base
      const expectedOT = round2(
        (800 / MONTHLY_HOURS) * 5 * OVERTIME_MULTIPLIER
      );
      expect(result.overtime_amount).toBe(expectedOT);
      expect(result.gross_salary).toBe(round2(400 + expectedOT));
    });

    it("all deductions are still 0 (quincena 25 exempt)", () => {
      expect(result.deductions.total).toBe(0);
      expect(result.employer_contributions.total).toBe(0);
    });

    it("net equals gross", () => {
      expect(result.net_pay).toBe(result.gross_salary);
    });
  });

  // ==========================================================================
  // Default company context (defaults to 10 employees)
  // ==========================================================================

  describe("default company context", () => {
    const result = calculateElSalvadorPayroll(EMPLOYEE, PERIOD, SV_RULES);

    it("defaults to 10 employees (INSAFORP applies)", () => {
      expect(result.employer_contributions.insaforp).toBe(8);
    });
  });
});
