'use client'

import { Trash2 } from 'lucide-react'
import { BotonEnvio } from '@/components/BotonEnvio'
import { BOTON_ICONO_PELIGRO } from '@/lib/ui/clases'

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
        // Variante de fila (rediseño Stitch 2026-09): ícono gris que recién
        // se pone rojo al pasar por encima. En una tabla de 180 filas, 180
        // tachos rojos gritando "borrame" son ruido -- el color de peligro
        // se gana cuando la mano ya está sobre el botón.
        <BotonEnvio
          title="Eliminar lote"
          aria-label="Eliminar lote"
          className={BOTON_ICONO_PELIGRO}
          cargandoTexto="…"
        >
          <Trash2 className="h-[17px] w-[17px]" />
        </BotonEnvio>
      ) : (
        <BotonEnvio className="cursor-pointer rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700">
          Eliminar lote
        </BotonEnvio>
      )}
    </form>
  )
}
