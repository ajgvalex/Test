function FeatureIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-landing-hielo">
      {children}
    </div>
  );
}

const features = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 2L12.09 7.26L18 8.27L14 12.14L14.18 18.02L10 15.77L5.82 18.02L6 12.14L2 8.27L7.91 7.26L10 2Z" stroke="#185FA5" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
    title: "Cálculo automático y correcto",
    description:
      "IHSS, RAP, ISR, INFOP, aguinaldo, catorceavo, vacaciones, cesantía. Todo calculado al centavo, cada quincena, sin que toques una fórmula.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2C5.58172 2 2 5.58172 2 10C2 14.4183 5.58172 18 10 18Z" stroke="#185FA5" strokeWidth="1.5" />
        <path d="M10 6V10L13 13" stroke="#185FA5" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: "Actualizado cuando cambia la ley",
    description:
      "Cuando el gobierno ajusta el techo del IHSS o las tablas del ISR, nosotros actualizamos. Vos no tenés que hacer nada.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 5H17M3 5V15C3 16.1046 3.89543 17 5 17H15C16.1046 17 17 16.1046 17 15V5M3 5L5 3H15L17 5M7 9H13M7 12H10" stroke="#185FA5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "Reportes listos para tu contador",
    description:
      "Planilla IHSS, reporte SAR, diario contable para Zoho, archivo bancario de dispersión. Un click y se descarga.",
  },
];

export function Solucion() {
  return (
    <section id="solucion" className="mx-auto max-w-4xl px-6 py-16 md:py-20">
      <p className="mb-10 text-sm font-medium uppercase tracking-wider text-landing-marca">
        La solución
      </p>

      <div className="space-y-0">
        {features.map((f, i) => (
          <div
            key={i}
            className="flex gap-5 py-8"
            style={
              i < features.length - 1
                ? { borderBottom: "0.5px solid rgba(0,0,0,0.1)" }
                : undefined
            }
          >
            <FeatureIcon>{f.icon}</FeatureIcon>
            <div>
              <h3 className="font-serif text-lg text-landing-noche">
                {f.title}
              </h3>
              <p className="mt-2 text-sm font-light leading-relaxed text-landing-noche/65">
                {f.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
