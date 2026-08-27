'use client'

export function BotonMarcarPrejudicial({
  marcarPrejudicialAction,
}: {
  marcarPrejudicialAction: () => Promise<void>
}) {
  return (
    <form
      action={marcarPrejudicialAction}
      onSubmit={(evento) => {
        if (
          !confirm(
            '¿Marcar este lote como Prejudicial? Es un paso manual e importante -- habilita la plantilla de WhatsApp de Prejudicial para este cliente.'
          )
        ) {
          evento.preventDefault()
        }
      }}
    >
      <button type="submit" className="rounded border border-red-700 px-3 py-2 text-sm text-red-800">
        Marcar Prejudicial
      </button>
    </form>
  )
}

export function BotonDesmarcarPrejudicial({
  desmarcarPrejudicialAction,
}: {
  desmarcarPrejudicialAction: () => Promise<void>
}) {
  return (
    <form action={desmarcarPrejudicialAction}>
      <button type="submit" className="rounded border px-3 py-2 text-sm underline">
        Sacar de Prejudicial
      </button>
    </form>
  )
}
