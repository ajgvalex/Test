-- ============================================================================
-- SEED DATA: Deduction rules for Honduras (IHSS) and El Salvador (ISSS/AFP)
-- ============================================================================
-- This seed creates a demo company per country and inserts the statutory
-- social security contribution rates as deduction_rules.
--
-- NOTE: Run this AFTER all migrations. Uses deterministic UUIDs so it can
--       be re-run idempotently with ON CONFLICT.
-- ============================================================================

-- ============================================================================
-- 1. Demo companies
-- ============================================================================

INSERT INTO public.companies (id, name, legal_name, tax_id, country, currency)
VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    'Demo Honduras S.A.',
    'Demo Honduras Sociedad Anónima',
    'RTN-0801-1999-00001',
    'HN',
    'HNL'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'Demo El Salvador S.A. de C.V.',
    'Demo El Salvador Sociedad Anónima de Capital Variable',
    'NIT-0614-010199-101-0',
    'SV',
    'USD'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. HONDURAS — IHSS Rates
-- ============================================================================
-- IHSS Enfermedad-Maternidad (EM):
--   Empleado: 2.5%   |  Patrono: 5%    |  Techo: L 11,290.28/mes
-- IHSS Invalidez, Vejez y Muerte (IVM):
--   Empleado: 2.5%   |  Patrono: 4%    |  Techo: L 11,290.28/mes
-- RAP (Régimen de Aportaciones Privadas):
--   Empleado: 1.5%   |  Patrono: 1.5%  |  Sin techo
-- INFOP (Instituto de Formación Profesional):
--   Patrono: 1%                          |  Sin techo
-- ============================================================================

INSERT INTO public.deduction_rules
  (id, company_id, country, code, name, description,
   deduction_type, calculation_method, party,
   employee_rate, employer_rate, salary_cap, is_mandatory, sort_order)
VALUES
  -- IHSS Enfermedad-Maternidad
  (
    'a0000001-0001-0001-0001-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'HN',
    'ihss_em',
    'IHSS Enfermedad y Maternidad',
    'Seguro de enfermedad y maternidad del IHSS. Techo salarial L 11,290.28',
    'social_security', 'percentage', 'both',
    2.5000, 5.0000, 11290.28,
    TRUE, 1
  ),
  -- IHSS Invalidez, Vejez y Muerte
  (
    'a0000001-0001-0001-0001-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'HN',
    'ihss_ivm',
    'IHSS Invalidez, Vejez y Muerte',
    'Seguro IVM del IHSS. Techo salarial L 11,290.28',
    'social_security', 'percentage', 'both',
    2.5000, 4.0000, 11290.28,
    TRUE, 2
  ),
  -- RAP
  (
    'a0000001-0001-0001-0001-000000000003',
    '11111111-1111-1111-1111-111111111111',
    'HN',
    'rap',
    'RAP (Régimen de Aportaciones Privadas)',
    'Aportaciones privadas obligatorias. Sin techo salarial.',
    'pension', 'percentage', 'both',
    1.5000, 1.5000, NULL,
    TRUE, 3
  ),
  -- INFOP (solo patrono)
  (
    'a0000001-0001-0001-0001-000000000004',
    '11111111-1111-1111-1111-111111111111',
    'HN',
    'infop',
    'INFOP (Instituto de Formación Profesional)',
    'Contribución patronal a formación profesional.',
    'other', 'percentage', 'employer',
    0.0000, 1.0000, NULL,
    TRUE, 4
  ),
  -- ISR Honduras (tiered)
  (
    'a0000001-0001-0001-0001-000000000005',
    '11111111-1111-1111-1111-111111111111',
    'HN',
    'isr',
    'ISR (Impuesto Sobre la Renta)',
    'Impuesto sobre la renta progresivo. Tramos anuales.',
    'income_tax', 'tiered', 'employee',
    0.0000, 0.0000, NULL,
    TRUE, 5
  )
ON CONFLICT (company_id, country, code) DO UPDATE SET
  name = EXCLUDED.name,
  employee_rate = EXCLUDED.employee_rate,
  employer_rate = EXCLUDED.employer_rate,
  salary_cap = EXCLUDED.salary_cap,
  updated_at = now();

-- ISR Honduras tiers (annual income brackets 2024)
UPDATE public.deduction_rules
SET tiers = '[
  {"from": 0,       "to": 197985.20, "rate": 0.00,  "fixed": 0},
  {"from": 197985.21, "to": 302041.07, "rate": 0.15, "fixed": 0},
  {"from": 302041.08, "to": 704695.89, "rate": 0.20, "fixed": 15608.38},
  {"from": 704695.90, "to": null,      "rate": 0.25, "fixed": 96139.34}
]'::JSONB
WHERE id = 'a0000001-0001-0001-0001-000000000005';

-- ============================================================================
-- 3. EL SALVADOR — ISSS / AFP Rates
-- ============================================================================
-- ISSS (Instituto Salvadoreño del Seguro Social):
--   Empleado: 3%     |  Patrono: 7.5%  |  Techo: $1,000.00/mes
-- AFP (Administradora de Fondos de Pensiones):
--   Empleado: 7.25%  |  Patrono: 8.75% |  Sin techo
-- ISR El Salvador (tiered)
-- ============================================================================

INSERT INTO public.deduction_rules
  (id, company_id, country, code, name, description,
   deduction_type, calculation_method, party,
   employee_rate, employer_rate, salary_cap, is_mandatory, sort_order)
