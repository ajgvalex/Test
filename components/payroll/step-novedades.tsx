"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Clock, DollarSign, TrendingUp, ArrowUpDown } from "lucide-react";

import type { Novedad } from "@/lib/mock-data";
import { MOCK_EMPLOYEES } from "@/lib/mock-data";
import type { CountryCode } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface StepNovedadesProps {
  novedades: Novedad[];
  onNovedadesChange: (novedades: Novedad[]) => void;
  country: CountryCode;
}

const novedadSchema = z.object({
  employee_id: z.string().min(1, "Selecciona un empleado"),
  type: z.enum([
    "overtime",
    "bonus",
    "commission",
    "salary_change",
    "deduction",
    "other_earning",
  ], "Tipo requerido"),
  description: z.string().min(1, "Descripción requerida"),
  amount: z.coerce.number().min(0, "Monto debe ser positivo").default(0),
  hours: z.coerce.number().min(0).optional(),
});

type NovedadFormValues = z.infer<typeof novedadSchema>;

const TYPE_LABELS: Record<string, string> = {
  overtime: "Horas Extra",
  bonus: "Bono",
  commission: "Comisión",
  salary_change: "Cambio Salarial",
  deduction: "Deducción",
  other_earning: "Otro Ingreso",
};

const TYPE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  overtime: "outline",
  bonus: "default",
  commission: "secondary",
  salary_change: "default",
  deduction: "destructive",
  other_earning: "secondary",
};

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  overtime: Clock,
  bonus: DollarSign,
  commission: DollarSign,
  salary_change: TrendingUp,
  deduction: ArrowUpDown,
  other_earning: DollarSign,
};

function formatCurrency(amount: number, country: string) {
  const sym = country === "HN" ? "L" : "$";
  return `${sym} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export function StepNovedades({
  novedades,
  onNovedadesChange,
  country,
}: StepNovedadesProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const activeEmployees = MOCK_EMPLOYEES.filter(
    (e) => e.status === "active" && e.country === country
  );

  const form = useForm<NovedadFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(novedadSchema) as any,
    defaultValues: {
      employee_id: "",
      type: "overtime",
      description: "",
      amount: 0,
      hours: 0,
    },
  });

  const selectedType = form.watch("type");

  function handleAdd(values: NovedadFormValues) {
    const newNovedad: Novedad = {
      id: `n-${Date.now()}`,
      employee_id: values.employee_id,
      type: values.type,
      description: values.description,
      amount: values.amount,
      hours: values.type === "overtime" ? values.hours : undefined,
    };
    onNovedadesChange([...novedades, newNovedad]);
    form.reset();
    setDialogOpen(false);
  }

  function handleRemove(id: string) {
    onNovedadesChange(novedades.filter((n) => n.id !== id));
  }

  function getEmployeeName(employeeId: string) {
    const emp = MOCK_EMPLOYEES.find((e) => e.id === employeeId);
    return emp ? `${emp.first_name} ${emp.last_name}` : "—";
  }

  // Group novedades by type
  const grouped = novedades.reduce(
    (acc, n) => {
      if (!acc[n.type]) acc[n.type] = [];
      acc[n.type].push(n);
      return acc;
    },
    {} as Record<string, Novedad[]>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Revisar Novedades</h2>
          <p className="text-sm text-muted-foreground">
            Ingresos, egresos, cambios de salario y horas extra del período.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Agregar
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {(["overtime", "bonus", "commission", "salary_change"] as const).map((type) => {
          const items = grouped[type] ?? [];
          const Icon = TYPE_ICON[type];
          return (
            <Card key={type}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {TYPE_LABELS[type]}
                  </p>
                  <p className="text-lg font-semibold">{items.length}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Novedades list */}
      {novedades.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-[120px] items-center justify-center p-6">
            <p className="text-sm text-muted-foreground">
              No hay novedades registradas para este período.
            </p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([type, items]) => (
          <Card key={type}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Badge variant={TYPE_VARIANT[type] ?? "outline"}>
                  {TYPE_LABELS[type] ?? type}
                </Badge>
                <span className="text-sm font-normal text-muted-foreground">
                  ({items.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {items.map((n) => (
                <div
                  key={n.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {getEmployeeName(n.employee_id)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {n.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {n.type === "overtime" && n.hours ? (
                      <span className="text-sm font-mono">
                        {n.hours}h
                      </span>
                    ) : (
                      <span className="text-sm font-mono">
                        {formatCurrency(n.amount, country)}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemove(n.id)}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}

      {/* Add novedad dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar Novedad</DialogTitle>
            <DialogDescription>
              Registra una novedad para un empleado en este período.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleAdd)}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="employee_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Empleado</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar empleado" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {activeEmployees.map((emp) => (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.first_name} {emp.last_name} ({emp.employee_code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(TYPE_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción</FormLabel>
                    <FormControl>
                      <Input placeholder="Motivo de la novedad" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {selectedType === "overtime" ? (
                <FormField
                  control={form.control}
                  name="hours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Horas</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          step="0.5"
                          placeholder="0"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monto</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit">Agregar</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
