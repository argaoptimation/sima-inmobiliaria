'use client'

import { useState } from 'react'

// Input de contraseña con botón "mostrar/ocultar" (pedido pendiente de
// Notion, Fase 6). SVG en vez de emoji, mismo criterio que el resto del
// design system.
export function CampoPassword({
  name,
  placeholder,
  required,
  minLength,
  autoComplete,
}: {
  name: string
  placeholder: string
  required?: boolean
  minLength?: number
  autoComplete?: string
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <input
        name={name}
        type={visible ? 'text' : 'password'}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        className="w-full rounded-lg border border-blue-100 px-3 py-2 pr-10 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        title={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center text-gray-400 transition-colors hover:text-blue-800"
      >
        {visible ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 3l18 18M10.58 10.58a2 2 0 002.83 2.83M9.88 4.24A9.94 9.94 0 0112 4c5 0 9 4 10.5 8-.6 1.68-1.62 3.2-2.93 4.44M6.53 6.53C4.6 7.86 3.08 9.77 1.5 12c1.5 4 5.5 8 10.5 8 1.36 0 2.65-.27 3.83-.76"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M1.5 12C3 8 7 4 12 4s9 4 10.5 8c-1.5 4-5.5 8-10.5 8S3 16 1.5 12Z"
            />
            <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </div>
  )
}
