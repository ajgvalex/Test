import type { EmployeePayrollPreview } from "@/app/(protected)/payroll/actions/payroll-actions";

// ============================================================================
// Zoho Books Journal Entry CSV Generator
// ============================================================================

export interface ZohoJournalConfig {
  /** Period end date in ISO format (YYYY-MM-DD) */
  journalDate: string;
  /** Reference e.g. "NOM-2026-01-Q1" */
  referenceNumber: string;
  /** Currency code: "HNL" or "USD" */
  currency: string;
  /** Descriptive notes for the journal */
  notes: string;
}

// Honduras account names
const HN_ACCOUNTS = {
  // Debits (expenses)
  salaryExpense: "Gasto de Salarios",
  ihssEmployerExpense: "Gasto IHSS Patronal",
  rapEmployerExpense: "Gasto RAP Patronal",
  infopExpense: "Gasto INFOP",
  aguinaldoExpense: "Gasto Aguinaldo",
  catorceMesExpense: "Gasto Décimo Cuarto",
  vacacionesExpense: "Gasto Vacaciones",
  cesantiaExpense: "Gasto Cesantía",
  // Credits (liabilities)
  ihssPayable: "IHSS por Pagar",
  rapPayable: "RAP por Pagar",
  isrPayable: "ISR por Pagar",
  ihssEmployerPayable: "IHSS Patronal por Pagar",
  rapEmployerPayable: "RAP Patronal por Pagar",
  infopPayable: "INFOP por Pagar",
  aguinaldoPayable: "Provisión Aguinaldo por Pagar",
  catorceMesPayable: "Provisión 14to Mes por Pagar",
  vacacionesPayable: "Provisión Vacaciones por Pagar",
  cesantiaPayable: "Provisión Cesantía por Pagar",
  netPayable: "Sueldos por Pagar",
};

// El Salvador account names
const SV_ACCOUNTS = {
  salaryExpense: "Gasto de Salarios",
  isssEmployerExpense: "Gasto ISSS Patronal",
  afpEmployerExpense: "Gasto AFP Patronal",
  insaforpExpense: "Gasto INSAFORP",
  aguinaldoExpense: "Gasto Aguinaldo",
  vacacionesExpense: "Gasto Vacaciones",
  isssPayable: "ISSS por Pagar",
  afpPayable: "AFP por Pagar",
  isrPayable: "ISR por Pagar",
  isssEmployerPayable: "ISSS Patronal por Pagar",
  afpEmployerPayable: "AFP Patronal por Pagar",
  insaforpPayable: "INSAFORP por Pagar",
  aguinaldoPayable: "Provisión Aguinaldo por Pagar",
  vacacionesPayable: "Provisión Vacaciones por Pagar",
  netPayable: "Sueldos por Pagar",
};

interface JournalLine {
  account: string;
  description: string;
  debit: number;
  credit: number;
  contactName: string;
  branchName: string;
}

const CSV_HEADERS = [
  "Journal Date",
  "Reference Number",
  "Journal Number Prefix",
  "Journal Number Suffix",
  "Notes",
  "Journal Type",
  "Currency",
  "Account",
  "Description",
  "Contact Name",
  "Debit",
  "Credit",
  "Status",
  "Exchange Rate",
  "Branch Name",
];

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function fmtAmount(amount: number): string {
  return amount === 0 ? "" : amount.toFixed(2);
}

