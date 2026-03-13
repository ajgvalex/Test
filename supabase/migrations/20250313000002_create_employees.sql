-- ============================================================================
-- Migration 002: Employees table
-- ============================================================================

CREATE TYPE public.employee_status AS ENUM (
  'active', 'inactive', 'on_leave', 'terminated'
);

CREATE TYPE public.payment_method AS ENUM (
  'bank_transfer', 'check', 'cash'
);

CREATE TABLE public.employees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_code   TEXT NOT NULL,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  identity_number TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  date_of_birth   DATE,
  hire_date       DATE NOT NULL,
  termination_date DATE,
  department      TEXT,
  position        TEXT NOT NULL,
  base_salary     NUMERIC(12,2) NOT NULL CHECK (base_salary >= 0),
  payment_method  public.payment_method NOT NULL DEFAULT 'bank_transfer',
  bank_name       TEXT,
  bank_account    TEXT,
  status          public.employee_status NOT NULL DEFAULT 'active',
  country         public.country_code NOT NULL,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_employee_code_company UNIQUE (company_id, employee_code),
  CONSTRAINT uq_identity_company UNIQUE (company_id, identity_number)
);

-- Indexes
CREATE INDEX idx_employees_company ON public.employees (company_id);
CREATE INDEX idx_employees_status ON public.employees (company_id, status);
CREATE INDEX idx_employees_department ON public.employees (company_id, department);

-- RLS
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view employees of their company"
  ON public.employees FOR SELECT
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Users can insert employees to their company"
  ON public.employees FOR INSERT
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "Users can update employees of their company"
  ON public.employees FOR UPDATE
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Users can delete employees of their company"
  ON public.employees FOR DELETE
  USING (company_id = public.get_user_company_id());

CREATE TRIGGER set_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
