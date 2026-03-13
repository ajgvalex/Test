-- ============================================================================
-- Migration 004: Payroll entries (per-employee per-period)
-- JSONB columns for flexible deductions and benefits per country
-- ============================================================================

CREATE TABLE public.payroll_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payroll_period_id UUID NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  employee_id       UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,

  -- Earnings
  base_salary       NUMERIC(12,2) NOT NULL CHECK (base_salary >= 0),
  overtime_hours    NUMERIC(6,2) NOT NULL DEFAULT 0,
  overtime_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  bonuses           NUMERIC(12,2) NOT NULL DEFAULT 0,
  commissions       NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_earnings    NUMERIC(12,2) NOT NULL DEFAULT 0,
  gross_salary      NUMERIC(12,2) NOT NULL CHECK (gross_salary >= 0),

  -- Deductions (JSONB for country-specific flexibility)
  -- Example HN: {"ihss_em": 87.50, "isr": 0, "rap_em": 150.00}
  -- Example SV: {"isss_em": 105.00, "afp_em": 253.75, "isr": 0}
  deductions        JSONB NOT NULL DEFAULT '{}',
  total_deductions  NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Benefits / employer contributions (JSONB)
  -- Example HN: {"ihss_pa": 175.00, "rap_pa": 150.00, "infop": 50.00}
  -- Example SV: {"isss_pa": 262.50, "afp_pa": 306.25}
  benefits          JSONB NOT NULL DEFAULT '{}',
  total_benefits    NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Net
  net_salary        NUMERIC(12,2) NOT NULL CHECK (net_salary >= 0),

  -- Metadata
  days_worked       INTEGER NOT NULL DEFAULT 0,
  is_adjustment     BOOLEAN NOT NULL DEFAULT FALSE,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_entry_period_employee UNIQUE (payroll_period_id, employee_id)
);

-- Indexes
CREATE INDEX idx_payroll_entries_company ON public.payroll_entries (company_id);
CREATE INDEX idx_payroll_entries_period ON public.payroll_entries (payroll_period_id);
CREATE INDEX idx_payroll_entries_employee ON public.payroll_entries (employee_id);
CREATE INDEX idx_payroll_entries_deductions ON public.payroll_entries USING GIN (deductions);
CREATE INDEX idx_payroll_entries_benefits ON public.payroll_entries USING GIN (benefits);

-- RLS
ALTER TABLE public.payroll_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view payroll entries of their company"
  ON public.payroll_entries FOR SELECT
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Users can insert payroll entries for their company"
  ON public.payroll_entries FOR INSERT
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "Users can update payroll entries of their company"
  ON public.payroll_entries FOR UPDATE
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Users can delete payroll entries of their company"
  ON public.payroll_entries FOR DELETE
  USING (company_id = public.get_user_company_id());

CREATE TRIGGER set_payroll_entries_updated_at
  BEFORE UPDATE ON public.payroll_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
