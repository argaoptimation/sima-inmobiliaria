'use client'

export function BotonRescindir({ rescindirAction }: { rescindirAction: () => Promise<void> }) {
  return (
    <form
      action={rescindirAction}
      onSubmit={(evento) => {
        if (
          !confirm(
            '¿Seguro que querés rescindir este lote? Pasa a "rescindido" -- después vas a poder ponerlo disponible de nuevo para venderlo.'
          )
        ) {
          evento.preventDefault()
        }
      }}
    >
      <button type="submit" className="rounded border border-red-600 px-3 py-2 text-sm text-red-700">
        Rescindir
      </button>
    </form>
  )
}
