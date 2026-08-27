'use client'

import Link, { useLinkStatus } from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { Spinner } from './Spinner'

// Reemplaza los <a href> de navegación por next/link -- necesario para que
// useLinkStatus (abajo) pueda mostrar un spinner mientras la próxima
// pantalla carga sus datos (pedido de Gabriel 27/08: "cualquier botón que
// te redirige" se sentía sin respuesta hasta que la página siguiente
// terminaba de renderizar). Con <a> plano, al ser una navegación completa
// del browser, no hay forma de mostrar un estado intermedio propio.
// Exportado aparte de EnlaceBoton para los casos donde el <Link> no es un
// botón simple de una línea (ej. una tarjeta entera clickeable con varios
// bloques adentro) -- ahí conviene poner el indicador a mano, en un lugar
// puntual del layout, en vez del wrapper genérico de EnlaceBoton.
export function IndicadorPendiente() {
  const { pending } = useLinkStatus()
  if (!pending) return null
  return <Spinner />
}

export function EnlaceBoton({
  children,
  className,
  ...props
}: ComponentProps<typeof Link> & { children: ReactNode }) {
  return (
    <Link {...props} className={className}>
      <span className="inline-flex items-center gap-2">
        {children}
        <IndicadorPendiente />
      </span>
    </Link>
  )
}
