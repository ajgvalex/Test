const items = [
  "Diseñado para Honduras",
  "El Salvador",
  "Guatemala",
  "Beta activa",
  "Primeras empresas ya procesando planilla",
];

export function SocialProof() {
  return (
    <section className="bg-landing-hielo py-5">
      <div className="mx-auto max-w-4xl px-6">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          {items.map((item, i) => (
            <span key={i} className="flex items-center gap-4">
              <span className="text-xs font-medium text-landing-noche/60">
                {item}
              </span>
              {i < items.length - 1 && (
                <span className="text-landing-suave" aria-hidden="true">
                  ·
                </span>
              )}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
