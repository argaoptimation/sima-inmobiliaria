import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { actualizarLoteo, crearLoteo, reasignarLotesEnBloque, subirPlantillaContrato } from './actions'
import { FiltroEnVivo } from '@/components/FiltroEnVivo'
import { CampoArchivoDirecto } from '@/components/CampoArchivoDirecto'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import { EncabezadoPagina } from '@/components/EncabezadoPagina'
import { Obligatorio } from '@/components/Obligatorio'
import {
  TARJETA,
  ENTRADA,
  BOTON_PRIMARIO,
  BOTON_SECUNDARIO,
  ENLACE,
  ENLACE_TABLA,
  TITULO_H2,
  BANNER_ERROR,
  BANNER_OK,
  TABLA_CONTENEDOR,
  TABLA_HEADER_FILA,
  TABLA_HEADER_CELDA,
  TABLA_FILA,
  TABLA_CELDA,
} from '@/lib/ui/clases'

export default async function LoteosPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string
    ok?: string
    q?: string
    ubicacion?: string
    moneda?: string
    loteoActual?: string
    placeholdersDesconocidos?: string
  }>
}) {
  const {
    error,
    ok,
    q: filtroTexto,
    ubicacion: filtroUbicacion,
    moneda: filtroMoneda,
    loteoActual,
    placeholdersDesconocidos,
  } = await searchParams

  const listaPlaceholdersDesconocidos = placeholdersDesconocidos?.split(',').filter(Boolean) ?? []

  await requireAdministrador()

  const supabase = await createClient()

  const { data: loteos } = await supabase
    .from('loteos')
    .select('id, nombre, plantilla_contrato_path, plantilla_contrato_nombre')
    .order('nombre', { ascending: true })

  const admin = createAdminClient()
  const urlPlantillaPorLoteoId = new Map<string, string>()
  for (const loteo of loteos ?? []) {
    if (!loteo.plantilla_contrato_path) continue
    const { data: signedUrl } = await admin.storage
      .from('comprobantes')
      .createSignedUrl(loteo.plantilla_contrato_path, 300)
    if (signedUrl?.signedUrl) urlPlantillaPorLoteoId.set(loteo.id, signedUrl.signedUrl)
  }

  const { data: cantidadesPorLoteo } = await supabase.from('lotes').select('loteo_id')
  const cantidadPorLoteoId = new Map<string, number>()
  let sinLoteo = 0
  for (const lote of cantidadesPorLoteo ?? []) {
    if (!lote.loteo_id) {
      sinLoteo += 1
      continue
    }
    cantidadPorLoteoId.set(lote.loteo_id, (cantidadPorLoteoId.get(lote.loteo_id) ?? 0) + 1)
  }

  let queryLotes = supabase
    .from('lotes')
    .select('id, identificador, ubicacion, moneda, estado, loteo_id')
    .order('identificador', { ascending: true })

  if (filtroTexto) {
    queryLotes = queryLotes.ilike('identificador', `%${filtroTexto}%`)
  }
  if (filtroUbicacion) {
    queryLotes = queryLotes.ilike('ubicacion', `%${filtroUbicacion}%`)
  }
  if (filtroMoneda) {
    queryLotes = queryLotes.eq('moneda', filtroMoneda)
  }
  if (loteoActual === '__sin_asignar__') {
    queryLotes = queryLotes.is('loteo_id', null)
  } else if (loteoActual) {
    queryLotes = queryLotes.eq('loteo_id', loteoActual)
  }

  const { data: lotesFiltrados } = await queryLotes

  const nombreLoteoPorId = new Map((loteos ?? []).map((loteo) => [loteo.id, loteo.nombre]))

  return (
    <main>
      <EncabezadoPagina titulo="Loteos" migas={['Loteos']} />

      {error && <p className={BANNER_ERROR}>{error}</p>}
      {ok && <p className={BANNER_OK}>{ok}</p>}
      {listaPlaceholdersDesconocidos.length > 0 && (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          ⚠ La plantilla se guardó igual, pero tiene {listaPlaceholdersDesconocidos.length === 1 ? 'un placeholder' : 'placeholders'} que no reconocemos (revisá si hay un error de tipeo, o completalo a mano en el contrato generado):{' '}
          {listaPlaceholdersDesconocidos.map((nombre, i) => (
            <span key={nombre}>
              {i > 0 && ', '}
              <code className="rounded bg-red-100 px-1 font-mono text-red-700">{`{${nombre}}`}</code>
            </span>
          ))}
        </p>
      )}

      <p className="mb-6 text-sm text-slate-600">
        Un loteo agrupa varios lotes (ej. un desarrollo o conjunto). Por ahora solo tiene nombre —
        no cambia ubicación, acreedor ni moneda de ningún lote.
      </p>

      <form action={crearLoteo} className="mb-6 flex items-end gap-2">
        <label className="text-sm text-slate-600">
          Nombre del loteo nuevo
          <Obligatorio />
          <input
            name="nombre"
            type="text"
            placeholder="Ej: Loteo San Martín *"
            required
            className={ENTRADA}
          />
        </label>
        <BotonEnvio className={`cursor-pointer ${BOTON_PRIMARIO}`}>Crear loteo</BotonEnvio>
      </form>

      <div className={`mb-10 ${TABLA_CONTENEDOR}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className={TABLA_HEADER_FILA}>
            <th className={TABLA_HEADER_CELDA}>Loteo</th>
            <th className={TABLA_HEADER_CELDA}>Cantidad de lotes</th>
            <th className={TABLA_HEADER_CELDA}>Renombrar</th>
            <th className={TABLA_HEADER_CELDA}>Plantilla de contrato</th>
          </tr>
        </thead>
        <tbody>
          {(loteos ?? []).map((loteo) => (
            <tr key={loteo.id} className={TABLA_FILA}>
              <td className={TABLA_CELDA}>
                <EnlaceBoton href={`/admin/loteos?loteoActual=${loteo.id}#lotes-filtrados`} className={ENLACE_TABLA}>
                  {loteo.nombre}
                </EnlaceBoton>
              </td>
              <td className={TABLA_CELDA}>{cantidadPorLoteoId.get(loteo.id) ?? 0}</td>
              <td className={TABLA_CELDA}>
                <form action={actualizarLoteo.bind(null, loteo.id)} className="flex gap-2">
                  <input
                    name="nombre"
                    type="text"
                    defaultValue={loteo.nombre}
                    required
                    className={ENTRADA}
                  />
                  <BotonEnvio className={`cursor-pointer ${BOTON_SECUNDARIO}`}>Guardar</BotonEnvio>
                </form>
              </td>
              <td className={TABLA_CELDA}>
                <div className="flex flex-col gap-1">
                  {loteo.plantilla_contrato_path ? (
                    <span className="text-xs text-slate-600">
                      {urlPlantillaPorLoteoId.has(loteo.id) ? (
                        <a href={urlPlantillaPorLoteoId.get(loteo.id)} target="_blank" className={ENLACE}>
                          {loteo.plantilla_contrato_nombre ?? 'Ver plantilla actual'}
                        </a>
                      ) : (
                        (loteo.plantilla_contrato_nombre ?? 'Cargada')
                      )}
                    </span>
                  ) : (
                    <span className="text-xs text-amber-700">Sin plantilla cargada</span>
                  )}
                  <form action={subirPlantillaContrato.bind(null, loteo.id)} className="flex items-center gap-2">
                    <CampoArchivoDirecto
                      name="plantilla"
                      bucket="comprobantes"
                      carpeta={`loteos/${loteo.id}`}
                      tipoArchivo="plantilla-contrato"
                      label="Plantilla de contrato"
                      accept=".docx"
                      nombreError="El archivo"
                      compacto
                      incluirNombreOriginal
                      required
                    />
                    <BotonEnvio className="cursor-pointer rounded-lg border border-blue-800 px-2 py-1 text-xs font-semibold text-blue-800 transition-colors hover:bg-blue-50">
                      {loteo.plantilla_contrato_path ? 'Reemplazar' : 'Subir'}
                    </BotonEnvio>
                  </form>
                </div>
              </td>
            </tr>
          ))}
          <tr className={`${TABLA_FILA} text-slate-600`}>
            <td className={TABLA_CELDA}>
              <EnlaceBoton href="/admin/loteos?loteoActual=__sin_asignar__#lotes-filtrados" className={ENLACE_TABLA}>
                — sin loteo asignado —
              </EnlaceBoton>
            </td>
            <td className={TABLA_CELDA}>{sinLoteo}</td>
            <td className={TABLA_CELDA}></td>
            <td className={TABLA_CELDA}></td>
          </tr>
        </tbody>
      </table>
      </div>

      <h2 className={`mb-2 ${TITULO_H2}`}>Reasignar lotes en bloque</h2>
      <p className="mb-4 text-sm text-slate-600">
        Filtrá para encontrar los lotes que querés mover, marcá los que correspondan y elegí el
        loteo de destino.
      </p>

      <FiltroEnVivo className={`mb-4 flex flex-wrap items-end gap-3 ${TARJETA}`}>
        <label className="text-sm text-slate-600">
          Identificador
          <input
            type="text"
            name="q"
            placeholder="Buscar identificador"
            defaultValue={filtroTexto ?? ''}
            className={ENTRADA}
          />
        </label>
        <label className="text-sm text-slate-600">
          Ubicación
          <input
            type="text"
            name="ubicacion"
            placeholder="Buscar ubicación"
            defaultValue={filtroUbicacion ?? ''}
            className={ENTRADA}
          />
        </label>
        <label className="text-sm text-slate-600">
          Moneda
          <select name="moneda" defaultValue={filtroMoneda ?? ''} className={ENTRADA}>
            <option value="">Todas</option>
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>
        </label>
        <label className="text-sm text-slate-600">
          Loteo actual
          <select
            name="loteoActual"
            defaultValue={loteoActual ?? ''}
            className={ENTRADA}
          >
            <option value="">Todos</option>
            <option value="__sin_asignar__">— sin loteo asignado —</option>
            {(loteos ?? []).map((loteo) => (
              <option key={loteo.id} value={loteo.id}>
                {loteo.nombre}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={`cursor-pointer ${BOTON_SECUNDARIO}`}>
          Filtrar
        </button>
        {(filtroTexto || filtroUbicacion || filtroMoneda || loteoActual) && (
          <EnlaceBoton href="/admin/loteos" className={`text-sm ${ENLACE}`}>
            Limpiar filtros
          </EnlaceBoton>
        )}
      </FiltroEnVivo>

      <form action={reasignarLotesEnBloque}>
        <div className="mb-3 flex items-end gap-2">
          <label className="text-sm text-slate-600">
            Mover los seleccionados a
            <Obligatorio />
            <select name="loteoDestino" required className={ENTRADA}>
              <option value="">— elegir loteo —</option>
              {(loteos ?? []).map((loteo) => (
                <option key={loteo.id} value={loteo.id}>
                  {loteo.nombre}
                </option>
              ))}
            </select>
          </label>
          <BotonEnvio className={`cursor-pointer ${BOTON_PRIMARIO}`}>Mover seleccionados</BotonEnvio>
        </div>

        <div className={TABLA_CONTENEDOR}>
        <table className="w-full text-sm">
          <thead>
            <tr className={TABLA_HEADER_FILA}>
              <th className={TABLA_HEADER_CELDA}></th>
              <th className={TABLA_HEADER_CELDA}>Identificador</th>
              <th className={TABLA_HEADER_CELDA}>Ubicación</th>
              <th className={TABLA_HEADER_CELDA}>Moneda</th>
              <th className={TABLA_HEADER_CELDA}>Estado</th>
              <th className={TABLA_HEADER_CELDA}>Loteo actual</th>
            </tr>
          </thead>
          <tbody>
            {(lotesFiltrados ?? []).map((lote) => (
              <tr key={lote.id} className={TABLA_FILA}>
                <td className={TABLA_CELDA}>
                  <input type="checkbox" name="loteIds" value={lote.id} />
                </td>
                <td className={TABLA_CELDA}>
                  <EnlaceBoton href={`/admin/lotes/${lote.id}`} className={ENLACE_TABLA}>
                    {lote.identificador}
                  </EnlaceBoton>
                </td>
                <td className={TABLA_CELDA}>{lote.ubicacion ?? '—'}</td>
                <td className={TABLA_CELDA}>{lote.moneda}</td>
                <td className={TABLA_CELDA}>{lote.estado}</td>
                <td className={TABLA_CELDA}>
                  {lote.loteo_id ? nombreLoteoPorId.get(lote.loteo_id) ?? '—' : '— sin asignar —'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {(lotesFiltrados ?? []).length === 0 && (
          <p className="mt-4 text-sm text-slate-600">Ningún lote coincide con este filtro.</p>
        )}
      </form>
    </main>
  )
}
