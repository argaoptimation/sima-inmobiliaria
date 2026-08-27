'use client'

export function BotonEliminarPago({
  eliminarPagoAction,
}: {
  eliminarPagoAction: () => Promise<void>
}) {
  return (
    <form
      action={eliminarPagoAction}
      onSubmit={(evento) => {
        if (!confirm('¿Eliminar este pago? Usalo si te confundiste o lo cargaste de más.')) {
          evento.preventDefault()
        }
      }}
    >
      <button
        type="submit"
        title="Eliminar pago"
        aria-label="Eliminar pago"
        className="cursor-pointer rounded-lg px-2 py-1 text-base leading-none text-red-600 transition-colors hover:bg-red-50"
      >
        🗑️
      </button>
    </form>
  )
}
