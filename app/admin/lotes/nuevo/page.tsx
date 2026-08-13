import { createClient } from '@/lib/supabase/server'
import { requireAdminOAcreedor } from '@/lib/auth/require-admin'
import { crearLote } from '../actions'

export default async function NuevoLotePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  await requireAdminOAcreedor()

  const supabase = await createClient()
  const { data: acreedores } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'acreedor')
    .order('full_name')

  return (
    <main className="max-w-md">
      <a href="/admin/lotes" className="mb-4 inline-block text-sm underline">
        ← Volver a Lotes
      </a>
      <h1 className="mb-6 text-xl font-semibold">Nuevo lote</h1>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      <form action={crearLote} className="flex flex-col gap-3">
        <input
          name="identificador"
          placeholder="Identificador (ej: Loteo San Martín - Manzana 3 - Lote 12)"
          required
          className="rounded border px-3 py-2"
        />
        <input
          name="ubicacion"
          placeholder="Ubicación"
          required
          className="rounded border px-3 py-2"
        />
        <input
          name="precioTotal"
          type="number"
          step="0.01"
          min="0"
          placeholder="Precio total del lote"
          required
          className="rounded border px-3 py-2"
        />
        <select name="moneda" required className="rounded border px-3 py-2">
          <option value="USD">USD</option>
          <option value="ARS">ARS</option>
        </select>

        <label className="text-sm">
          Acreedor
          <select
            name="acreedorId"
            required
            defaultValue=""
            className="mt-1 block w-full rounded border px-3 py-2"
          >
            <option value="" disabled>
              — Elegí un acreedor —
            </option>
            {(acreedores ?? []).map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.full_name}
              </option>
            ))}
            <option value="__nuevo__">+ Crear nuevo acreedor</option>
          </select>
        </label>
        <input
          name="acreedorNombreNuevo"
          placeholder="Si elegiste 'Crear nuevo acreedor': nombre completo"
          className="rounded border px-3 py-2"
        />
        <input
          name="acreedorEmailNuevo"
          type="email"
          placeholder="Si elegiste 'Crear nuevo acreedor': email"
          className="rounded border px-3 py-2"
        />

        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Crear lote
        </button>
      </form>
    </main>
  )
}
