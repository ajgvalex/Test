import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

// ============================================================================
// Types
// ============================================================================

export interface PayslipData {
  // Company
  companyName: string;
  companyLegalName: string;
  companyTaxId: string;
  companyAddress: string;
  // Employee
  employeeName: string;
  employeeCode: string;
  identityNumber: string;
  position: string;
  department: string;
  hireDate: string;
  paymentMethod: string;
  bankName: string;
  bankAccount: string;
  // Period
  periodName: string;
  startDate: string;
  endDate: string;
  paymentDate: string;
  // Earnings
  baseSalary: number;
  overtimeHours: number;
  overtimeAmount: number;
  bonuses: number;
  commissions: number;
  otherEarnings: number;
  grossSalary: number;
  // Deductions (keyed by label)
  deductions: Record<string, number>;
  totalDeductions: number;
  // Net
  netSalary: number;
  // Currency
  currencySymbol: string;
}

// ============================================================================
// Styles
// ============================================================================

const colors = {
  primary: "#1a1a2e",
  accent: "#16213e",
  border: "#d1d5db",
  lightBg: "#f3f4f6",
  text: "#111827",
  muted: "#6b7280",
  white: "#ffffff",
};

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: colors.text,
  },
  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    borderBottom: `2px solid ${colors.primary}`,
    paddingBottom: 12,
  },
  companyName: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: colors.primary,
  },
  companyDetail: {
    fontSize: 8,
    color: colors.muted,
    marginTop: 2,
  },
  receiptTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: colors.primary,
    textAlign: "right",
  },
  periodText: {
    fontSize: 9,
    color: colors.muted,
    textAlign: "right",
    marginTop: 4,
  },
  // Employee info
  employeeSection: {
    flexDirection: "row",
    backgroundColor: colors.lightBg,
    padding: 10,
    borderRadius: 4,
    marginBottom: 16,
  },
  employeeCol: {
    flex: 1,
  },
  labelText: {
    fontSize: 7,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  valueText: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
  },
  // Tables
  tableHeader: {
    flexDirection: "row",
    backgroundColor: colors.primary,
    color: colors.white,
    padding: 6,
    borderRadius: 2,
    marginBottom: 1,
  },
  tableHeaderText: {
    color: colors.white,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    padding: 5,
    borderBottom: `0.5px solid ${colors.border}`,
  },
  tableRowAlt: {
    flexDirection: "row",
    padding: 5,
    borderBottom: `0.5px solid ${colors.border}`,
    backgroundColor: colors.lightBg,
  },
  colConcept: { flex: 3 },
  colAmount: { flex: 1, textAlign: "right" },
  // Totals
  totalRow: {
    flexDirection: "row",
    padding: 6,
    backgroundColor: colors.lightBg,
    borderRadius: 2,
    marginTop: 2,
  },
  totalLabel: {
    flex: 3,
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  totalAmount: {
    flex: 1,
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  // Net pay
  netPayBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: colors.primary,
    color: colors.white,
    padding: 12,
    borderRadius: 4,
    marginTop: 16,
  },
  netPayLabel: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: colors.white,
  },
  netPayAmount: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: colors.white,
  },
  // Columns layout
  columnsContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 0,
  },
  column: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
    color: colors.accent,
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    borderTop: `1px solid ${colors.border}`,
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 7,
    color: colors.muted,
  },
  // Signatures
  signatureSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 40,
    paddingTop: 0,
  },
  signatureBox: {
    width: "40%",
    borderTop: `1px solid ${colors.text}`,
    paddingTop: 4,
    textAlign: "center",
  },
  signatureLabel: {
    fontSize: 8,
    color: colors.muted,
  },
});

// ============================================================================
// Helpers
// ============================================================================

