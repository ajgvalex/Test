const stats = [
  {
    number: "21",
    label: "categorías de salario mínimo en Honduras",
  },
  {
    number: "3",
    label: "sistemas de seguridad social distintos en CA",
  },
  {
    number: "0",
    label: "SaaS nativo que los cubría todos — hasta ahora",
  },
];

export function Expertise() {
  return (
    <section className="bg-landing-hielo py-16 md:py-20">
      <div className="mx-auto max-w-4xl px-6">
        <div className="grid gap-8 md:grid-cols-3">
          {stats.map((s, i) => (
            <div
              key={i}
              className="rounded-xl bg-white/70 p-6 text-center"
              style={{ border: "0.5px solid rgba(0,0,0,0.06)" }}
            >
              <p className="font-serif text-4xl text-landing-noche md:text-5xl">
                {s.number}
              </p>
              <p className="mt-3 text-sm font-light leading-snug text-landing-noche/60">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
