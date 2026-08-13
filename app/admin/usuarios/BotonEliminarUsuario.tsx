'use client'

export function BotonEliminarUsuario({
  eliminarUsuarioAction,
}: {
  eliminarUsuarioAction: () => Promise<void>
}) {
  return (
    <form
      action={eliminarUsuarioAction}
      onSubmit={(evento) => {
        if (
          !confirm(
            '¿Seguro que querés eliminar esta cuenta? No se puede deshacer.'
          )
        ) {
          evento.preventDefault()
        }
      }}
    >
      <button
        type="submit"
        title="Eliminar usuario"
        aria-label="Eliminar usuario"
        className="rounded border border-red-600 px-2 py-1 text-sm text-red-700"
      >
        🗑️
      </button>
    </form>
  )
}
