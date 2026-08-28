'use client'

import { BotonEnvio } from '@/components/BotonEnvio'
import { BOTON_PRIMARIO } from '@/lib/ui/clases'

export function BotonVolverADisponible({
  volverADisponibleAction,
}: {
  volverADisponibleAction: () => Promise<void>
}) {
  return (
    <form
      action={volverADisponibleAction}
      onSubmit={(evento) => {
        if (
          !confirm(
            '¿Pasar este lote a "disponible"? Queda listo para venderse de nuevo (se saca el cliente asignado; las cuotas y pagos del ciclo anterior quedan como historial).'
          )
        ) {
          evento.preventDefault()
        }
      }}
    >
      <BotonEnvio className={`cursor-pointer ${BOTON_PRIMARIO}`}>Volver a disponible</BotonEnvio>
    </form>
  )
}
