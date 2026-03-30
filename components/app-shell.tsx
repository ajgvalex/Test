"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Users,
  Calculator,
  BarChart3,
  Menu,
  X,
  DollarSign,
  LogOut,
  ChevronsUpDown,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/auth-context";
import { MOCK_COMPANIES } from "@/lib/auth/mock-users";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Inicio", icon: DollarSign },
  { href: "/employees", label: "Empleados", icon: Users },
  { href: "/payroll", label: "Nómina", icon: Calculator },
  { href: "/reports", label: "Reportes", icon: BarChart3 },
];

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  platform_admin: "Admin",
  company_user: "Usuario",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, signOut, switchCompany } = useAuth();

  const isSuperAdmin = user?.role === "super_admin";

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:bg-muted/30">
        <div className="flex h-14 items-center border-b px-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold">
            <DollarSign className="h-5 w-5" />
            Planilla
          </Link>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User info + company selector */}
        <div className="border-t p-4 space-y-3">
          {/* Company selector for super_admin */}
          {isSuperAdmin && (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Empresa
              </p>
              <Select
                value={user?.company_id ?? ""}
                onValueChange={switchCompany}
              >
                <SelectTrigger className="h-8 text-xs">
                  <ChevronsUpDown className="mr-1 h-3 w-3" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(MOCK_COMPANIES).map((co) => (
                    <SelectItem key={co.id} value={co.id}>
                      {co.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Company name (for non-admin users) */}
          {!isSuperAdmin && user?.company_name && (
            <p className="text-sm font-medium truncate">{user.company_name}</p>
          )}

          {/* User email + role */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground truncate">
              {user?.email}
            </p>
            {user?.role && (
              <Badge
                variant={isSuperAdmin ? "default" : "secondary"}
                className="text-[10px] gap-1"
              >
                {isSuperAdmin && <Shield className="h-2.5 w-2.5" />}
                {ROLE_LABELS[user.role] ?? user.role}
              </Badge>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="w-full justify-start text-muted-foreground hover:text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar sesión
          </Button>
        </div>
      </aside>

      {/* Mobile header + overlay */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-4 md:hidden">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold">
            <DollarSign className="h-5 w-5" />
            Planilla
          </Link>
          <div className="flex items-center gap-2">
            {user?.company_name && (
              <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                {user.company_name}
              </span>
            )}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="rounded-md p-2 hover:bg-accent"
            >
              {mobileOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
          </div>
        </header>

        {/* Mobile nav overlay */}
        {mobileOpen && (
          <div className="absolute inset-0 z-50 md:hidden">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setMobileOpen(false)}
            />
            <nav className="relative z-10 w-64 min-h-screen bg-background border-r p-4 space-y-1">
              <div className="flex items-center gap-2 font-bold mb-6 pb-4 border-b">
                <DollarSign className="h-5 w-5" />
                Planilla
              </div>
              {NAV_ITEMS.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}

              {/* Mobile user section */}
              <div className="!mt-6 border-t pt-4 space-y-3">
                {isSuperAdmin && (
                  <Select
                    value={user?.company_id ?? ""}
                    onValueChange={(v) => {
                      switchCompany(v);
                      setMobileOpen(false);
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <ChevronsUpDown className="mr-1 h-3 w-3" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(MOCK_COMPANIES).map((co) => (
                        <SelectItem key={co.id} value={co.id}>
                          {co.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-xs text-muted-foreground truncate">
                  {user?.email}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={signOut}
                  className="w-full justify-start"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Cerrar sesión
                </Button>
              </div>
            </nav>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
