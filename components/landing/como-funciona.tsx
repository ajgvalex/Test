const steps = [
  {
    number: "01",
    title: "Registra a tu equipo",
    description:
      "Agrega empleados con su salario, departamento e inicio de contrato. Una sola vez.",
  },
  {
    number: "02",
    title: "Revisa novedades",
    description:
      "Horas extra, bonos, comisiones, ausencias — todo en un solo lugar antes de calcular.",
  },
  {
    number: "03",
    title: "Aprueba la planilla",
    description:
      "Revisa el cálculo completo antes de aprobar. Ajusta lo que necesites. Sin sorpresas.",
  },
  {
    number: "04",
    title: "Descarga y listo",
    description:
      "Recibos de pago, planilla IHSS, archivo bancario y diario contable. Todo en un click.",
  },
];

export function ComoFunciona() {
  return (
    <section
      id="como-funciona"
      className="mx-auto max-w-4xl px-6 py-16 md:py-20"
    >
      <p className="mb-3 text-sm font-medium uppercase tracking-wider text-landing-marca">
        Cómo funciona
      </p>
      <h2 className="mb-12 font-serif text-2xl text-landing-noche md:text-3xl">
        De cero a planilla aprobada en cuatro pasos.
      </h2>

      <div className="grid gap-8 sm:grid-cols-2">
        {steps.map((step) => (
          <div key={step.number} className="flex gap-5">
            <span className="font-serif text-4xl leading-none text-landing-suave">
              {step.number}
            </span>
            <div>
              <h3 className="font-serif text-lg text-landing-noche">
                {step.title}
              </h3>
              <p className="mt-2 text-sm font-light leading-relaxed text-landing-noche/60">
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
