'use client'

import { BotonEnvio } from '@/components/BotonEnvio'

export function BotonEliminarCuentaExterna({
  eliminarCuentaExternaAction,
}: {
  eliminarCuentaExternaAction: () => Promise<void>
}) {
  return (
    <form
      action={eliminarCuentaExternaAction}
      onSubmit={(evento) => {
        if (!confirm('¿Seguro que querés eliminar esta cuenta externa? No se puede deshacer.')) {
          evento.preventDefault()
        }
      }}
    >
      <BotonEnvio className="cursor-pointer rounded-lg border border-red-600 px-3 py-2 text-sm text-red-700 transition-colors hover:bg-red-50">
        Eliminar cuenta externa
      </BotonEnvio>
    </form>
  )
}
