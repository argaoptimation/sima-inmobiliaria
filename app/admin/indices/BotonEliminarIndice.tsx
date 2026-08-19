'use client'

export function BotonEliminarIndice({
  eliminarValorIndiceAction,
  nombre,
  periodo,
}: {
  eliminarValorIndiceAction: (formData: FormData) => Promise<void>
  nombre: string
  periodo: string
}) {
  return (
    <form
      action={eliminarValorIndiceAction}
      onSubmit={(evento) => {
        if (
          !confirm(
            `¿Seguro que querés eliminar "${nombre}" de ese mes? Si ya se aplicó a alguna cuota pendiente, se revierte el ajuste.`
          )
        ) {
          evento.preventDefault()
        }
      }}
    >
      <input type="hidden" name="nombre" value={nombre} />
      <input type="hidden" name="periodo" value={periodo} />
      <button type="submit" className="rounded border border-red-600 px-2 py-1 text-red-700">
        Eliminar
      </button>
    </form>
  )
}
