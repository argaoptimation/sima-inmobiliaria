'use client'

import { BotonEnvio } from '@/components/BotonEnvio'

export function BotonEliminarLote({
  eliminarLoteAction,
  compacto = false,
}: {
  eliminarLoteAction: () => Promise<void>
  compacto?: boolean
}) {
  return (
    <form
      action={eliminarLoteAction}
      onSubmit={(evento) => {
        if (!confirm('¿Seguro que querés eliminar este lote? No se puede deshacer.')) {
          evento.preventDefault()
        }
      }}
    >
      {compacto ? (
        <BotonEnvio
          title="Eliminar lote"
          aria-label="Eliminar lote"
          className="cursor-pointer rounded-lg border border-red-600 px-2 py-1 text-sm text-red-700 transition-colors hover:bg-red-50"
          cargandoTexto="…"
        >
          🗑️
        </BotonEnvio>
      ) : (
        <BotonEnvio className="cursor-pointer rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700">
          Eliminar lote
        </BotonEnvio>
      )}
    </form>
  )
}
