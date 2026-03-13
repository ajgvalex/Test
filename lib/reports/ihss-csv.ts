/**
 * IHSS Honduras - CSV export
 *
 * Formato requerido por el portal IHSS:
 * Número Patronal, Identidad, Nombre Completo, Salario Cotizable,
 * Aporte Empleado EM, Aporte Empleado IVM, Aporte Patronal EM,
 * Aporte Patronal IVM, Días Trabajados, Período
 */

import type { Employee } from "@/types";

export interface IHSSRow {
  patronalNumber: string;
  identityNumber: string;
  fullName: string;
  salaryCotizable: number;
  employeeEM: number;
  employeeIVM: number;
  employerEM: number;
  employerIVM: number;
  daysWorked: number;
  period: string;
}

export interface IHSSExportInput {
  patronalNumber: string;
  period: string;
  employees: {
    employee: Employee;
    grossSalary: number;
    ihssEM_employee: number;
    ihssIVM_employee: number;
    ihssEM_employer: number;
    ihssIVM_employer: number;
    daysWorked: number;
  }[];
}

const IHSS_SALARY_CAP = 11_290.28;

export function generateIHSSCSV(input: IHSSExportInput): string {
  const headers = [
    "Número Patronal",
    "Identidad",
    "Nombre Completo",
    "Salario Cotizable",
    "Aporte Empleado EM",
    "Aporte Empleado IVM",
    "Aporte Patronal EM",
    "Aporte Patronal IVM",
    "Días Trabajados",
    "Período",
  ];

  const rows = input.employees.map((e) => {
    const cotizable = Math.min(e.grossSalary, IHSS_SALARY_CAP);
    return [
      input.patronalNumber,
      e.employee.identity_number,
      `${e.employee.last_name} ${e.employee.first_name}`,
      cotizable.toFixed(2),
      e.ihssEM_employee.toFixed(2),
      e.ihssIVM_employee.toFixed(2),
      e.ihssEM_employer.toFixed(2),
      e.ihssIVM_employer.toFixed(2),
      String(e.daysWorked),
      input.period,
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

/**
 * Summary totals for the IHSS report footer
 */
export function getIHSSTotals(input: IHSSExportInput) {
  return input.employees.reduce(
    (acc, e) => ({
      cotizable: acc.cotizable + Math.min(e.grossSalary, IHSS_SALARY_CAP),
      employeeEM: acc.employeeEM + e.ihssEM_employee,
      employeeIVM: acc.employeeIVM + e.ihssIVM_employee,
      employerEM: acc.employerEM + e.ihssEM_employer,
      employerIVM: acc.employerIVM + e.ihssIVM_employer,
      totalEmployee:
        acc.totalEmployee + e.ihssEM_employee + e.ihssIVM_employee,
      totalEmployer:
        acc.totalEmployer + e.ihssEM_employer + e.ihssIVM_employer,
    }),
    {
      cotizable: 0,
      employeeEM: 0,
      employeeIVM: 0,
      employerEM: 0,
      employerIVM: 0,
      totalEmployee: 0,
      totalEmployer: 0,
    }
  );
}
