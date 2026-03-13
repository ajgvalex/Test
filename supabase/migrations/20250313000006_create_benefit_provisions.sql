-- ============================================================================
-- Migration 006: Benefit provisions (aguinaldo, vacaciones, prestaciones)
-- ============================================================================

CREATE TYPE public.benefit_type AS ENUM (
  'aguinaldo',        -- 13th/14th month
  'vacation',         -- vacation pay
  'severance',        -- indemnización / cesantía
  'christmas_bonus',  -- bono navideño
  'education',        -- bono educativo
  'seniority',        -- antigüedad
  'transportation',   -- subsidio transporte
  'food',             -- subsidio alimentación
  'health_insurance', -- seguro médico privado
  'life_insurance',   -- seguro de vida
  'other'
);

CREATE TYPE public.provision_frequency AS ENUM (
  'per_payroll', 'monthly', 'quarterly', 'annually'
);

CREATE TABLE public.benefit_provisions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  country             public.country_code NOT NULL,
  code                TEXT NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT,
  benefit_type        public.benefit_type NOT NULL,
  calculation_method  public.calculation_method NOT NULL DEFAULT 'percentage',
  frequency           public.provision_frequency NOT NULL DEFAULT 'per_payroll',

  -- Calculation config
  rate                NUMERIC(8,4) NOT NULL DEFAULT 0,
  fixed_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  days_entitled       INTEGER,  -- e.g. 30 days aguinaldo, 10-20 days vacation

  -- Rules (JSONB for seniority-based scales, etc.)
  -- Example vacation scale: [{"min_years": 1, "max_years": 2, "days": 10}, ...]
  rules               JSONB,

  is_provisioned      BOOLEAN NOT NULL DEFAULT TRUE,  -- accrue per period?
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from      DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to        DATE,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_benefit_provision_code UNIQUE (company_id, country, code)
);

-- Indexes
CREATE INDEX idx_benefit_provisions_company ON public.benefit_provisions (company_id);
CREATE INDEX idx_benefit_provisions_country ON public.benefit_provisions (company_id, country);

-- RLS
ALTER TABLE public.benefit_provisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view benefit provisions of their company"
  ON public.benefit_provisions FOR SELECT
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Users can insert benefit provisions for their company"
  ON public.benefit_provisions FOR INSERT
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "Users can update benefit provisions of their company"
  ON public.benefit_provisions FOR UPDATE
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Users can delete benefit provisions of their company"
  ON public.benefit_provisions FOR DELETE
  USING (company_id = public.get_user_company_id());

CREATE TRIGGER set_benefit_provisions_updated_at
  BEFORE UPDATE ON public.benefit_provisions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
