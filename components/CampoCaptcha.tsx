'use client'

import Script from 'next/script'
import { useEffect, useRef, useState } from 'react'

// Widget de Cloudflare Turnstile dentro de un <form> normal de Next
// (server action). El widget deja el token en un input oculto llamado
// `cf-turnstile-response`, que es el nombre que el server action lee.
//
// Si no hay site key configurada, este componente no dibuja nada: es como
// corre en local y en el suite E2E (ver lib/seguridad/turnstile.ts).
//
// El widget se renderiza a mano (`turnstile.render`) en vez de dejar que el
// script busque los `.cf-turnstile` del DOM: con React el div puede montarse
// después de que el script cargó, y el auto-render se lo pierde.

declare global {
  interface Window {
    turnstile?: {
      render: (
        contenedor: HTMLElement,
        opciones: {
          sitekey: string
          callback?: (token: string) => void
          'expired-callback'?: () => void
          'error-callback'?: () => void
          theme?: 'light' | 'dark' | 'auto'
        }
      ) => string
      remove: (widgetId: string) => void
    }
  }
}

export default function CampoCaptcha({ siteKey }: { siteKey: string | null }) {
  const contenedor = useRef<HTMLDivElement>(null)
  const [scriptListo, setScriptListo] = useState(false)

  useEffect(() => {
    if (!siteKey || !scriptListo || !contenedor.current || !window.turnstile) return

    const widgetId = window.turnstile.render(contenedor.current, {
      sitekey: siteKey,
      theme: 'light',
    })

    return () => window.turnstile?.remove(widgetId)
  }, [siteKey, scriptListo])

  if (!siteKey) return null

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptListo(true)}
      />
      <div ref={contenedor} className="flex justify-center" />
    </>
  )
}
