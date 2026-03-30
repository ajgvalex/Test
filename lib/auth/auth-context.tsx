"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { IS_MOCK_AUTH } from "./config";
import type { AuthContextValue, AuthUser } from "./types";
import { MOCK_COMPANIES, MOCK_USERS } from "./mock-users";

const COOKIE_NAME = "mock-auth-user";

const AuthContext = createContext<AuthContextValue | null>(null);

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;SameSite=Lax`;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Restore session on mount
  useEffect(() => {
    if (IS_MOCK_AUTH) {
      const raw = getCookie(COOKIE_NAME);
      if (raw) {
        try {
          setUser(JSON.parse(raw));
        } catch {
          deleteCookie(COOKIE_NAME);
        }
      }
    }
    // TODO: live Supabase mode — call supabase.auth.getUser()
    setIsLoading(false);
  }, []);

  const signIn = useCallback(
    async (
      email: string,
      password: string
    ): Promise<{ error?: string }> => {
      if (IS_MOCK_AUTH) {
        const mockUser = MOCK_USERS[email.toLowerCase()];
        if (!mockUser || mockUser.password !== password) {
          return { error: "Correo o contraseña incorrectos" };
        }

        // For super_admin, default to first company
        const companyId =
          mockUser.company_id ??
          Object.keys(MOCK_COMPANIES)[0];
        const company = MOCK_COMPANIES[companyId];

        const authUser: AuthUser = {
          id: mockUser.id,
          email: mockUser.email,
          role: mockUser.role,
          company_id: companyId,
          company_name: company?.name ?? null,
          company_country: company?.country ?? null,
        };

        setCookie(COOKIE_NAME, JSON.stringify(authUser));
        setUser(authUser);
        router.push("/");
        return {};
      }

      // TODO: live Supabase mode
      // const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: "Supabase no configurado" };
    },
    [router]
  );

  const signOut = useCallback(async () => {
    if (IS_MOCK_AUTH) {
      deleteCookie(COOKIE_NAME);
      setUser(null);
      router.push("/login");
      return;
    }
    // TODO: live Supabase mode
    // await supabase.auth.signOut();
  }, [router]);

  const switchCompany = useCallback(
    (companyId: string) => {
      if (!user || user.role !== "super_admin") return;
      const company = MOCK_COMPANIES[companyId];
      if (!company) return;

      const updated: AuthUser = {
        ...user,
        company_id: companyId,
        company_name: company.name,
        company_country: company.country,
      };
      setCookie(COOKIE_NAME, JSON.stringify(updated));
      setUser(updated);
    },
    [user]
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, signIn, signOut, switchCompany }),
    [user, isLoading, signIn, signOut, switchCompany]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
