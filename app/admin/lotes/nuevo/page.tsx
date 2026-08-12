import { requireAdminOAcreedor } from '@/lib/auth/require-admin'
import { crearLote } from '../actions'

export default async function NuevoLotePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  await requireAdminOAcreedor()

  return (
    <main className="max-w-md">
      <h1 className="mb-6 text-xl font-semibold">Nuevo lote</h1>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      <form action={crearLote} className="flex flex-col gap-3">
        <input
          name="identificador"
          placeholder="Identificador (ej: Loteo San Martín - Manzana 3 - Lote 12)"
          required
          className="rounded border px-3 py-2"
        />
        <select name="moneda" required className="rounded border px-3 py-2">
          <option value="USD">USD</option>
          <option value="ARS">ARS</option>
        </select>
        <input
          name="cantidadCuotas"
          type="number"
          min="1"
          placeholder="Cantidad de cuotas"
          required
          className="rounded border px-3 py-2"
        />
        <input
          name="montoCuotaBase"
          type="number"
          step="0.01"
          min="0"
          placeholder="Monto de cada cuota"
          required
          className="rounded border px-3 py-2"
        />
        <input name="fechaPrimeraCuota" type="date" required className="rounded border px-3 py-2" />
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Crear lote
        </button>
      </form>
    </main>
  )
}
