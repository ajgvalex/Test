/**
 * Bank disbursement CSV export
 *
 * Generic format for salary payments:
 * Cuenta Destino, Nombre Beneficiario, Monto, Moneda, Referencia, Concepto
 */

import type { Employee } from "@/types";

export interface BankDisbursementRow {
  accountNumber: string;
  beneficiaryName: string;
  amount: number;
  currency: string;
  reference: string;
  concept: string;
}

export interface BankDisbursementInput {
  companyName: string;
  sourceAccount: string;
  periodName: string;
  paymentDate: string;
  currency: string;
  employees: {
    employee: Employee;
    netSalary: number;
  }[];
}

export function generateBankCSV(input: BankDisbursementInput): string {
  const headers = [
    "Cuenta Destino",
    "Nombre Beneficiario",
    "Monto",
    "Moneda",
    "Referencia",
    "Concepto",
  ];

  const rows = input.employees
    .filter((e) => e.employee.bank_account && e.employee.payment_method === "bank_transfer")
    .map((e, i) => {
      const ref = `PAY-${input.paymentDate.replace(/-/g, "")}-${String(i + 1).padStart(4, "0")}`;
      return [
        e.employee.bank_account!,
        `${e.employee.first_name} ${e.employee.last_name}`,
        e.netSalary.toFixed(2),
        input.currency,
        ref,
        `Pago nomina ${input.periodName}`,
      ]
        .map((field) => {
          // Escape fields containing commas
          if (field.includes(",")) return `"${field}"`;
          return field;
        })
        .join(",");
    });

  return [headers.join(","), ...rows].join("\n");
}

/**
 * Summary for UI display
 */
export function getBankDisbursementTotals(input: BankDisbursementInput) {
  const bankTransfers = input.employees.filter(
    (e) => e.employee.bank_account && e.employee.payment_method === "bank_transfer"
  );
  const otherPayments = input.employees.filter(
    (e) => !e.employee.bank_account || e.employee.payment_method !== "bank_transfer"
  );

  return {
    transferCount: bankTransfers.length,
    transferTotal: bankTransfers.reduce((s, e) => s + e.netSalary, 0),
    otherCount: otherPayments.length,
    otherTotal: otherPayments.reduce((s, e) => s + e.netSalary, 0),
    grandTotal: input.employees.reduce((s, e) => s + e.netSalary, 0),
  };
}
