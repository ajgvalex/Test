import Link from "next/link";

export function Hero() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-20 md:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <p className="mb-4 text-sm font-medium uppercase tracking-wider text-landing-marca">
          Nómina para Centroamérica
        </p>

        <h1 className="font-serif text-3xl leading-tight text-landing-noche md:text-5xl md:leading-tight">
          ¿Cuánto le está costando tu planilla{" "}
          <em className="not-italic" style={{ fontStyle: "italic" }}>
            sin que lo sepas?
          </em>
        </h1>

        <p className="mx-auto mt-6 max-w-lg text-lg font-light leading-relaxed text-landing-noche/70">
          IHSS, RAP, ISR, INFOP, aguinaldo, catorceavo... Si los calculás a
          mano o en Excel, estás perdiendo dinero. O pagando de más. O las dos
          cosas.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center rounded-lg bg-landing-marca px-8 text-base font-medium text-white transition-colors hover:bg-landing-marca/90"
          >
            Pruébalo gratis 30 días
          </Link>
          <Link
            href="#solucion"
            className="inline-flex items-center text-sm font-medium text-landing-marca transition-colors hover:text-landing-noche"
          >
            Ver cómo funciona &rarr;
          </Link>
        </div>

        <p className="mt-5 text-xs text-landing-noche/40">
          Sin tarjeta de crédito. Sin contratos.
        </p>
      </div>
    </section>
  );
}
