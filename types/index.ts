// ============================================================================
// Database enums
// ============================================================================

export type CountryCode = "HN" | "SV" | "GT" | "NI" | "CR" | "PA";

export type EmployeeStatus = "active" | "inactive" | "on_leave" | "terminated";

export type PaymentMethod = "bank_transfer" | "check" | "cash";

export type PayrollFrequency =
  | "weekly"
  | "biweekly"
  | "semimonthly"
  | "monthly";

export type PeriodStatus =
  | "draft"
  | "calculating"
  | "review"
  | "approved"
  | "paid"
  | "voided";

export type DeductionType =
  | "social_security"
  | "income_tax"
  | "pension"
  | "loan"
  | "union"
  | "other";

export type CalculationMethod =
  | "percentage"
  | "fixed_amount"
  | "tiered"
  | "formula";

export type ContributionParty = "employee" | "employer" | "both";

export type BenefitType =
  | "aguinaldo"
  | "vacation"
  | "severance"
  | "christmas_bonus"
  | "education"
  | "seniority"
  | "transportation"
  | "food"
  | "health_insurance"
  | "life_insurance"
  | "other";

export type ProvisionFrequency =
  | "per_payroll"
  | "monthly"
  | "quarterly"
  | "annually";

export type SeparationReason =
  | "voluntary_resignation"
  | "termination_just_cause"
  | "termination_no_cause"
  | "mutual_agreement"
  | "contract_end"
  | "retirement"
  | "death";

export type SeparationStatus =
  | "draft"
  | "calculated"
  | "approved"
  | "paid"
  | "voided";

// ============================================================================
// Database models
// ============================================================================

export interface Company {
  id: string;
  name: string;
  legal_name: string;
  tax_id: string;
  country: CountryCode;
  currency: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  settings: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: string;
  company_id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  identity_number: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  hire_date: string;
  termination_date: string | null;
  department: string | null;
  position: string;
  base_salary: number;
  payment_method: PaymentMethod;
  bank_name: string | null;
  bank_account: string | null;
  status: EmployeeStatus;
  country: CountryCode;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PayrollPeriod {
  id: string;
  company_id: string;
  name: string;
  frequency: PayrollFrequency;
  start_date: string;
  end_date: string;
  payment_date: string;
  status: PeriodStatus;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  employee_count: number;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayrollEntry {
  id: string;
  company_id: string;
  payroll_period_id: string;
  employee_id: string;
  base_salary: number;
  overtime_hours: number;
  overtime_amount: number;
  bonuses: number;
  commissions: number;
  other_earnings: number;
  gross_salary: number;
  deductions: Record<string, number>;
  total_deductions: number;
  benefits: Record<string, number>;
  total_benefits: number;
  net_salary: number;
  days_worked: number;
  is_adjustment: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeductionRule {
  id: string;
  company_id: string;
  country: CountryCode;
  code: string;
  name: string;
  description: string | null;
  deduction_type: DeductionType;
  calculation_method: CalculationMethod;
  party: ContributionParty;
  employee_rate: number;
  employer_rate: number;
  fixed_amount: number;
  salary_cap: number | null;
  min_amount: number | null;
  max_amount: number | null;
  tiers: TaxTier[] | null;
  is_mandatory: boolean;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TaxTier {
  from: number;
  to: number | null;
  rate: number;
  fixed: number;
  excess_over?: number;
}

export interface BenefitProvision {
  id: string;
  company_id: string;
  country: CountryCode;
  code: string;
  name: string;
  description: string | null;
  benefit_type: BenefitType;
  calculation_method: CalculationMethod;
  frequency: ProvisionFrequency;
  rate: number;
  fixed_amount: number;
  days_entitled: number | null;
  rules: VacationScale[] | null;
  is_provisioned: boolean;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface VacationScale {
  min_years: number;
  max_years: number | null;
  days: number;
}

export interface SeparationCalculation {
  id: string;
  company_id: string;
  employee_id: string;
  separation_date: string;
  reason: SeparationReason;
  status: SeparationStatus;
  years_of_service: number;
  months_of_service: number;
  days_of_service: number;
  last_salary: number;
  average_salary: number;
  severance_pay: number;
  preaviso: number;
  cesantia: number;
  pending_vacation: number;
  proportional_aguinaldo: number;
  proportional_14th: number;
  other_payments: number;
  pending_loans: number;
  other_deductions: number;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  calculation_details: Record<string, unknown>;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}
