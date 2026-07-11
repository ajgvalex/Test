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
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import { IS_MOCK_AUTH } from "./config";
import type { AuthContextValue, AuthUser, UserRole } from "./types";
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

/** Build an AuthUser from a Supabase user: role/company_id live in app_metadata. */
async function mapSupabaseUser(
  supabase: SupabaseClient,
  supabaseUser: User
): Promise<AuthUser> {
  const role = (supabaseUser.app_metadata?.role ?? "company_user") as UserRole;
  const companyId = (supabaseUser.app_metadata?.company_id ?? null) as
    | string
    | null;

  let companyName: string | null = null;
  let companyCountry: string | null = null;

  if (companyId) {
    const { data } = await supabase
      .from("companies")
      .select("name, country")
      .eq("id", companyId)
      .maybeSingle();
    companyName = data?.name ?? null;
    companyCountry = data?.country ?? null;
  }

  return {
    id: supabaseUser.id,
    email: supabaseUser.email ?? "",
    role,
    company_id: companyId,
    company_name: companyName,
    company_country: companyCountry,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const supabase = useMemo(
    () => (IS_MOCK_AUTH ? null : createClient()),
    []
  );

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
      setIsLoading(false);
      return;
    }

    if (!supabase) return;

    let cancelled = false;

    supabase.auth
      .getUser()
      .then(async ({ data }) => {
        if (cancelled) return;
        if (data.user) {
          setUser(await mapSupabaseUser(supabase, data.user));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

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
        router.push("/dashboard");
        return {};
      }

      if (!supabase) {
        return { error: "Supabase no configurado" };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error || !data.user) {
        return { error: "Correo o contraseña incorrectos" };
      }

      setUser(await mapSupabaseUser(supabase, data.user));
      router.push("/dashboard");
      return {};
    },
    [router, supabase]
  );

  const signOut = useCallback(async () => {
    if (IS_MOCK_AUTH) {
      deleteCookie(COOKIE_NAME);
      setUser(null);
      router.push("/login");
      return;
    }

    if (supabase) {
      await supabase.auth.signOut();
    }
    setUser(null);
    router.push("/login");
  }, [router, supabase]);

  const switchCompany = useCallback(
    (companyId: string) => {
      if (!user || user.role !== "super_admin") return;

      if (IS_MOCK_AUTH) {
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
        return;
      }

      if (!supabase) return;

      void supabase
        .from("companies")
        .select("name, country")
        .eq("id", companyId)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) return;
          setUser((prev) =>
            prev
              ? {
                  ...prev,
                  company_id: companyId,
                  company_name: data.name,
                  company_country: data.country,
                }
              : prev
          );
        });
    },
    [user, supabase]
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
