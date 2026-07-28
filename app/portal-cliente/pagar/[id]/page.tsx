import { registrarPago } from './actions'

export default async function PagarCuotaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams
  const registrarPagoConId = registrarPago.bind(null, id)

  return (
    <main className="mx-auto mt-12 max-w-md p-6">
      <h1 className="mb-6 text-xl font-semibold">Registrar pago</h1>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      <form action={registrarPagoConId} className="flex flex-col gap-3">
        <input
          name="monto"
          type="number"
          step="0.01"
          min="0.01"
          placeholder="Monto transferido"
          required
          className="rounded border px-3 py-2"
        />
        <select name="moneda" required className="rounded border px-3 py-2">
          <option value="USD">USD</option>
          <option value="ARS">ARS</option>
        </select>
        <input name="comprobante" type="file" required accept="image/*,.pdf" />
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Enviar
        </button>
      </form>
    </main>
  )
}
