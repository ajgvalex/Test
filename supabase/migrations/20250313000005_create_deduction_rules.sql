-- ============================================================================
-- Migration 005: Deduction rules (country-specific tax/social security rates)
-- ============================================================================

CREATE TYPE public.deduction_type AS ENUM (
  'social_security', 'income_tax', 'pension', 'loan', 'union', 'other'
);

CREATE TYPE public.calculation_method AS ENUM (
  'percentage', 'fixed_amount', 'tiered', 'formula'
);

CREATE TYPE public.contribution_party AS ENUM (
  'employee', 'employer', 'both'
);

CREATE TABLE public.deduction_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  country             public.country_code NOT NULL,
  code                TEXT NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT,
  deduction_type      public.deduction_type NOT NULL,
  calculation_method  public.calculation_method NOT NULL DEFAULT 'percentage',
  party               public.contribution_party NOT NULL,

  -- Rate configuration
  employee_rate       NUMERIC(8,4) NOT NULL DEFAULT 0,
  employer_rate       NUMERIC(8,4) NOT NULL DEFAULT 0,
  fixed_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Caps / limits
  salary_cap          NUMERIC(12,2),  -- max salary subject to deduction
  min_amount          NUMERIC(12,2),  -- minimum deduction amount
  max_amount          NUMERIC(12,2),  -- maximum deduction amount

  -- Tiered / formula rules (JSONB for complex logic)
  -- Example tiered ISR: [{"from": 0, "to": 171000, "rate": 0}, {"from": 171001, "to": 400000, "rate": 0.15}]
  tiers               JSONB,

  is_mandatory        BOOLEAN NOT NULL DEFAULT TRUE,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from      DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to        DATE,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_deduction_rule_code UNIQUE (company_id, country, code)
);

-- Indexes
CREATE INDEX idx_deduction_rules_company ON public.deduction_rules (company_id);
CREATE INDEX idx_deduction_rules_country ON public.deduction_rules (company_id, country);
CREATE INDEX idx_deduction_rules_active ON public.deduction_rules (company_id, country, is_active);

-- RLS
ALTER TABLE public.deduction_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view deduction rules of their company"
  ON public.deduction_rules FOR SELECT
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Users can insert deduction rules for their company"
  ON public.deduction_rules FOR INSERT
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "Users can update deduction rules of their company"
  ON public.deduction_rules FOR UPDATE
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Users can delete deduction rules of their company"
  ON public.deduction_rules FOR DELETE
  USING (company_id = public.get_user_company_id());

CREATE TRIGGER set_deduction_rules_updated_at
  BEFORE UPDATE ON public.deduction_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
