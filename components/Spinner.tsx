// Ícono de carga chico, reusado por EnlaceBoton y BotonEnvio -- SVG, no
// emoji (design system). `currentColor` para heredar el color de texto del
// botón que lo contiene (blanco sobre fondo azul, azul sobre fondo blanco).
export function Spinner({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`animate-spin ${className}`}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={3} className="opacity-25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
      />
    </svg>
  )
}
