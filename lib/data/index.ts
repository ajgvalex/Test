import {
  MOCK_EMPLOYEES,
  MOCK_PAYROLL_PERIODS,
  MOCK_NOVEDADES,
  getDeductionRules as getMockDeductionRules,
} from "@/lib/mock-data";
import type { Employee, PayrollPeriod, CountryCode, DeductionRule } from "@/types";
import type { Novedad } from "@/lib/mock-data";

export function getEmployees(companyId: string): Employee[] {
  return MOCK_EMPLOYEES.filter((e) => e.company_id === companyId);
}

export function getActiveEmployees(
  companyId: string,
  country?: CountryCode
): Employee[] {
  return MOCK_EMPLOYEES.filter(
    (e) =>
      e.company_id === companyId &&
      e.status === "active" &&
      (!country || e.country === country)
  );
}

export function getEmployeeById(
  companyId: string,
  employeeId: string
): Employee | undefined {
  return MOCK_EMPLOYEES.find(
    (e) => e.id === employeeId && e.company_id === companyId
  );
}

export function getPayrollPeriods(companyId: string): PayrollPeriod[] {
  return MOCK_PAYROLL_PERIODS.filter((p) => p.company_id === companyId);
}

export function getNovedades(employeeIds: string[]): Novedad[] {
  return MOCK_NOVEDADES.filter((n) => employeeIds.includes(n.employee_id));
}

export function getDeductionRules(country: CountryCode): DeductionRule[] {
  return getMockDeductionRules(country);
}
