import { Nav } from "@/components/landing/nav";
import { Hero } from "@/components/landing/hero";
import { SectionSeparator } from "@/components/landing/section-separator";
import { Problema } from "@/components/landing/problema";
import { Solucion } from "@/components/landing/solucion";
import { Expertise } from "@/components/landing/expertise";
import { CtaFinal } from "@/components/landing/cta-final";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-landing-fondo">
      <Nav />
      <Hero />
      <SectionSeparator />
      <Problema />
      <SectionSeparator />
      <Solucion />
      <Expertise />
      <SectionSeparator />
      <CtaFinal />
      <footer
        className="py-8 text-center text-xs text-landing-noche/30"
        style={{ borderTop: "0.5px solid rgba(0,0,0,0.1)" }}
      >
        &copy; 2026 Planilla. Todos los derechos reservados.
      </footer>
    </main>
  );
}
