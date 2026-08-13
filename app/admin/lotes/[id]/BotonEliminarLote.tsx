'use client'

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
        <button
          type="submit"
          title="Eliminar lote"
          aria-label="Eliminar lote"
          className="rounded border border-red-600 px-2 py-1 text-sm text-red-700"
        >
          🗑️
        </button>
      ) : (
        <button type="submit" className="rounded bg-red-600 px-3 py-2 text-sm text-white">
          Eliminar lote
        </button>
      )}
    </form>
  )
}
