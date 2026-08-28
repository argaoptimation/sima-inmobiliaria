'use client'

import { BotonEnvio } from '@/components/BotonEnvio'

export function BotonEliminarUsuario({
  eliminarUsuarioAction,
}: {
  eliminarUsuarioAction: () => Promise<void>
}) {
  return (
    <form
      action={eliminarUsuarioAction}
      onSubmit={(evento) => {
        if (
          !confirm(
            '¿Seguro que querés eliminar esta cuenta? No se puede deshacer.'
          )
        ) {
          evento.preventDefault()
        }
      }}
    >
      <BotonEnvio
        title="Eliminar usuario"
        aria-label="Eliminar usuario"
        className="cursor-pointer rounded-lg border border-red-600 px-2 py-1 text-sm text-red-700 transition-colors hover:bg-red-50"
        cargandoTexto="…"
      >
        🗑️
      </BotonEnvio>
    </form>
  )
}
