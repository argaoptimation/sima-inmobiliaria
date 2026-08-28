'use client'

import { BotonEnvio } from '@/components/BotonEnvio'

export function BotonCancelarReserva({
  cancelarReservaAction,
}: {
  cancelarReservaAction: () => Promise<void>
}) {
  return (
    <form
      action={cancelarReservaAction}
      onSubmit={(evento) => {
        if (
          !confirm(
            '¿Seguro que querés cancelar esta reserva? El lote vuelve a quedar disponible.'
          )
        ) {
          evento.preventDefault()
        }
      }}
    >
      <BotonEnvio className="cursor-pointer rounded-lg border border-red-600 px-3 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50">
        Cancelar reserva
      </BotonEnvio>
    </form>
  )
}
