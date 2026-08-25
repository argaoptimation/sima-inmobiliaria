'use client'

const VALOR_SOSPECHOSO = 50

export function FormularioCorregirIndice({
  corregirValorIndiceAction,
  nombre,
  periodo,
  valorActual,
  cantidadLotesAfectados,
}: {
  corregirValorIndiceAction: (formData: FormData) => Promise<void>
  nombre: string
  periodo: string
  valorActual: number
  cantidadLotesAfectados: number
}) {
  return (
    <form
      action={corregirValorIndiceAction}
      className="flex items-center gap-2"
      onSubmit={(evento) => {
        const formulario = evento.currentTarget
        const valorNuevo = Number(new FormData(formulario).get('valorNuevo'))
        const partesAviso = [
          cantidadLotesAfectados > 0
            ? `Esto va a recalcular las cuotas de ${cantidadLotesAfectados} lote${cantidadLotesAfectados === 1 ? '' : 's'} que ya usaron este valor.`
            : 'Por ahora ningún lote usó todavía este valor, pero puede afectar cuotas que se carguen después.',
          Number.isFinite(valorNuevo) && Math.abs(valorNuevo) >= VALOR_SOSPECHOSO
            ? `${valorNuevo}% es un valor inusualmente alto o negativo — revisá que no sea un error de tipeo.`
            : null,
        ].filter(Boolean)
        if (!confirm(`${partesAviso.join(' ')} ¿Confirmás la corrección?`)) {
          evento.preventDefault()
        }
      }}
    >
      <input type="hidden" name="nombre" value={nombre} />
      <input type="hidden" name="periodo" value={periodo} />
      <input
        name="valorNuevo"
        type="number"
        step="0.01"
        defaultValue={valorActual}
        required
        className="w-24 rounded border px-2 py-1"
      />
      <button type="submit" className="rounded border px-2 py-1">
        Corregir
      </button>
    </form>
  )
}
