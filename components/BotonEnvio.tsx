'use client'

import { useFormStatus } from 'react-dom'
import { Spinner } from './Spinner'

// Botón de submit con spinner mientras la Server Action corre (y, si
// redirige, mientras carga la pantalla de destino -- useFormStatus queda
// en pending hasta que React confirma la navegación). Tiene que ir DENTRO
// de un <form>, useFormStatus lee el estado del form padre.
export function BotonEnvio({
  children,
  className,
  cargandoTexto = 'Cargando…',
  ...props
}: {
  children: React.ReactNode
  className: string
  cargandoTexto?: string
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'disabled' | 'className' | 'children'>) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className} ${pending ? 'cursor-wait opacity-70' : ''}`}
      {...props}
    >
      <span className="inline-flex items-center justify-center gap-2">
        {pending && <Spinner />}
        {pending ? cargandoTexto : children}
      </span>
    </button>
  )
}
