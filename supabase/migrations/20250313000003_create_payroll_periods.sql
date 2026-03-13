-- ============================================================================
-- Migration 003: Payroll periods
-- ============================================================================

CREATE TYPE public.payroll_frequency AS ENUM (
  'weekly', 'biweekly', 'semimonthly', 'monthly'
);

CREATE TYPE public.period_status AS ENUM (
  'draft', 'calculating', 'review', 'approved', 'paid', 'voided'
);

CREATE TABLE public.payroll_periods (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  frequency       public.payroll_frequency NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  payment_date    DATE NOT NULL,
  status          public.period_status NOT NULL DEFAULT 'draft',
  total_gross     NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_net       NUMERIC(12,2) NOT NULL DEFAULT 0,
  employee_count  INTEGER NOT NULL DEFAULT 0,
  notes           TEXT,
  approved_by     UUID REFERENCES auth.users(id),
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_period_dates CHECK (end_date >= start_date),
  CONSTRAINT chk_payment_date CHECK (payment_date >= start_date)
);

-- Indexes
CREATE INDEX idx_payroll_periods_company ON public.payroll_periods (company_id);
CREATE INDEX idx_payroll_periods_status ON public.payroll_periods (company_id, status);
CREATE INDEX idx_payroll_periods_dates ON public.payroll_periods (company_id, start_date, end_date);

-- RLS
ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view payroll periods of their company"
  ON public.payroll_periods FOR SELECT
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Users can insert payroll periods for their company"
  ON public.payroll_periods FOR INSERT
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "Users can update payroll periods of their company"
  ON public.payroll_periods FOR UPDATE
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Users can delete draft payroll periods of their company"
  ON public.payroll_periods FOR DELETE
  USING (company_id = public.get_user_company_id() AND status = 'draft');

CREATE TRIGGER set_payroll_periods_updated_at
  BEFORE UPDATE ON public.payroll_periods
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