function buildHondurasLines(
  entries: EmployeePayrollPreview[],
  config: ZohoJournalConfig
): JournalLine[] {
  const lines: JournalLine[] = [];

  // 1. DEBIT: Salary expense grouped by department (cost center)
  const salaryByDept = new Map<string, number>();
  for (const e of entries) {
    const dept = e.employee.department ?? "General";
    salaryByDept.set(dept, (salaryByDept.get(dept) ?? 0) + e.gross_salary);
  }
  for (const [dept, amount] of salaryByDept) {
    lines.push({
      account: HN_ACCOUNTS.salaryExpense,
      description: `Salarios ${dept}`,
      debit: round2(amount),
      credit: 0,
      contactName: "",
      branchName: dept,
    });
  }

  // 2. CREDIT: Employee deductions (aggregated)
  let totalIhssEm = 0, totalIhssIvm = 0, totalRap = 0, totalIsr = 0;
  for (const e of entries) {
    totalIhssEm += e.deductions["IHSS E/M"] ?? 0;
    totalIhssIvm += e.deductions["IHSS IVM"] ?? 0;
    totalRap += e.deductions["RAP"] ?? 0;
    totalIsr += e.deductions["ISR"] ?? 0;
  }
  const ihssEmployee = round2(totalIhssEm + totalIhssIvm);
  if (ihssEmployee > 0) {
    lines.push({
      account: HN_ACCOUNTS.ihssPayable,
      description: "IHSS empleado (E/M + IVM)",
      debit: 0,
      credit: ihssEmployee,
      contactName: "",
      branchName: "",
    });
  }
  if (round2(totalRap) > 0) {
    lines.push({
      account: HN_ACCOUNTS.rapPayable,
      description: "RAP empleado",
      debit: 0,
      credit: round2(totalRap),
      contactName: "",
      branchName: "",
    });
  }
  if (round2(totalIsr) > 0) {
    lines.push({
      account: HN_ACCOUNTS.isrPayable,
      description: "ISR empleado",
      debit: 0,
      credit: round2(totalIsr),
      contactName: "",
      branchName: "",
    });
  }

  // 3. CREDIT: Net pay
  const totalNet = round2(entries.reduce((s, e) => s + e.net_salary, 0));
  lines.push({
    account: HN_ACCOUNTS.netPayable,
    description: "Sueldos netos por pagar",
    debit: 0,
    credit: totalNet,
    contactName: "",
    branchName: "",
  });

  // 4. Employer contributions: DEBIT expenses + CREDIT liabilities
  let ecIhssEm = 0, ecIhssIvm = 0, ecRap = 0, ecInfop = 0;
  for (const e of entries) {
    ecIhssEm += e.employer_contributions["IHSS E/M Patronal"] ?? 0;
    ecIhssIvm += e.employer_contributions["IHSS IVM Patronal"] ?? 0;
    ecRap += e.employer_contributions["RAP Patronal"] ?? 0;
    ecInfop += e.employer_contributions["INFOP"] ?? 0;
  }
  const ecIhss = round2(ecIhssEm + ecIhssIvm);
  if (ecIhss > 0) {
    lines.push({
      account: HN_ACCOUNTS.ihssEmployerExpense,
      description: "IHSS patronal (E/M + IVM)",
      debit: ecIhss,
      credit: 0,
      contactName: "",
      branchName: "",
    });
    lines.push({
      account: HN_ACCOUNTS.ihssEmployerPayable,
      description: "IHSS patronal por pagar",
      debit: 0,
      credit: ecIhss,
      contactName: "",
      branchName: "",
    });
  }
  if (round2(ecRap) > 0) {
    lines.push({
      account: HN_ACCOUNTS.rapEmployerExpense,
      description: "RAP patronal",
      debit: round2(ecRap),
      credit: 0,
      contactName: "",
      branchName: "",
    });
    lines.push({
      account: HN_ACCOUNTS.rapEmployerPayable,
      description: "RAP patronal por pagar",
      debit: 0,
      credit: round2(ecRap),
      contactName: "",
      branchName: "",
    });
  }
  if (round2(ecInfop) > 0) {
    lines.push({
      account: HN_ACCOUNTS.infopExpense,
      description: "INFOP patronal",
      debit: round2(ecInfop),
      credit: 0,
      contactName: "",
      branchName: "",
    });
    lines.push({
      account: HN_ACCOUNTS.infopPayable,
      description: "INFOP por pagar",
      debit: 0,
      credit: round2(ecInfop),
      contactName: "",
      branchName: "",
    });
  }

  // 5. Provisions: DEBIT expenses + CREDIT liabilities
  let provAguinaldo = 0, provCatorce = 0, provVacaciones = 0, provCesantia = 0;
  for (const e of entries) {
    provAguinaldo += e.provisions["Aguinaldo"] ?? 0;
    provCatorce += e.provisions["Décimo Cuarto"] ?? 0;
    provVacaciones += e.provisions["Vacaciones"] ?? 0;
    provCesantia += e.provisions["Cesantía"] ?? 0;
  }

  const provisionPairs: [number, string, string, string][] = [
    [provAguinaldo, HN_ACCOUNTS.aguinaldoExpense, HN_ACCOUNTS.aguinaldoPayable, "Aguinaldo"],
    [provCatorce, HN_ACCOUNTS.catorceMesExpense, HN_ACCOUNTS.catorceMesPayable, "Décimo cuarto mes"],
    [provVacaciones, HN_ACCOUNTS.vacacionesExpense, HN_ACCOUNTS.vacacionesPayable, "Vacaciones"],
    [provCesantia, HN_ACCOUNTS.cesantiaExpense, HN_ACCOUNTS.cesantiaPayable, "Cesantía"],
  ];

  for (const [amount, debitAccount, creditAccount, label] of provisionPairs) {
    const rounded = round2(amount);
    if (rounded > 0) {
      lines.push({
        account: debitAccount,
        description: `Provisión ${label}`,
        debit: rounded,
        credit: 0,
        contactName: "",
        branchName: "",
      });
      lines.push({
        account: creditAccount,
        description: `Provisión ${label} por pagar`,
        debit: 0,
        credit: rounded,
        contactName: "",
        branchName: "",
      });
    }
  }

  return lines;
}