VALUES
  -- ISSS
  (
    'b0000002-0002-0002-0002-000000000001',
    '22222222-2222-2222-2222-222222222222',
    'SV',
    'isss',
    'ISSS (Seguro Social)',
    'Instituto Salvadoreño del Seguro Social. Techo $1,000.00',
    'social_security', 'percentage', 'both',
    3.0000, 7.5000, 1000.00,
    TRUE, 1
  ),
  -- AFP
  (
    'b0000002-0002-0002-0002-000000000002',
    '22222222-2222-2222-2222-222222222222',
    'SV',
    'afp',
    'AFP (Fondo de Pensiones)',
    'Administradora de Fondos de Pensiones. Sin techo salarial.',
    'pension', 'percentage', 'both',
    7.2500, 8.7500, NULL,
    TRUE, 2
  ),
  -- ISR El Salvador (tiered)
  (
    'b0000002-0002-0002-0002-000000000003',
    '22222222-2222-2222-2222-222222222222',
    'SV',
    'isr',
    'ISR (Impuesto Sobre la Renta)',
    'Impuesto sobre la renta progresivo. Tramos mensuales.',
    'income_tax', 'tiered', 'employee',
    0.0000, 0.0000, NULL,
    TRUE, 3
  )
ON CONFLICT (company_id, country, code) DO UPDATE SET
  name = EXCLUDED.name,
  employee_rate = EXCLUDED.employee_rate,
  employer_rate = EXCLUDED.employer_rate,
  salary_cap = EXCLUDED.salary_cap,
  updated_at = now();

-- ISR El Salvador tiers (monthly brackets)
UPDATE public.deduction_rules
SET tiers = '[
  {"from": 0.01,   "to": 472.00,   "rate": 0.00,  "fixed": 0,      "excess_over": 0},
  {"from": 472.01, "to": 895.24,   "rate": 0.10,  "fixed": 17.67,  "excess_over": 472.00},
  {"from": 895.25, "to": 2038.10,  "rate": 0.20,  "fixed": 60.00,  "excess_over": 895.24},
  {"from": 2038.11, "to": null,    "rate": 0.30,  "fixed": 288.57, "excess_over": 2038.10}
]'::JSONB
WHERE id = 'b0000002-0002-0002-0002-000000000003';

-- ============================================================================
-- 4. HONDURAS — Benefit provisions (aguinaldo, 14to mes, vacaciones)
-- ============================================================================

INSERT INTO public.benefit_provisions
  (id, company_id, country, code, name, description,
   benefit_type, calculation_method, frequency, rate, days_entitled, sort_order)
VALUES
  (
    'c0000001-0001-0001-0001-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'HN',
    'aguinaldo',
    'Décimo Tercer Mes (Aguinaldo)',
    'Un mes de salario pagado en diciembre. Provisión mensual = salario / 12.',
    'aguinaldo', 'percentage', 'per_payroll',
    8.3333, 30, 1
  ),
  (
    'c0000001-0001-0001-0001-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'HN',
    'catorce',
    'Décimo Cuarto Mes',
    'Un mes de salario pagado en junio. Provisión mensual = salario / 12.',
    'christmas_bonus', 'percentage', 'per_payroll',
    8.3333, 30, 2
  ),
  (
    'c0000001-0001-0001-0001-000000000003',
    '11111111-1111-1111-1111-111111111111',
    'HN',
    'vacaciones',
    'Vacaciones',
    'Después de 1 año: 10 días hábiles + 30% recargo. Escala por antigüedad.',
    'vacation', 'percentage', 'per_payroll',
    0.0000, 10, 3
  )
ON CONFLICT (company_id, country, code) DO NOTHING;

-- Vacation scale Honduras
UPDATE public.benefit_provisions
SET rules = '[
  {"min_years": 1, "max_years": 2, "days": 10},
  {"min_years": 2, "max_years": 3, "days": 12},
  {"min_years": 3, "max_years": 4, "days": 15},
  {"min_years": 4, "max_years": null, "days": 20}
]'::JSONB
WHERE id = 'c0000001-0001-0001-0001-000000000003';

-- ============================================================================
-- 5. EL SALVADOR — Benefit provisions (aguinaldo, vacaciones)
-- ============================================================================

INSERT INTO public.benefit_provisions
  (id, company_id, country, code, name, description,
   benefit_type, calculation_method, frequency, rate, days_entitled, sort_order)
VALUES
  (
    'c0000002-0002-0002-0002-000000000001',
    '22222222-2222-2222-2222-222222222222',
    'SV',
    'aguinaldo',
    'Aguinaldo',
    'Pago de aguinaldo según antigüedad. 15-21 días de salario.',
    'aguinaldo', 'percentage', 'per_payroll',
    0.0000, 15, 1
  ),
  (
    'c0000002-0002-0002-0002-000000000002',
    '22222222-2222-2222-2222-222222222222',
    'SV',
    'vacaciones',
    'Vacaciones',
    '15 días de salario + 30% de recargo después de 1 año.',
    'vacation', 'percentage', 'per_payroll',
    0.0000, 15, 2
  )
ON CONFLICT (company_id, country, code) DO NOTHING;

-- Aguinaldo scale El Salvador
UPDATE public.benefit_provisions
SET rules = '[
  {"min_years": 1, "max_years": 3,    "days": 15},
  {"min_years": 3, "max_years": 10,   "days": 19},
  {"min_years": 10, "max_years": null, "days": 21}
]'::JSONB
WHERE id = 'c0000002-0002-0002-0002-000000000001';
