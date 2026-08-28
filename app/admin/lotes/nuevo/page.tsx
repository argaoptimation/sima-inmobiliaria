import { createClient } from '@/lib/supabase/server'
import { requireAdminOAcreedor } from '@/lib/auth/require-admin'
import { crearLote } from '../actions'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import { ENTRADA, BOTON_PRIMARIO, ENLACE, TITULO_H1, BANNER_ERROR } from '@/lib/ui/clases'

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
      <EnlaceBoton href="/admin/lotes" className={`mb-4 inline-block ${ENLACE}`}>
        ← Volver a Lotes
      </EnlaceBoton>
      <h1 className={`mb-6 ${TITULO_H1}`}>Nuevo lote</h1>
      {error && <p className={BANNER_ERROR}>{error}</p>}
      <form action={crearLote} className="flex flex-col gap-3">
        <input
          name="identificador"
          placeholder="Identificador (ej: Loteo San Martín - Manzana 3 - Lote 12)"
          required
          className={ENTRADA}
        />
        <input name="ubicacion" placeholder="Ubicación" required className={ENTRADA} />
        <input
          name="precioTotal"
          type="number"
          step="0.01"
          min="0"
          placeholder="Precio total del lote"
          required
          className={ENTRADA}
        />
        <select name="moneda" required className={ENTRADA}>
          <option value="USD">USD</option>
          <option value="ARS">ARS</option>
        </select>

        <label className="text-sm text-slate-600">
          Acreedor
          <select name="acreedorId" required defaultValue="" className={`${ENTRADA} w-full`}>
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
          className={ENTRADA}
        />
        <input
          name="acreedorEmailNuevo"
          type="email"
          placeholder="Si elegiste 'Crear nuevo acreedor': email"
          className={ENTRADA}
        />

        <BotonEnvio className={`cursor-pointer ${BOTON_PRIMARIO}`}>Crear lote</BotonEnvio>
      </form>
    </main>
  )
}
