'use client'

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
      <button type="submit" className="rounded border border-red-600 px-3 py-2 text-sm text-red-700">
        Eliminar cuenta externa
      </button>
    </form>
  )
}
