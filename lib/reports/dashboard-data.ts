/**
 * Mock data for the reports dashboard charts
 */

export interface MonthlyPayrollCost {
  month: string;
  gross: number;
  deductions: number;
  net: number;
  employerCost: number;
}

export interface DepartmentDistribution {
  department: string;
  headcount: number;
  totalCost: number;
  avgSalary: number;
}

export interface HeadcountTrend {
  month: string;
  active: number;
  hired: number;
  terminated: number;
}

// Last 12 months payroll cost data (HN Lempiras)
export const MONTHLY_PAYROLL_DATA: MonthlyPayrollCost[] = [
  { month: "Abr 2025", gross: 250000, deductions: 42000, net: 208000, employerCost: 315000 },
  { month: "May 2025", gross: 252000, deductions: 42300, net: 209700, employerCost: 317500 },
  { month: "Jun 2025", gross: 248000, deductions: 41600, net: 206400, employerCost: 312000 },
  { month: "Jul 2025", gross: 255000, deductions: 42800, net: 212200, employerCost: 321000 },
  { month: "Ago 2025", gross: 260000, deductions: 43600, net: 216400, employerCost: 327000 },
  { month: "Sep 2025", gross: 258000, deductions: 43300, net: 214700, employerCost: 325000 },
  { month: "Oct 2025", gross: 262000, deductions: 43900, net: 218100, employerCost: 330000 },
  { month: "Nov 2025", gross: 265000, deductions: 44400, net: 220600, employerCost: 334000 },
  { month: "Dic 2025", gross: 310000, deductions: 52000, net: 258000, employerCost: 390000 },
  { month: "Ene 2026", gross: 268000, deductions: 44900, net: 223100, employerCost: 337000 },
  { month: "Feb 2026", gross: 272000, deductions: 45600, net: 226400, employerCost: 342000 },
  { month: "Mar 2026", gross: 275000, deductions: 46100, net: 228900, employerCost: 346000 },
];

export const DEPARTMENT_DISTRIBUTION: DepartmentDistribution[] = [
  { department: "Ingeniería", headcount: 3, totalCost: 195000, avgSalary: 35000 },
  { department: "Recursos Humanos", headcount: 2, totalCost: 85000, avgSalary: 37500 },
  { department: "Ventas", headcount: 1, totalCost: 32000, avgSalary: 32000 },
  { department: "Contabilidad", headcount: 1, totalCost: 38000, avgSalary: 28000 },
];

export const HEADCOUNT_TREND: HeadcountTrend[] = [
  { month: "Abr 2025", active: 6, hired: 0, terminated: 0 },
  { month: "May 2025", active: 6, hired: 0, terminated: 0 },
  { month: "Jun 2025", active: 6, hired: 0, terminated: 0 },
  { month: "Jul 2025", active: 5, hired: 0, terminated: 1 },
  { month: "Ago 2025", active: 5, hired: 0, terminated: 0 },
  { month: "Sep 2025", active: 5, hired: 0, terminated: 0 },
  { month: "Oct 2025", active: 5, hired: 0, terminated: 0 },
  { month: "Nov 2025", active: 5, hired: 0, terminated: 0 },
  { month: "Dic 2025", active: 5, hired: 0, terminated: 0 },
  { month: "Ene 2026", active: 5, hired: 0, terminated: 0 },
  { month: "Feb 2026", active: 6, hired: 1, terminated: 0 },
  { month: "Mar 2026", active: 6, hired: 0, terminated: 0 },
];
