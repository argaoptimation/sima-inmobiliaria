'use client'

import { BotonEnvio } from '@/components/BotonEnvio'

export function BotonRescindir({ rescindirAction }: { rescindirAction: () => Promise<void> }) {
  return (
    <form
      action={rescindirAction}
      onSubmit={(evento) => {
        if (
          !confirm(
            '¿Seguro que querés rescindir este lote? Pasa a "rescindido" -- después vas a poder ponerlo disponible de nuevo para venderlo.'
          )
        ) {
          evento.preventDefault()
        }
      }}
    >
      <BotonEnvio className="cursor-pointer rounded-lg border border-red-600 px-3 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50">
        Rescindir
      </BotonEnvio>
    </form>
  )
}
