import { aplicarIndexacion } from './actions'

export default async function IndexarLotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const aplicarIndexacionConId = aplicarIndexacion.bind(null, id)

  return (
    <main className="max-w-md">
      <h1 className="mb-6 text-xl font-semibold">Aplicar ajuste por índice</h1>
      <form action={aplicarIndexacionConId} className="flex flex-col gap-3">
        <input
          name="porcentaje"
          type="number"
          step="0.001"
          placeholder="Porcentaje de ajuste (ej: 8.5)"
          required
          className="rounded border px-3 py-2"
        />
        <input name="fechaDesde" type="date" required className="rounded border px-3 py-2" />
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Aplicar
        </button>
      </form>
    </main>
  )
}
