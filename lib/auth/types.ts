export type UserRole = "super_admin" | "platform_admin" | "company_user";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  /** Currently active company (null before selecting for super_admin) */
  company_id: string | null;
  company_name: string | null;
  company_country: string | null;
}

export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  /** Switch active company — only available for super_admin */
  switchCompany: (companyId: string) => void;
}
