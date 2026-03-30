export function PlanillaLogo({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect width="32" height="32" rx="8" fill="#185FA5" />
        {/* 2x2 grid lines */}
        <line x1="16" y1="6" x2="16" y2="26" stroke="white" strokeWidth="1" strokeOpacity="0.3" />
        <line x1="6" y1="16" x2="26" y2="16" stroke="white" strokeWidth="1" strokeOpacity="0.3" />
        {/* + symbol in bottom-right quadrant */}
        <line x1="22" y1="19" x2="22" y2="25" stroke="white" strokeWidth="2" strokeLinecap="round" />
        <line x1="19" y1="22" x2="25" y2="22" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="font-serif text-xl tracking-tight text-landing-noche">
        planilla.io
      </span>
    </div>
  );
}
