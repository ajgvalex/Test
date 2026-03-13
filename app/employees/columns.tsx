"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import Link from "next/link";

import type { Employee } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { COUNTRY_LABELS, STATUS_LABELS } from "@/lib/mock-data";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  inactive: "secondary",
  on_leave: "outline",
  terminated: "destructive",
};

function formatSalary(amount: number, country: string): string {
  const currency = country === "HN" ? "L" : "$";
  return `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export const columns: ColumnDef<Employee>[] = [
  {
    accessorKey: "employee_code",
    header: "Código",
    cell: ({ row }) => (
      <Link
        href={`/employees/${row.original.id}`}
        className="font-medium text-primary hover:underline"
      >
        {row.getValue("employee_code")}
      </Link>
    ),
  },
  {
    id: "full_name",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="-ml-4"
      >
        Nombre
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    accessorFn: (row) => `${row.first_name} ${row.last_name}`,
    cell: ({ row }) => (
      <Link
        href={`/employees/${row.original.id}`}
        className="hover:underline"
      >
        {row.original.first_name} {row.original.last_name}
      </Link>
    ),
  },
  {
    accessorKey: "position",
    header: "Puesto",
    cell: ({ row }) => (
      <span className="hidden sm:inline">{row.getValue("position")}</span>
    ),
  },
  {
    accessorKey: "department",
    header: "Departamento",
    cell: ({ row }) => (
      <span className="hidden md:inline">
        {row.getValue("department") ?? "—"}
      </span>
    ),
    filterFn: (row, id, value) => {
      if (!value || value === "all") return true;
      return row.getValue(id) === value;
    },
  },
  {
    accessorKey: "country",
    header: "País",
    cell: ({ row }) => (
      <span className="hidden lg:inline">
        {COUNTRY_LABELS[row.getValue("country") as string] ??
          row.getValue("country")}
      </span>
    ),
    filterFn: (row, id, value) => {
      if (!value || value === "all") return true;
      return row.getValue(id) === value;
    },
  },
  {
    accessorKey: "base_salary",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="-ml-4"
      >
        Salario
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="hidden sm:inline font-mono">
        {formatSalary(
          row.getValue("base_salary"),
          row.original.country
        )}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Estado",
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      return (
        <Badge variant={statusVariant[status] ?? "secondary"}>
          {STATUS_LABELS[status] ?? status}
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      if (!value || value === "all") return true;
      return row.getValue(id) === value;
    },
  },
];
