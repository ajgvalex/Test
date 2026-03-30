import Link from "next/link";

const plans = [
  {
    name: "Starter",
    price: "$29",
    period: "/mes",
    employees: "Hasta 15 empleados",
    popular: false,
    features: [
      "Cálculo automático IHSS, RAP, ISR, INFOP",
      "Recibos digitales de pago",
      "Planilla IHSS mensual",
      "Reporte SAR",
      "Soporte por correo",
    ],
  },
  {
    name: "Growth",
    price: "$59",
    period: "/mes",
    employees: "Hasta 50 empleados",
    popular: true,
    features: [
      "Todo lo de Starter",
      "Archivo bancario de dispersión",
      "Diario contable para Zoho Books",
      "Novedades y horas extra",
      "Soporte prioritario",
    ],
  },
  {
    name: "Pro",
    price: "$99",
    period: "/mes",
    employees: "Empleados ilimitados",
    popular: false,
    features: [
      "Todo lo de Growth",
      "Multi-empresa",
      "Acceso para contador externo",
      "Exportaciones personalizadas",
      "Soporte dedicado",
    ],
  },
];

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className="shrink-0 mt-0.5"
    >
      <path
        d="M2.5 7L5.5 10L11.5 4"
        stroke="#185FA5"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Pricing() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-16 md:py-20">
      <p className="mb-3 text-center text-sm font-medium uppercase tracking-wider text-landing-marca">
        Precios
      </p>
      <h2 className="mb-3 text-center font-serif text-2xl text-landing-noche md:text-3xl">
        Simple, transparente, sin sorpresas.
      </h2>
      <p className="mb-12 text-center text-sm font-light text-landing-noche/50">
        30 días gratis en todos los planes. Sin tarjeta de crédito.
      </p>

      <div className="grid gap-6 md:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`relative flex flex-col rounded-2xl bg-white p-6 ${
              plan.popular
                ? "ring-2 ring-landing-marca"
                : ""
            }`}
            style={
              !plan.popular
                ? { border: "0.5px solid rgba(0,0,0,0.08)" }
                : undefined
            }
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="rounded-full bg-landing-marca px-3 py-1 text-xs font-medium text-white">
                  Más popular
                </span>
              </div>
            )}

            <div className="mb-6">
              <p className="text-sm font-medium text-landing-noche/60">
                {plan.name}
              </p>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-serif text-4xl text-landing-noche">
                  {plan.price}
                </span>
                <span className="text-sm text-landing-noche/50">
                  {plan.period}
                </span>
              </div>
              <p className="mt-1 text-xs text-landing-noche/40">
                {plan.employees}
              </p>
            </div>

            <ul className="mb-8 flex-1 space-y-3">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <CheckIcon />
                  <span className="text-sm font-light text-landing-noche/70">
                    {feature}
                  </span>
                </li>
              ))}
            </ul>

            <Link
              href="/login"
              className={`inline-flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                plan.popular
                  ? "bg-landing-marca text-white hover:bg-landing-marca/90"
                  : "bg-landing-hielo text-landing-marca hover:bg-landing-suave/30"
              }`}
            >
              Empezar gratis
            </Link>
          </div>
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-landing-noche/40">
        ¿Tienes más de 100 empleados o necesitas algo personalizado?{" "}
        <a
          href="mailto:hola@planilla.io"
          className="text-landing-marca hover:underline"
        >
          Escríbenos
        </a>
      </p>
    </section>
  );
}
