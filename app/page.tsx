import Link from "next/link";
import { Users, Calculator, BarChart3, ArrowRight, Bot } from "lucide-react";

const MODULES = [
  {
    href: "/employees",
    title: "Empleados",
    description:
      "Gestiona el directorio: búsqueda, filtros por país/departamento/estado, crear y editar empleados.",
    icon: Users,
    color: "bg-blue-500/10 text-blue-600",
  },
  {
    href: "/payroll",
    title: "Procesamiento de Nómina",
    description:
      "Wizard de 4 pasos: seleccionar período, revisar novedades, preview de cálculo con override, aprobar y generar.",
    icon: Calculator,
    color: "bg-green-500/10 text-green-600",
  },
  {
    href: "/reports",
    title: "Reportes",
    description:
      "Dashboard con gráficos, recibos PDF, planillas IHSS/OVISSS, archivo bancario de dispersión.",
    icon: BarChart3,
    color: "bg-purple-500/10 text-purple-600",
  },
  {
    href: "/trading",
    title: "Trading Bot — Polymarket",
    description:
      "Agente automatizado de trading en mercados de predicción. Estrategias configurables, gestión de riesgo y paper trading.",
    icon: Bot,
    color: "bg-orange-500/10 text-orange-600",
  },
];

export default function Home() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">
          Bienvenido a PayrollApp
        </h1>
        <p className="mt-2 text-muted-foreground">
          Sistema de gestión de nómina para Honduras y El Salvador. Selecciona
          un módulo para comenzar.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {MODULES.map((mod) => (
          <Link
            key={mod.href}
            href={mod.href}
            className="group rounded-xl border bg-card p-6 shadow-sm transition-all hover:shadow-md hover:border-primary/30"
          >
            <div
              className={`mb-4 flex h-12 w-12 items-center justify-center rounded-lg ${mod.color}`}
            >
              <mod.icon className="h-6 w-6" />
            </div>
            <h2 className="mb-2 text-lg font-semibold">{mod.title}</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              {mod.description}
            </p>
            <span className="inline-flex items-center text-sm font-medium text-primary group-hover:underline">
              Abrir módulo
              <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-12 rounded-lg border border-dashed p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Datos de demostración con 8 empleados (Honduras y El Salvador).
          Los motores de cálculo de nómina son funcionales con reglas reales de
          IHSS, RAP, ISR, ISSS, AFP.
        </p>
      </div>
    </div>
  );
}
