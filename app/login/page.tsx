"use client";

import { useState } from "react";

import { useAuth } from "@/lib/auth/auth-context";
import { IS_MOCK_AUTH } from "@/lib/auth/config";
import { PlanillaLogo } from "@/components/landing/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await signIn(email, password);
    if (result.error) {
      setError(result.error);
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="flex flex-col items-center gap-2 text-center">
          <PlanillaLogo />
          <p className="text-sm text-muted-foreground">
            Inicia sesion para continuar
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="correo@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Ingresando..." : "Iniciar Sesión"}
            </Button>
          </form>

          {IS_MOCK_AUTH && (
            <div className="mt-4 rounded-lg border border-dashed p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Modo demo — usuarios disponibles:
              </p>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  <code className="rounded bg-muted px-1">alex.gonzales.v@outlook.com</code>{" "}
                  <span className="text-primary">(Super Admin)</span>
                </p>
                <p>
                  <code className="rounded bg-muted px-1">cremini@test.com</code>{" "}
                  — Cremini Test
                </p>
                <p>
                  <code className="rounded bg-muted px-1">meraki@test.com</code>{" "}
                  — Meraki Test
                </p>
                <p className="pt-1">
                  Password: <code className="rounded bg-muted px-1">password123</code>
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
