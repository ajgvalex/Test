/**
 * El Salvador - ISSS/AFP OVISSS format export
 *
 * Formato OVISSS (Oficina Virtual del ISSS):
 * Tipo Registro|NUP|DUI|Nombre|Salario Reportado|
 * Cotización ISSS Trabajador|Cotización AFP Trabajador|
 * Cotización ISSS Patronal|Cotización AFP Patronal|
 * Días Cotizados|Código AFP|Período
 *
 * Pipe-delimited flat file
 */

import type { Employee } from "@/types";

export interface OVISSSRow {
  recordType: string; // "D" for detail
  nup: string;
  dui: string;
  fullName: string;
  reportedSalary: number;
  isssEmployee: number;
  afpEmployee: number;
  isssEmployer: number;
  afpEmployer: number;
  daysCotized: number;
  afpCode: string; // "01" Confía, "02" Crecer
  period: string; // YYYYMM
}

export interface OVISSSExportInput {
  patronalNumber: string;
  nit: string;
  period: string; // YYYYMM format
  afpCode: string;
  employees: {
    employee: Employee;
    nup: string;
    grossSalary: number;
    isssEmployee: number;
    afpEmployee: number;
    isssEmployer: number;
    afpEmployer: number;
    daysCotized: number;
  }[];
}

export function generateOVISSSFile(input: OVISSSExportInput): string {
  // Header record
  const header = [
    "E", // Encabezado
    input.patronalNumber,
    input.nit,
    input.period,
    String(input.employees.length).padStart(5, "0"),
    new Date().toISOString().slice(0, 10).replace(/-/g, ""),
  ].join("|");

  // Detail records
  const details = input.employees.map((e) =>
    [
      "D",
      e.nup,
      e.employee.identity_number,
      `${e.employee.last_name}, ${e.employee.first_name}`.toUpperCase(),
      e.grossSalary.toFixed(2),
      e.isssEmployee.toFixed(2),
      e.afpEmployee.toFixed(2),
      e.isssEmployer.toFixed(2),
      e.afpEmployer.toFixed(2),
      String(e.daysCotized).padStart(2, "0"),
      input.afpCode,
      input.period,
    ].join("|")
  );

  // Totals record
  const totals = input.employees.reduce(
    (acc, e) => ({
      salary: acc.salary + e.grossSalary,
      isssEmp: acc.isssEmp + e.isssEmployee,
      afpEmp: acc.afpEmp + e.afpEmployee,
      isssPatr: acc.isssPatr + e.isssEmployer,
      afpPatr: acc.afpPatr + e.afpEmployer,
    }),
    { salary: 0, isssEmp: 0, afpEmp: 0, isssPatr: 0, afpPatr: 0 }
  );

  const trailer = [
    "T",
    String(input.employees.length).padStart(5, "0"),
    totals.salary.toFixed(2),
    totals.isssEmp.toFixed(2),
    totals.afpEmp.toFixed(2),
    totals.isssPatr.toFixed(2),
    totals.afpPatr.toFixed(2),
  ].join("|");

  return [header, ...details, trailer].join("\n");
}

/**
 * Summary totals for UI display
 */
export function getOVISSTotals(input: OVISSSExportInput) {
  return input.employees.reduce(
    (acc, e) => ({
      salary: acc.salary + e.grossSalary,
      isssEmployee: acc.isssEmployee + e.isssEmployee,
      afpEmployee: acc.afpEmployee + e.afpEmployee,
      isssEmployer: acc.isssEmployer + e.isssEmployer,
      afpEmployer: acc.afpEmployer + e.afpEmployer,
      totalEmployee: acc.totalEmployee + e.isssEmployee + e.afpEmployee,
      totalEmployer: acc.totalEmployer + e.isssEmployer + e.afpEmployer,
    }),
    {
      salary: 0,
      isssEmployee: 0,
      afpEmployee: 0,
      isssEmployer: 0,
      afpEmployer: 0,
      totalEmployee: 0,
      totalEmployer: 0,
    }
  );
}
