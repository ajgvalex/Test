"use client";

import { useState, useCallback, useTransition } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";

import type { CountryCode, PayrollPeriod, PayrollFrequency } from "@/types";
import type { Novedad } from "@/lib/mock-data";
import { MOCK_NOVEDADES } from "@/lib/mock-data";
import { useAuth } from "@/lib/auth/auth-context";
import type {
  EmployeeOverride,
  PayrollPreviewResult,
  PayrollApprovalResult,
} from "./actions/payroll-actions";
import { calculatePayrollPreview, approvePayroll } from "./actions/payroll-actions";
import { Button } from "@/components/ui/button";
import { StepPeriodSelect } from "@/components/payroll/step-period-select";
import { StepNovedades } from "@/components/payroll/step-novedades";
import { StepPreview } from "@/components/payroll/step-preview";
import { StepApprove } from "@/components/payroll/step-approve";

const STEPS = [
  { id: 1, label: "Período" },
  { id: 2, label: "Novedades" },
  { id: 3, label: "Preview" },
  { id: 4, label: "Aprobar" },
] as const;

export default function PayrollPage() {
  const { user } = useAuth();
  const companyId = user?.company_id ?? "";
  const [step, setStep] = useState(1);

  // Step 1 state
  const [country, setCountry] = useState<CountryCode | "">("");
  const [selectedPeriod, setSelectedPeriod] = useState<PayrollPeriod | null>(null);
  const [frequency, setFrequency] = useState<PayrollFrequency>("semimonthly");

  // Step 2 state
  const [novedades, setNovedades] = useState<Novedad[]>(MOCK_NOVEDADES);

  // Step 3 state
  const [preview, setPreview] = useState<PayrollPreviewResult | null>(null);
  const [overrides, setOverrides] = useState<Record<string, EmployeeOverride>>({});
  const [isCalculating, startCalculation] = useTransition();

  // Step 4 state
  const [approvalResult, setApprovalResult] = useState<PayrollApprovalResult | null>(null);
  const [isApproving, startApproval] = useTransition();

  const canAdvance = useCallback(() => {
    switch (step) {
      case 1:
        return !!country && !!selectedPeriod;
      case 2:
        return true; // Novedades are optional
      case 3:
        return !!preview;
      case 4:
        return false; // Last step
      default:
        return false;
    }
  }, [step, country, selectedPeriod, preview]);

  function handleNext() {
    if (step === 2) {
      // Trigger calculation when moving to step 3
      startCalculation(async () => {
        const result = await calculatePayrollPreview({
          period_id: selectedPeriod!.id,
          period_name: selectedPeriod!.name,
          start_date: selectedPeriod!.start_date,
          end_date: selectedPeriod!.end_date,
          country: country as CountryCode,
          company_id: companyId,
          novedades,
          overrides,
        });
        setPreview(result);
      });
      setStep(3);
    } else if (step < 4) {
      setStep(step + 1);
    }
  }

  function handleBack() {
    if (step > 1) setStep(step - 1);
  }

  function handleOverrideChange(employeeId: string, override: EmployeeOverride) {
    const newOverrides = { ...overrides, [employeeId]: override };
    setOverrides(newOverrides);

    // Recalculate preview with new overrides
    startCalculation(async () => {
      const result = await calculatePayrollPreview({
        period_id: selectedPeriod!.id,
        period_name: selectedPeriod!.name,
        start_date: selectedPeriod!.start_date,
        end_date: selectedPeriod!.end_date,
        country: country as CountryCode,
        company_id: companyId,
        novedades,
        overrides: newOverrides,
      });
      setPreview(result);
    });
  }

  function handleApprove() {
    startApproval(async () => {
      const result = await approvePayroll({
        period_id: selectedPeriod!.id,
        period_name: selectedPeriod!.name,
        start_date: selectedPeriod!.start_date,
        end_date: selectedPeriod!.end_date,
        country: country as CountryCode,
        company_id: companyId,
        novedades,
        overrides,
      });
      setApprovalResult(result);
    });
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">
          Procesamiento de Nómina
        </h1>
        <p className="text-sm text-muted-foreground">
          Wizard de 4 pasos para calcular y aprobar la nómina del período.
        </p>
      </div>

      {/* Stepper */}
      <nav className="mb-8" aria-label="Progreso">
        <ol className="flex items-center">
          {STEPS.map((s, i) => {
            const isActive = step === s.id;
            const isCompleted = step > s.id;
            return (
              <li
                key={s.id}
                className={`flex items-center ${
                  i < STEPS.length - 1 ? "flex-1" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (isCompleted && !approvalResult) setStep(s.id);
                  }}
                  disabled={!isCompleted || !!approvalResult}
                  className={`flex items-center gap-2 rounded-full transition-colors ${
                    isCompleted
                      ? "cursor-pointer text-primary"
                      : isActive
                        ? "text-primary"
                        : "text-muted-foreground"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
                      isCompleted
                        ? "bg-primary text-primary-foreground"
                        : isActive
                          ? "border-2 border-primary text-primary"
                          : "border-2 border-muted-foreground/30 text-muted-foreground"
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      s.id
                    )}
                  </span>
                  <span className="hidden text-sm font-medium sm:inline">
                    {s.label}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <div
                    className={`mx-2 h-0.5 flex-1 sm:mx-4 ${
                      isCompleted ? "bg-primary" : "bg-muted"
                    }`}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Step content */}
      <div className="mb-8">
        {step === 1 && (
          <StepPeriodSelect
            companyId={companyId}
            country={country}
            onCountryChange={setCountry}
            selectedPeriod={selectedPeriod}
            onPeriodChange={setSelectedPeriod}
            frequency={frequency}
            onFrequencyChange={setFrequency}
          />
        )}
        {step === 2 && (
          <StepNovedades
            companyId={companyId}
            novedades={novedades}
            onNovedadesChange={setNovedades}
            country={country as CountryCode}
          />
        )}
        {step === 3 && (
          <StepPreview
            preview={preview}
            loading={isCalculating}
            country={country as CountryCode}
            overrides={overrides}
            onOverrideChange={handleOverrideChange}
          />
        )}
        {step === 4 && (
          <StepApprove
            preview={preview}
            periodName={selectedPeriod?.name ?? ""}
            country={country as CountryCode}
            approving={isApproving}
            result={approvalResult}
            onApprove={handleApprove}
          />
        )}
      </div>

      {/* Navigation buttons */}
      {!approvalResult && (
        <div className="flex items-center justify-between border-t pt-6">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={step === 1}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Anterior
          </Button>

          {step < 4 && (
            <Button onClick={handleNext} disabled={!canAdvance()}>
              Siguiente
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
