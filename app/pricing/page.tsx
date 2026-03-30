import type { Metadata } from "next";
import { Nav } from "@/components/landing/nav";
import { Pricing } from "@/components/landing/pricing";
import { CtaFinal } from "@/components/landing/cta-final";

export const metadata: Metadata = {
  title: "Precios — Planilla.io",
  description:
    "Planes simples y transparentes para PYMEs en Honduras y Centroamérica. 30 días gratis sin tarjeta de crédito.",
};

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-landing-fondo">
      <Nav />
      <Pricing />
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
