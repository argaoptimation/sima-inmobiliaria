'use client'

import { BotonEnvio } from '@/components/BotonEnvio'

export function BotonMarcarPrejudicial({
  marcarPrejudicialAction,
}: {
  marcarPrejudicialAction: () => Promise<void>
}) {
  return (
    <form
      action={marcarPrejudicialAction}
      onSubmit={(evento) => {
        if (
          !confirm(
            '¿Marcar este lote como Prejudicial? Es un paso manual e importante -- habilita la plantilla de WhatsApp de Prejudicial para este cliente.'
          )
        ) {
          evento.preventDefault()
        }
      }}
    >
      <BotonEnvio className="cursor-pointer rounded-lg border border-red-700 px-3 py-2 text-sm font-semibold text-red-800 transition-colors hover:bg-red-50">
        Marcar Prejudicial
      </BotonEnvio>
    </form>
  )
}

export function BotonDesmarcarPrejudicial({
  desmarcarPrejudicialAction,
}: {
  desmarcarPrejudicialAction: () => Promise<void>
}) {
  return (
    <form action={desmarcarPrejudicialAction}>
      <BotonEnvio className="cursor-pointer rounded-lg border border-blue-100 px-3 py-2 text-sm font-medium text-blue-800 transition-colors hover:bg-blue-50">
        Sacar de Prejudicial
      </BotonEnvio>
    </form>
  )
}
