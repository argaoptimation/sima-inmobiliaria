'use client'

export function BotonEliminarLote({
  eliminarLoteAction,
}: {
  eliminarLoteAction: () => Promise<void>
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
      <button type="submit" className="rounded bg-red-600 px-3 py-2 text-sm text-white">
        Eliminar lote
      </button>
    </form>
  )
}
