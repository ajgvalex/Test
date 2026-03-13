-- ============================================================================
-- Migration 007: Separation / liquidation calculations
-- ============================================================================

CREATE TYPE public.separation_reason AS ENUM (
  'voluntary_resignation',  -- renuncia voluntaria
  'termination_just_cause', -- despido con justa causa
  'termination_no_cause',   -- despido sin justa causa / injustificado
  'mutual_agreement',       -- mutuo acuerdo
  'contract_end',           -- fin de contrato
  'retirement',             -- jubilación
  'death'                   -- fallecimiento
);

CREATE TYPE public.separation_status AS ENUM (
  'draft', 'calculated', 'approved', 'paid', 'voided'
);

CREATE TABLE public.separation_calculations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id           UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,

  -- Separation details
  separation_date       DATE NOT NULL,
  reason                public.separation_reason NOT NULL,
  status                public.separation_status NOT NULL DEFAULT 'draft',

  -- Tenure
  years_of_service      NUMERIC(6,2) NOT NULL DEFAULT 0,
  months_of_service     INTEGER NOT NULL DEFAULT 0,
  days_of_service       INTEGER NOT NULL DEFAULT 0,

  -- Calculation breakdown
  last_salary           NUMERIC(12,2) NOT NULL,
  average_salary        NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Components (all NUMERIC(12,2))
  severance_pay         NUMERIC(12,2) NOT NULL DEFAULT 0,  -- preaviso + indemnización
  preaviso              NUMERIC(12,2) NOT NULL DEFAULT 0,  -- notice period pay
  cesantia              NUMERIC(12,2) NOT NULL DEFAULT 0,  -- severance indemnity
  pending_vacation      NUMERIC(12,2) NOT NULL DEFAULT 0,  -- vacation days owed
  proportional_aguinaldo NUMERIC(12,2) NOT NULL DEFAULT 0, -- proportional 13th month
  proportional_14th     NUMERIC(12,2) NOT NULL DEFAULT 0,  -- proportional 14th month (HN)
  other_payments        NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Deductions at separation
  pending_loans         NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_deductions      NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Totals
  total_gross           NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_deductions      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_net             NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Full breakdown as JSONB for audit trail
  calculation_details   JSONB NOT NULL DEFAULT '{}',

  notes                 TEXT,
  approved_by           UUID REFERENCES auth.users(id),
  approved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_separation_company ON public.separation_calculations (company_id);
CREATE INDEX idx_separation_employee ON public.separation_calculations (employee_id);
CREATE INDEX idx_separation_status ON public.separation_calculations (company_id, status);

-- RLS
ALTER TABLE public.separation_calculations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view separations of their company"
  ON public.separation_calculations FOR SELECT
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Users can insert separations for their company"
  ON public.separation_calculations FOR INSERT
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "Users can update separations of their company"
  ON public.separation_calculations FOR UPDATE
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Users can delete draft separations of their company"
  ON public.separation_calculations FOR DELETE
  USING (company_id = public.get_user_company_id() AND status = 'draft');

CREATE TRIGGER set_separation_calculations_updated_at
  BEFORE UPDATE ON public.separation_calculations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
