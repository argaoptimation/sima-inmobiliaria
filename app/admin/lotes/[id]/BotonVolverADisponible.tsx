'use client'

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
      <button type="submit" className="rounded bg-black px-3 py-2 text-sm text-white">
        Volver a disponible
      </button>
    </form>
  )
}