function buildElSalvadorLines(
  entries: EmployeePayrollPreview[],
  config: ZohoJournalConfig
): JournalLine[] {
  const lines: JournalLine[] = [];

  // 1. DEBIT: Salary expense grouped by department
  const salaryByDept = new Map<string, number>();
  for (const e of entries) {
    const dept = e.employee.department ?? "General";
    salaryByDept.set(dept, (salaryByDept.get(dept) ?? 0) + e.gross_salary);
  }
  for (const [dept, amount] of salaryByDept) {
    lines.push({
      account: SV_ACCOUNTS.salaryExpense,
      description: `Salarios ${dept}`,
      debit: round2(amount),
      credit: 0,
      contactName: "",
      branchName: dept,
    });
  }

  // 2. CREDIT: Employee deductions
  let totalIsss = 0, totalAfp = 0, totalIsr = 0;
  for (const e of entries) {
    totalIsss += e.deductions["ISSS"] ?? 0;
    totalAfp += e.deductions["AFP"] ?? 0;
    totalIsr += e.deductions["ISR"] ?? 0;
  }
  if (round2(totalIsss) > 0) {
    lines.push({ account: SV_ACCOUNTS.isssPayable, description: "ISSS empleado", debit: 0, credit: round2(totalIsss), contactName: "", branchName: "" });
  }
  if (round2(totalAfp) > 0) {
    lines.push({ account: SV_ACCOUNTS.afpPayable, description: "AFP empleado", debit: 0, credit: round2(totalAfp), contactName: "", branchName: "" });
  }
  if (round2(totalIsr) > 0) {
    lines.push({ account: SV_ACCOUNTS.isrPayable, description: "ISR empleado", debit: 0, credit: round2(totalIsr), contactName: "", branchName: "" });
  }

  // 3. CREDIT: Net pay
  const totalNet = round2(entries.reduce((s, e) => s + e.net_salary, 0));
  lines.push({ account: SV_ACCOUNTS.netPayable, description: "Sueldos netos por pagar", debit: 0, credit: totalNet, contactName: "", branchName: "" });

  // 4. Employer contributions
  let ecIsss = 0, ecAfp = 0, ecInsaforp = 0;
  for (const e of entries) {
    ecIsss += e.employer_contributions["ISSS Patronal"] ?? 0;
    ecAfp += e.employer_contributions["AFP Patronal"] ?? 0;
    ecInsaforp += e.employer_contributions["INSAFORP"] ?? 0;
  }
  const ecPairs: [number, string, string, string][] = [
    [ecIsss, SV_ACCOUNTS.isssEmployerExpense, SV_ACCOUNTS.isssEmployerPayable, "ISSS patronal"],
    [ecAfp, SV_ACCOUNTS.afpEmployerExpense, SV_ACCOUNTS.afpEmployerPayable, "AFP patronal"],
    [ecInsaforp, SV_ACCOUNTS.insaforpExpense, SV_ACCOUNTS.insaforpPayable, "INSAFORP"],
  ];
  for (const [amount, debitAcc, creditAcc, label] of ecPairs) {
    const rounded = round2(amount);
    if (rounded > 0) {
      lines.push({ account: debitAcc, description: label, debit: rounded, credit: 0, contactName: "", branchName: "" });
      lines.push({ account: creditAcc, description: `${label} por pagar`, debit: 0, credit: rounded, contactName: "", branchName: "" });
    }
  }

  // 5. Provisions
  let provAguinaldo = 0, provVacaciones = 0;
  for (const e of entries) {
    provAguinaldo += e.provisions["Aguinaldo"] ?? 0;
    provVacaciones += e.provisions["Vacaciones"] ?? 0;
  }
  const provPairs: [number, string, string, string][] = [
    [provAguinaldo, SV_ACCOUNTS.aguinaldoExpense, SV_ACCOUNTS.aguinaldoPayable, "Aguinaldo"],
    [provVacaciones, SV_ACCOUNTS.vacacionesExpense, SV_ACCOUNTS.vacacionesPayable, "Vacaciones"],
  ];
  for (const [amount, debitAcc, creditAcc, label] of provPairs) {
    const rounded = round2(amount);
    if (rounded > 0) {
      lines.push({ account: debitAcc, description: `Provisión ${label}`, debit: rounded, credit: 0, contactName: "", branchName: "" });
      lines.push({ account: creditAcc, description: `Provisión ${label} por pagar`, debit: 0, credit: rounded, contactName: "", branchName: "" });
    }
  }

  return lines;
}

export function generateZohoJournalCSV(
  entries: EmployeePayrollPreview[],
  config: ZohoJournalConfig,
  country: string
): string {
  const journalLines = country === "SV"
    ? buildElSalvadorLines(entries, config)
    : buildHondurasLines(entries, config);

  const formattedDate = formatDate(config.journalDate);

  const rows: string[] = [CSV_HEADERS.join(",")];

  for (const line of journalLines) {
    const row = [
      formattedDate,
      escapeCsvField(config.referenceNumber),
      "", // Journal Number Prefix
      "", // Journal Number Suffix
      escapeCsvField(config.notes),
      "", // Journal Type
      config.currency,
      escapeCsvField(line.account),
      escapeCsvField(line.description),
      escapeCsvField(line.contactName),
      fmtAmount(line.debit),
      fmtAmount(line.credit),
      "Draft",
      "1",
      escapeCsvField(line.branchName),
    ];
    rows.push(row.join(","));
  }

  return rows.join("\n");
}
