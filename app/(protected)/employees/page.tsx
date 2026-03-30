"use client";

import { useState, useMemo } from "react";
import { Plus, Search } from "lucide-react";

import type { Employee } from "@/types";
import { DEPARTMENTS, COUNTRY_LABELS, STATUS_LABELS } from "@/lib/mock-data";
import { getEmployees } from "@/lib/data";
import { useAuth } from "@/lib/auth/auth-context";
import type { EmployeeFormValues } from "@/lib/validations/employee";
import { DataTable } from "@/components/data-table";
import { EmployeeFormDialog } from "@/components/employee-form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { columns } from "./columns";

export default function EmployeesPage() {
  const { user } = useAuth();
  const companyId = user?.company_id ?? "";
  const [employees, setEmployees] = useState<Employee[]>(() =>
    getEmployees(companyId)
  );
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = useMemo(() => {
    let result = employees;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.first_name.toLowerCase().includes(q) ||
          e.last_name.toLowerCase().includes(q) ||
          e.employee_code.toLowerCase().includes(q) ||
          e.identity_number.toLowerCase().includes(q) ||
          (e.email?.toLowerCase().includes(q) ?? false)
      );
    }

    if (countryFilter !== "all") {
      result = result.filter((e) => e.country === countryFilter);
    }

    if (departmentFilter !== "all") {
      result = result.filter((e) => e.department === departmentFilter);
    }

    if (statusFilter !== "all") {
      result = result.filter((e) => e.status === statusFilter);
    }

    return result;
  }, [employees, search, countryFilter, departmentFilter, statusFilter]);

  function handleCreate(values: EmployeeFormValues) {
    const newEmployee: Employee = {
      id: crypto.randomUUID(),
      company_id: companyId,
      ...values,
      email: values.email || null,
      phone: values.phone || null,
      date_of_birth: values.date_of_birth || null,
      department: values.department || null,
      bank_name: values.bank_name || null,
      bank_account: values.bank_account || null,
      termination_date: null,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setEmployees((prev) => [...prev, newEmployee]);
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Empleados</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona el directorio de empleados de tu empresa.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Empleado
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative sm:col-span-2 lg:col-span-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, código, identidad..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={countryFilter} onValueChange={setCountryFilter}>
          <SelectTrigger>
            <SelectValue placeholder="País" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los países</SelectItem>
            {Object.entries(COUNTRY_LABELS).map(([code, label]) => (
              <SelectItem key={code} value={code}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Departamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los deptos.</SelectItem>
            {DEPARTMENTS.map((dept) => (
              <SelectItem key={dept} value={dept}>
                {dept}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {Object.entries(STATUS_LABELS).map(([code, label]) => (
              <SelectItem key={code} value={code}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <DataTable columns={columns} data={filtered} pageSize={10} />

      {/* Create Dialog */}
      <EmployeeFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleCreate}
        mode="create"
      />
    </div>
  );
}
