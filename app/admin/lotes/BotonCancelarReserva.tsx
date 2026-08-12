'use client'

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
      <button type="submit" className="rounded border border-red-600 px-3 py-2 text-sm text-red-700">
        Cancelar reserva
      </button>
    </form>
  )
}