function fmt(amount: number, symbol: string): string {
  return `${symbol} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("es-HN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ============================================================================
// Payslip Document Component
// ============================================================================

export function PayslipDocument({ data }: { data: PayslipData }) {
  const sym = data.currencySymbol;

  // Build earnings rows
  const earnings: { label: string; amount: number }[] = [
    { label: "Salario Base", amount: data.baseSalary },
  ];
  if (data.overtimeAmount > 0) {
    earnings.push({
      label: `Horas Extra (${data.overtimeHours}h)`,
      amount: data.overtimeAmount,
    });
  }
  if (data.bonuses > 0) earnings.push({ label: "Bonos", amount: data.bonuses });
  if (data.commissions > 0)
    earnings.push({ label: "Comisiones", amount: data.commissions });
  if (data.otherEarnings > 0)
    earnings.push({ label: "Otros Ingresos", amount: data.otherEarnings });

  const deductionEntries = Object.entries(data.deductions).filter(
    ([, v]) => v > 0
  );

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>{data.companyName}</Text>
            <Text style={styles.companyDetail}>{data.companyLegalName}</Text>
            <Text style={styles.companyDetail}>RTN: {data.companyTaxId}</Text>
            <Text style={styles.companyDetail}>{data.companyAddress}</Text>
          </View>
          <View>
            <Text style={styles.receiptTitle}>RECIBO DE PAGO</Text>
            <Text style={styles.periodText}>{data.periodName}</Text>
            <Text style={styles.periodText}>
              {formatDate(data.startDate)} - {formatDate(data.endDate)}
            </Text>
            <Text style={styles.periodText}>
              Pago: {formatDate(data.paymentDate)}
            </Text>
          </View>
        </View>

        {/* Employee info */}
        <View style={styles.employeeSection}>
          <View style={styles.employeeCol}>
            <Text style={styles.labelText}>Empleado</Text>
            <Text style={styles.valueText}>{data.employeeName}</Text>
            <Text style={styles.labelText}>Identidad</Text>
            <Text style={styles.valueText}>{data.identityNumber}</Text>
            <Text style={styles.labelText}>Fecha Ingreso</Text>
            <Text style={styles.valueText}>{formatDate(data.hireDate)}</Text>
          </View>
          <View style={styles.employeeCol}>
            <Text style={styles.labelText}>Código</Text>
            <Text style={styles.valueText}>{data.employeeCode}</Text>
            <Text style={styles.labelText}>Puesto</Text>
            <Text style={styles.valueText}>{data.position}</Text>
            <Text style={styles.labelText}>Departamento</Text>
            <Text style={styles.valueText}>{data.department}</Text>
          </View>
          <View style={styles.employeeCol}>
            <Text style={styles.labelText}>Forma de Pago</Text>
            <Text style={styles.valueText}>{data.paymentMethod}</Text>
            {data.bankName && (
              <>
                <Text style={styles.labelText}>Banco</Text>
                <Text style={styles.valueText}>{data.bankName}</Text>
              </>
            )}
            {data.bankAccount && (
              <>
                <Text style={styles.labelText}>Cuenta</Text>
                <Text style={styles.valueText}>{data.bankAccount}</Text>
              </>
            )}
          </View>
        </View>

        {/* Earnings & Deductions side by side */}
        <View style={styles.columnsContainer}>
          {/* Earnings */}
          <View style={styles.column}>
            <Text style={styles.sectionTitle}>INGRESOS</Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, styles.colConcept]}>
                Concepto
              </Text>
              <Text style={[styles.tableHeaderText, styles.colAmount]}>
                Monto
              </Text>
            </View>
            {earnings.map((e, i) => (
              <View
                key={i}
                style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}
              >
                <Text style={styles.colConcept}>{e.label}</Text>
                <Text style={styles.colAmount}>{fmt(e.amount, sym)}</Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total Ingresos</Text>
              <Text style={styles.totalAmount}>
                {fmt(data.grossSalary, sym)}
              </Text>
            </View>
          </View>

          {/* Deductions */}
          <View style={styles.column}>
            <Text style={styles.sectionTitle}>DEDUCCIONES</Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, styles.colConcept]}>
                Concepto
              </Text>
              <Text style={[styles.tableHeaderText, styles.colAmount]}>
                Monto
              </Text>
            </View>
            {deductionEntries.map(([label, amount], i) => (
              <View
                key={label}
                style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}
              >
                <Text style={styles.colConcept}>{label}</Text>
                <Text style={styles.colAmount}>{fmt(amount, sym)}</Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total Deducciones</Text>
              <Text style={styles.totalAmount}>
                {fmt(data.totalDeductions, sym)}
              </Text>
            </View>
          </View>
        </View>

        {/* Net pay */}
        <View style={styles.netPayBox}>
          <Text style={styles.netPayLabel}>SALARIO NETO A PAGAR</Text>
          <Text style={styles.netPayAmount}>
            {fmt(data.netSalary, sym)}
          </Text>
        </View>

        {/* Signatures */}
        <View style={styles.signatureSection}>
          <View style={styles.signatureBox}>
            <Text style={styles.signatureLabel}>Firma del Empleado</Text>
          </View>
          <View style={styles.signatureBox}>
            <Text style={styles.signatureLabel}>Firma Autorizada</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {data.companyName} — Recibo de Pago
          </Text>
          <Text style={styles.footerText}>
            Generado: {new Date().toLocaleDateString("es-HN")}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

// ============================================================================
// Multi-payslip document (bulk PDF)
// ============================================================================

export function BulkPayslipDocument({ payslips }: { payslips: PayslipData[] }) {
  return (
    <Document>
      {payslips.map((data, index) => {
        const sym = data.currencySymbol;
        const earnings: { label: string; amount: number }[] = [
          { label: "Salario Base", amount: data.baseSalary },
        ];
        if (data.overtimeAmount > 0)
          earnings.push({
            label: `Horas Extra (${data.overtimeHours}h)`,
            amount: data.overtimeAmount,
          });
        if (data.bonuses > 0)
          earnings.push({ label: "Bonos", amount: data.bonuses });
        if (data.commissions > 0)
          earnings.push({ label: "Comisiones", amount: data.commissions });
        if (data.otherEarnings > 0)
          earnings.push({ label: "Otros Ingresos", amount: data.otherEarnings });
        const deductionEntries = Object.entries(data.deductions).filter(
          ([, v]) => v > 0
        );

        return (
          <Page key={index} size="LETTER" style={styles.page}>
            <View style={styles.header}>
              <View>
                <Text style={styles.companyName}>{data.companyName}</Text>
                <Text style={styles.companyDetail}>
                  {data.companyLegalName}
                </Text>
                <Text style={styles.companyDetail}>
                  RTN: {data.companyTaxId}
                </Text>
                <Text style={styles.companyDetail}>{data.companyAddress}</Text>
              </View>
              <View>
                <Text style={styles.receiptTitle}>RECIBO DE PAGO</Text>
                <Text style={styles.periodText}>{data.periodName}</Text>
                <Text style={styles.periodText}>
                  {formatDate(data.startDate)} - {formatDate(data.endDate)}
                </Text>
              </View>
            </View>

            <View style={styles.employeeSection}>
              <View style={styles.employeeCol}>
                <Text style={styles.labelText}>Empleado</Text>
                <Text style={styles.valueText}>{data.employeeName}</Text>
                <Text style={styles.labelText}>Identidad</Text>
                <Text style={styles.valueText}>{data.identityNumber}</Text>
              </View>
              <View style={styles.employeeCol}>
                <Text style={styles.labelText}>Código</Text>
                <Text style={styles.valueText}>{data.employeeCode}</Text>
                <Text style={styles.labelText}>Puesto</Text>
                <Text style={styles.valueText}>{data.position}</Text>
              </View>
              <View style={styles.employeeCol}>
                <Text style={styles.labelText}>Departamento</Text>
                <Text style={styles.valueText}>{data.department}</Text>
                <Text style={styles.labelText}>Forma de Pago</Text>
                <Text style={styles.valueText}>{data.paymentMethod}</Text>
              </View>
            </View>

            <View style={styles.columnsContainer}>
              <View style={styles.column}>
                <Text style={styles.sectionTitle}>INGRESOS</Text>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHeaderText, styles.colConcept]}>
                    Concepto
                  </Text>
                  <Text style={[styles.tableHeaderText, styles.colAmount]}>
                    Monto
                  </Text>
                </View>
                {earnings.map((e, i) => (
                  <View
                    key={i}
                    style={
                      i % 2 === 0 ? styles.tableRow : styles.tableRowAlt
                    }
                  >
                    <Text style={styles.colConcept}>{e.label}</Text>
                    <Text style={styles.colAmount}>
                      {fmt(e.amount, sym)}
                    </Text>
                  </View>
                ))}
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total Ingresos</Text>
                  <Text style={styles.totalAmount}>
                    {fmt(data.grossSalary, sym)}
                  </Text>
                </View>
              </View>
              <View style={styles.column}>
                <Text style={styles.sectionTitle}>DEDUCCIONES</Text>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHeaderText, styles.colConcept]}>
                    Concepto
                  </Text>
                  <Text style={[styles.tableHeaderText, styles.colAmount]}>
                    Monto
                  </Text>
                </View>
                {deductionEntries.map(([label, amount], i) => (
                  <View
                    key={label}
                    style={
                      i % 2 === 0 ? styles.tableRow : styles.tableRowAlt
                    }
                  >
                    <Text style={styles.colConcept}>{label}</Text>
                    <Text style={styles.colAmount}>
                      {fmt(amount, sym)}
                    </Text>
                  </View>
                ))}
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total Deducciones</Text>
                  <Text style={styles.totalAmount}>
                    {fmt(data.totalDeductions, sym)}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.netPayBox}>
              <Text style={styles.netPayLabel}>SALARIO NETO A PAGAR</Text>
              <Text style={styles.netPayAmount}>
                {fmt(data.netSalary, sym)}
              </Text>
            </View>

            <View style={styles.signatureSection}>
              <View style={styles.signatureBox}>
                <Text style={styles.signatureLabel}>Firma del Empleado</Text>
              </View>
              <View style={styles.signatureBox}>
                <Text style={styles.signatureLabel}>Firma Autorizada</Text>
              </View>
            </View>

            <View style={styles.footer} fixed>
              <Text style={styles.footerText}>
                {data.companyName} — Recibo de Pago
              </Text>
              <Text style={styles.footerText}>
                Pág. {index + 1} de {payslips.length}
              </Text>
            </View>
          </Page>
        );
      })}
    </Document>
  );
}
