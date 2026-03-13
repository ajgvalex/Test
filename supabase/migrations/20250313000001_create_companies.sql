-- ============================================================================
-- Migration 001: Companies table (multi-tenant root)
-- ============================================================================

-- Helper function: extract company_id from JWT claims
CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'company_id')::UUID;
$$;

-- Countries enum for multi-country support
CREATE TYPE public.country_code AS ENUM ('HN', 'SV', 'GT', 'NI', 'CR', 'PA');

CREATE TABLE public.companies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  legal_name    TEXT NOT NULL,
  tax_id        TEXT NOT NULL,
  country       public.country_code NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'USD',
  address       TEXT,
  phone         TEXT,
  email         TEXT,
  settings      JSONB NOT NULL DEFAULT '{}',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_companies_country ON public.companies (country);

-- RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own company"
  ON public.companies FOR SELECT
  USING (id = public.get_user_company_id());

CREATE POLICY "Users can update their own company"
  ON public.companies FOR UPDATE
  USING (id = public.get_user_company_id());

-- Updated_at trigger function (reused across tables)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
