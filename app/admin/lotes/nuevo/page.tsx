import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { crearLote } from '../actions'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import { BuscadorPersona } from '@/components/BuscadorPersona'
import { Obligatorio } from '@/components/Obligatorio'
import { OPCION_ACREEDOR_NUEVO } from '@/lib/lotes/validar-seleccion-acreedor'
import { ENTRADA, BOTON_PRIMARIO, ENLACE, TITULO_H1, BANNER_ERROR } from '@/lib/ui/clases'

export default async function NuevoLotePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  // Admin-only (04/09, pedido explícito de Gabriel): antes dejaba pasar
  // también a acreedor.
  await requireAdministrador()

  const supabase = await createClient()
  const { data: acreedores } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'acreedor')
    .order('full_name')

  const { data: loteos } = await supabase.from('loteos').select('id, nombre').order('nombre')

  return (
    <main className="max-w-md">
      <EnlaceBoton href="/admin/lotes" className={`mb-4 inline-block ${ENLACE}`}>
        ← Volver a Lotes
      </EnlaceBoton>
      <h1 className={`mb-6 ${TITULO_H1}`}>Nuevo lote</h1>
      {error && <p className={BANNER_ERROR}>{error}</p>}
      <form action={crearLote} className="flex flex-col gap-3">
        <label className="text-sm text-slate-600">
          Identificador
          <Obligatorio />
          <input
            name="identificador"
            placeholder="Ej: Loteo San Martín - Manzana 3 - Lote 12"
            required
            className={`w-full ${ENTRADA}`}
          />
        </label>
        <label className="text-sm text-slate-600">
          Ubicación
          <Obligatorio />
          <input name="ubicacion" required className={`w-full ${ENTRADA}`} />
        </label>
        <label className="text-sm text-slate-600">
          Precio total del lote
          <Obligatorio />
          <input
            name="precioTotal"
            type="number"
            step="0.01"
            min="0"
            required
            className={`w-full ${ENTRADA}`}
          />
        </label>
        <label className="text-sm text-slate-600">
          Moneda
          <Obligatorio />
          <select name="moneda" required className={`w-full ${ENTRADA}`}>
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>
        </label>

        <label className="text-sm text-slate-600">
          Acreedor
          <Obligatorio />
          {/* Buscador con datalist en vez de <select> (04/09, pedido de
              Gabriel): con el select largo, tipear "JO" saltaba de la J a
              la O en vez de filtrar. Lo que viaja es el NOMBRE; crearLote
              lo resuelve contra la base. La opción de crear uno nuevo
              sigue existiendo, ahora como una opción más del buscador. */}
          <BuscadorPersona
            personas={acreedores ?? []}
            name="acreedorNombre"
            listId="lista-acreedores-nuevo-lote"
            placeholder="Escribí parte del nombre y elegí de la lista..."
            opcionesExtra={[{ etiqueta: OPCION_ACREEDOR_NUEVO }]}
            requerido
          />
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

        <label className="text-sm text-slate-600">
          Loteo (opcional)
          <select name="loteoId" defaultValue="" className={`w-full ${ENTRADA}`}>
            <option value="">— sin loteo —</option>
            {(loteos ?? []).map((loteo) => (
              <option key={loteo.id} value={loteo.id}>
                {loteo.nombre}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-slate-500">
            El loteo define qué plantilla de contrato se usa. Se puede asignar después.
          </span>
        </label>

        {/* Estos campos ya se podían cargar desde el detalle del lote, pero
            no al crearlo -- incongruencia reportada por Gabriel 04/09. Van
            opcionales: hacen falta recién para generar el contrato. */}
        <p className="mt-2 text-sm font-medium text-slate-700">
          Datos legales del lote (opcionales — solo hacen falta para generar el contrato)
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-slate-600">
            Número de lote
            <input name="numeroLote" className={`w-full ${ENTRADA}`} />
          </label>
          <label className="text-sm text-slate-600">
            Manzana
            <input name="manzana" className={`w-full ${ENTRADA}`} />
          </label>
          <label className="text-sm text-slate-600">
            Superficie (m2)
            <input name="superficieM2" type="number" step="0.01" min="0" className={`w-full ${ENTRADA}`} />
          </label>
          <label className="text-sm text-slate-600">
            Cuenta en rentas
            <input name="cuentaRentas" className={`w-full ${ENTRADA}`} />
          </label>
          <label className="text-sm text-slate-600">
            Nomenclatura catastral
            <input name="nomenclaturaCatastral" className={`w-full ${ENTRADA}`} />
          </label>
          <label className="text-sm text-slate-600">
            Matrícula
            <input name="matricula" className={`w-full ${ENTRADA}`} />
          </label>
        </div>

        <BotonEnvio className={`cursor-pointer self-start ${BOTON_PRIMARIO}`}>Crear lote</BotonEnvio>
      </form>
    </main>
  )
}
