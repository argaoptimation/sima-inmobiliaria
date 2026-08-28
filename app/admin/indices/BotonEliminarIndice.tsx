'use client'

import { BotonEnvio } from '@/components/BotonEnvio'

export function BotonEliminarIndice({
  eliminarValorIndiceAction,
  nombre,
  periodo,
  cantidadLotesAfectados,
}: {
  eliminarValorIndiceAction: (formData: FormData) => Promise<void>
  nombre: string
  periodo: string
  cantidadLotesAfectados: number
}) {
  return (
    <form
      action={eliminarValorIndiceAction}
      onSubmit={(evento) => {
        const aviso =
          cantidadLotesAfectados > 0
            ? `¿Seguro que querés eliminar "${nombre}" de ese mes? Esto revierte el ajuste en ${cantidadLotesAfectados} lote${cantidadLotesAfectados === 1 ? '' : 's'} que ya lo usaron.`
            : `¿Seguro que querés eliminar "${nombre}" de ese mes? Por ahora ningún lote lo usó todavía.`
        if (!confirm(aviso)) {
          evento.preventDefault()
        }
      }}
    >
      <input type="hidden" name="nombre" value={nombre} />
      <input type="hidden" name="periodo" value={periodo} />
      <BotonEnvio className="cursor-pointer rounded-lg border border-red-600 px-2 py-1 text-red-700 transition-colors hover:bg-red-50">
        Eliminar
      </BotonEnvio>
    </form>
  )
}
