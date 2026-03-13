"use client";

import { use, useState, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  MapPin,
  Calendar,
  CreditCard,
  Pencil,
  FileText,
  Upload,
} from "lucide-react";

import type { Employee } from "@/types";
import type { EmployeeFormValues } from "@/lib/validations/employee";
import {
  MOCK_EMPLOYEES,
  COUNTRY_LABELS,
  STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/mock-data";
import { EmployeeFormDialog } from "@/components/employee-form-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

const statusVariant: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  active: "default",
  inactive: "secondary",
  on_leave: "outline",
  terminated: "destructive",
};

function formatSalary(amount: number, country: string): string {
  const currency = country === "HN" ? "L" : "$";
  return `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("es-HN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

// Salary history mock
const SALARY_HISTORY = [
  { date: "2024-01-01", amount: 45000, reason: "Aumento anual" },
  { date: "2023-01-01", amount: 40000, reason: "Promoción" },
  { date: "2020-01-15", amount: 30000, reason: "Salario inicial" },
];

// Documents mock
const DOCUMENTS = [
  {
    id: "1",
    name: "Contrato de trabajo",
    type: "PDF",
    date: "2020-01-15",
  },
  {
    id: "2",
    name: "Identidad (copia)",
    type: "PDF",
    date: "2020-01-15",
  },
  {
    id: "3",
    name: "Constancia IHSS",
    type: "PDF",
    date: "2024-01-10",
  },
];

export default function EmployeeProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [editOpen, setEditOpen] = useState(false);

  const employee = useMemo(
    () => MOCK_EMPLOYEES.find((e) => e.id === id),
    [id]
  );

  if (!employee) {
    return (
      <div className="container mx-auto flex min-h-[50vh] items-center justify-center px-4">
        <div className="text-center">
          <h2 className="text-xl font-semibold">Empleado no encontrado</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            El empleado con ID &quot;{id}&quot; no existe.
          </p>
          <Button asChild className="mt-4">
            <Link href="/employees">Volver al listado</Link>
          </Button>
        </div>
      </div>
    );
  }

  function handleEdit(_values: EmployeeFormValues) {
    // In production: update via Supabase
    setEditOpen(false);
  }

  const defaultValues: Partial<EmployeeFormValues> = {
    employee_code: employee.employee_code,
    first_name: employee.first_name,
    last_name: employee.last_name,
    identity_number: employee.identity_number,
    email: employee.email ?? "",
    phone: employee.phone ?? "",
    date_of_birth: employee.date_of_birth ?? "",
    hire_date: employee.hire_date,
    department: employee.department ?? "",
    position: employee.position,
    base_salary: employee.base_salary,
    payment_method: employee.payment_method,
    bank_name: employee.bank_name ?? "",
    bank_account: employee.bank_account ?? "",
    status: employee.status,
    country: employee.country,
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back + Header */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link href="/employees">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Empleados
          </Link>
        </Button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">
                {employee.first_name} {employee.last_name}
              </h1>
              <Badge variant={statusVariant[employee.status] ?? "secondary"}>
                {STATUS_LABELS[employee.status]}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {employee.employee_code} &middot; {employee.position}
              {employee.department ? ` &middot; ${employee.department}` : ""}
            </p>
          </div>
          <Button onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Editar
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="personal" className="space-y-6">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="personal">Datos Personales</TabsTrigger>
          <TabsTrigger value="contract">Contrato</TabsTrigger>
          <TabsTrigger value="salary">Historial Salarial</TabsTrigger>
          <TabsTrigger value="documents">Documentos</TabsTrigger>
        </TabsList>

        {/* === TAB: Datos Personales === */}
        <TabsContent value="personal">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Información Personal
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <InfoRow
                  icon={FileText}
                  label="Identidad"
                  value={employee.identity_number}
                />
                <InfoRow
                  icon={Mail}
                  label="Email"
                  value={employee.email ?? "No registrado"}
                />
                <InfoRow
                  icon={Phone}
                  label="Teléfono"
                  value={employee.phone ?? "No registrado"}
                />
                <InfoRow
                  icon={Calendar}
                  label="Fecha de nacimiento"
                  value={formatDate(employee.date_of_birth)}
                />
                <InfoRow
                  icon={MapPin}
                  label="País"
                  value={COUNTRY_LABELS[employee.country] ?? employee.country}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Información Laboral</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <InfoRow
                  icon={Building2}
                  label="Departamento"
                  value={employee.department ?? "Sin asignar"}
                />
                <InfoRow
                  icon={FileText}
                  label="Puesto"
                  value={employee.position}
                />
                <InfoRow
                  icon={Calendar}
                  label="Fecha de contratación"
                  value={formatDate(employee.hire_date)}
                />
                {employee.termination_date && (
                  <InfoRow
                    icon={Calendar}
                    label="Fecha de desvinculación"
                    value={formatDate(employee.termination_date)}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* === TAB: Contrato === */}
        <TabsContent value="contract">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Datos del Contrato
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <InfoRow
                  icon={FileText}
                  label="Código de empleado"
                  value={employee.employee_code}
                />
                <InfoRow
                  icon={Calendar}
                  label="Fecha de ingreso"
                  value={formatDate(employee.hire_date)}
                />
                <InfoRow
                  icon={Building2}
                  label="Puesto"
                  value={employee.position}
                />
                <InfoRow
                  icon={Building2}
                  label="Departamento"
                  value={employee.department ?? "Sin asignar"}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Información de Pago
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <InfoRow
                  icon={CreditCard}
                  label="Salario base"
                  value={formatSalary(
                    employee.base_salary,
                    employee.country
                  )}
                />
                <InfoRow
                  icon={CreditCard}
                  label="Método de pago"
                  value={
                    PAYMENT_METHOD_LABELS[employee.payment_method] ??
                    employee.payment_method
                  }
                />
                {employee.bank_name && (
                  <InfoRow
                    icon={Building2}
                    label="Banco"
                    value={employee.bank_name}
                  />
                )}
                {employee.bank_account && (
                  <InfoRow
                    icon={CreditCard}
                    label="Cuenta"
                    value={employee.bank_account}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* === TAB: Historial Salarial === */}
        <TabsContent value="salary">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Historial Salarial</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {SALARY_HISTORY.map((entry, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          {formatSalary(entry.amount, employee.country)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {entry.reason}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(entry.date)}
                      </p>
                    </div>
                    {i < SALARY_HISTORY.length - 1 && (
                      <Separator className="mt-4" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === TAB: Documentos === */}
        <TabsContent value="documents">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Documentos</CardTitle>
              <Button variant="outline" size="sm">
                <Upload className="mr-2 h-4 w-4" />
                Subir
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {DOCUMENTS.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{doc.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.type} &middot; {formatDate(doc.date)}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      Ver
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <EmployeeFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        defaultValues={defaultValues}
        onSubmit={handleEdit}
        mode="edit"
      />
    </div>
  );
}
