import Link from "next/link";

export function CtaFinal() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-20 md:py-28">
      <div className="mx-auto max-w-lg text-center">
        <h2 className="font-serif text-3xl text-landing-noche md:text-4xl">
          Nómina sin drama.{" "}
          <em className="not-italic" style={{ fontStyle: "italic" }}>
            Desde hoy.
          </em>
        </h2>

        <p className="mt-4 text-base font-light text-landing-noche/60">
          Empezá gratis. Sin contratos. Sin letra pequeña.
        </p>

        <Link
          href="/login"
          className="mt-8 inline-flex h-12 w-full max-w-md items-center justify-center rounded-lg bg-landing-marca px-8 text-base font-medium text-white transition-colors hover:bg-landing-marca/90"
        >
          Crear mi cuenta gratis
        </Link>

        <p className="mt-4 text-xs text-landing-noche/40">
          30 días gratis &middot; Cancelá cuando quieras
        </p>
      </div>
    </section>
  );
}
