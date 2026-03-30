import type { UserRole } from "./types";

export interface MockCompany {
  id: string;
  name: string;
  legal_name: string;
  country: string;
  currency: string;
}

export const MOCK_COMPANIES: Record<string, MockCompany> = {
  "11111111-1111-1111-1111-111111111111": {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Cremini Test",
    legal_name: "Cremini Test S.A.",
    country: "HN",
    currency: "HNL",
  },
  "22222222-2222-2222-2222-222222222222": {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Meraki Test",
    legal_name: "Meraki Test S.A.",
    country: "HN",
    currency: "HNL",
  },
};

export interface MockUser {
  id: string;
  email: string;
  password: string;
  role: UserRole;
  /** null for super_admin (they select a company after login) */
  company_id: string | null;
}

export const MOCK_USERS: Record<string, MockUser> = {
  "alex.gonzales.v@outlook.com": {
    id: "aaaa0000-0000-0000-0000-000000000001",
    email: "alex.gonzales.v@outlook.com",
    password: "password123",
    role: "super_admin",
    company_id: null,
  },
  "cremini@test.com": {
    id: "aaaa1111-0000-0000-0000-000000000001",
    email: "cremini@test.com",
    password: "password123",
    role: "company_user",
    company_id: "11111111-1111-1111-1111-111111111111",
  },
  "meraki@test.com": {
    id: "aaaa2222-0000-0000-0000-000000000002",
    email: "meraki@test.com",
    password: "password123",
    role: "company_user",
    company_id: "22222222-2222-2222-2222-222222222222",
  },
};
