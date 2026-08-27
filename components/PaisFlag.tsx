import type { ComponentType, SVGProps } from 'react'
import * as Banderas from 'country-flag-icons/react/3x2'

// SVG real por país (no emoji): en Windows, el emoji de bandera regional
// (🇦🇷) se renderiza como dos letras sueltas ("AR") en vez del ícono, según
// el motor de fuentes -- un SVG se ve igual en cualquier sistema operativo.
// `iso` en null (el caso "otro país") cae en un globo genérico.
export function PaisFlag({ iso, className = 'h-3.5 w-5 rounded-[2px]' }: { iso: string | null; className?: string }) {
  if (!iso) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className} aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.7 4 6 4 9s-1.5 6.3-4 9c-2.5-2.7-4-6-4-9s1.5-6.3 4-9Z" />
      </svg>
    )
  }

  const Bandera = (Banderas as Record<string, ComponentType<SVGProps<SVGSVGElement>>>)[iso]
  if (!Bandera) return null

  return <Bandera className={className} aria-hidden="true" />
}
