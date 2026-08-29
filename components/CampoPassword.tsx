'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

// Input de contraseña con botón "mostrar/ocultar".
// Iconos de Lucide React, alineado con el design system SIMA.
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
        className="mt-1 block w-full rounded-lg border-2 border-slate-300 bg-slate-50 px-3 py-2.5 pr-10 text-sm text-slate-900 shadow-sm transition-all duration-150 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        title={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center text-slate-400 transition-colors hover:text-blue-800"
      >
        {visible ? (
          <EyeOff className="h-4 w-4" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
      </button>
    </div>
  )
}
