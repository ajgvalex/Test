const integrations = [
  {
    name: "Zoho Books",
    description: "Diario contable automático",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="16" height="16" rx="3" stroke="#185FA5" strokeWidth="1.3" />
        <path d="M5 13L13 5M5 5h8v8" stroke="#185FA5" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    name: "SAR Honduras",
    description: "Reportes en formato oficial",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M9 2L16 6v6l-7 4L2 12V6l7-4z" stroke="#185FA5" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M9 10V6" stroke="#185FA5" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="9" cy="12" r="0.8" fill="#185FA5" />
      </svg>
    ),
  },
  {
    name: "IHSS",
    description: "Planilla mensual de seguridad social",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M9 2C5.134 2 2 5.134 2 9s3.134 7 7 7 7-3.134 7-7-3.134-7-7-7z" stroke="#185FA5" strokeWidth="1.3" />
        <path d="M9 6v6M6 9h6" stroke="#185FA5" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: "BAC Credomatic",
    description: "Archivo de dispersión bancaria",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <rect x="2" y="4" width="14" height="10" rx="2" stroke="#185FA5" strokeWidth="1.3" />
        <path d="M2 7h14" stroke="#185FA5" strokeWidth="1.3" />
        <path d="M5 11h3" stroke="#185FA5" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: "Ficohsa",
    description: "Archivo de dispersión bancaria",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <rect x="2" y="4" width="14" height="10" rx="2" stroke="#185FA5" strokeWidth="1.3" />
        <path d="M2 7h14" stroke="#185FA5" strokeWidth="1.3" />
        <path d="M5 11h3" stroke="#185FA5" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: "Banco Atlántida",
    description: "Archivo de dispersión bancaria",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <rect x="2" y="4" width="14" height="10" rx="2" stroke="#185FA5" strokeWidth="1.3" />
        <path d="M2 7h14" stroke="#185FA5" strokeWidth="1.3" />
        <path d="M5 11h3" stroke="#185FA5" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
];

export function Integraciones() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-16 md:py-20">
      <p className="mb-3 text-sm font-medium uppercase tracking-wider text-landing-marca">
        Integraciones
      </p>
      <h2 className="mb-10 font-serif text-2xl text-landing-noche md:text-3xl">
        Conectado con las herramientas que ya usas.
      </h2>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {integrations.map((integration) => (
          <div
            key={integration.name}
            className="flex items-start gap-3 rounded-xl bg-white p-4"
            style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-landing-hielo">
              {integration.icon}
            </div>
            <div>
              <p className="text-sm font-medium text-landing-noche">
                {integration.name}
              </p>
              <p className="text-xs font-light text-landing-noche/50">
                {integration.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
