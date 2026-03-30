import Link from "next/link";
import { PlanillaLogo } from "./logo";

export function Nav() {
  return (
    <nav
      className="sticky top-0 z-50 bg-landing-fondo/95 backdrop-blur-sm"
      style={{ borderBottom: "0.5px solid rgba(0,0,0,0.1)" }}
    >
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
        <PlanillaLogo />
        <Link
          href="/login"
          className="text-sm font-medium text-landing-marca transition-colors hover:text-landing-noche"
        >
          Iniciar sesion
        </Link>
      </div>
    </nav>
  );
}
