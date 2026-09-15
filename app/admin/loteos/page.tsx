import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { traerTodasLasFilas } from '@/lib/supabase/traer-todas-las-filas'
import { actualizarLoteo, crearLoteo, reasignarLotesEnBloque, subirPlantillaContrato } from './actions'
import { FiltroEnVivo } from '@/components/FiltroEnVivo'
import { CampoArchivoDirecto } from '@/components/CampoArchivoDirecto'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import { ArrowDown, ArrowLeftRight, Eye, FileText, LayoutGrid, Plus } from 'lucide-react'
import {
  BANNER_ERROR,
  BANNER_OK,
  ENLACE,
  PANEL,
  PANEL_SIN_PADDING,
  PILL_ESTADO,
  PILL_ESTADO_NEUTRO,
  PILL_MONEDA_ARS,
  PILL_MONEDA_USD,
  CABECERA_MODULO_ICONO,
  CABECERA_MODULO_TITULO,
  CABECERA_MODULO_BAJADA,
  CABECERA_MODULO_RESUMEN,
  CAMPO_COMPACTO,
  ETIQUETA_COMPACTA,
  TABLA_OSCURA_HEADER,
  TABLA_OSCURA_TH,
  TABLA_CLARA_HEADER,
  TABLA_CLARA_TH,
  TABLA_COMPACTA_TD,
  BOTON_CHICO_NEUTRO,
  BOTON_CHICO_PRIMARIO,
  BOTON_CHICO_AZUL_SUAVE,
  BOTON_ICONO_AZUL,
  CONTADOR_LOTES,
  CONTADOR_LOTES_PENDIENTES,
} from '@/lib/ui/clases'

// Loteos (15/09, mockup 5 de Stitch). Del mockup se tomo el diseño y nada
// mas, como pidio Gabriel el 09/09 ("no agregues cosas de funcionamiento que
// no hayamos diseñado"). Quedaron afuera, a proposito, cuatro cosas que el
// mockup dibuja y la pantalla no hace: el buscador de loteos por nombre, la
// ubicacion debajo de cada loteo (un loteo no tiene ubicacion), la casilla
// para marcar todos los lotes y la opcion "quitar asignacion" al mover.
// Ver design-system/mockups/stitch-2026-09/README.md.
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

  // Paginado (15/09): PostgREST corta en 1000 filas sin avisar, y con la
  // cartera de Nico cargada el conteo por loteo iba a quedarse corto justo
  // en los loteos grandes. Ver lib/supabase/traer-todas-las-filas.ts.
  const cantidadesPorLoteo = await traerTodasLasFilas<{ loteo_id: string | null }>(
    (desde, hasta) => supabase.from('lotes').select('loteo_id').order('id').range(desde, hasta)
  )
  const cantidadPorLoteoId = new Map<string, number>()
  let sinLoteo = 0
  for (const lote of cantidadesPorLoteo) {
    if (!lote.loteo_id) {
      sinLoteo += 1
      continue
    }
    cantidadPorLoteoId.set(lote.loteo_id, (cantidadPorLoteoId.get(lote.loteo_id) ?? 0) + 1)
  }

  // La consulta se arma de nuevo para cada pagina: un query builder de
  // supabase-js ya awaiteado no se vuelve a pedir con otro rango.
  function consultaLotesFiltrados() {
    let consulta = supabase
      .from('lotes')
      .select('id, identificador, ubicacion, moneda, estado, loteo_id')

    if (filtroTexto) {
      consulta = consulta.ilike('identificador', `%${filtroTexto}%`)
    }
    if (filtroUbicacion) {
      consulta = consulta.ilike('ubicacion', `%${filtroUbicacion}%`)
    }
    if (filtroMoneda) {
      consulta = consulta.eq('moneda', filtroMoneda)
    }
    if (loteoActual === '__sin_asignar__') {
      consulta = consulta.is('loteo_id', null)
    } else if (loteoActual) {
      consulta = consulta.eq('loteo_id', loteoActual)
    }

    return consulta.order('identificador', { ascending: true }).order('id')
  }

  const lotesFiltrados = await traerTodasLasFilas<{
    id: string
    identificador: string
    ubicacion: string | null
    moneda: string
    estado: string
    loteo_id: string | null
  }>((desde, hasta) => consultaLotesFiltrados().range(desde, hasta))

  const nombreLoteoPorId = new Map((loteos ?? []).map((loteo) => [loteo.id, loteo.nombre]))
  const cantidadLoteos = (loteos ?? []).length
  const hayFiltros = Boolean(filtroTexto || filtroUbicacion || filtroMoneda || loteoActual)

  return (
    <main className="space-y-6">
      {/* Cabecera del modulo: icono, titulo, para que sirve la pantalla y,
          a la derecha, los tres numeros que la resumen. */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className={CABECERA_MODULO_ICONO}>
            <LayoutGrid className="h-5 w-5" />
          </span>
          <div>
            <h1 className={CABECERA_MODULO_TITULO}>Loteos</h1>
            <p className={CABECERA_MODULO_BAJADA}>
              Un loteo agrupa varios lotes (un desarrollo o conjunto). Acá se administran los
              nombres, la plantilla de contrato .docx y a qué loteo pertenece cada lote. No cambia
              ubicación, acreedor ni moneda de ningún lote.
            </p>
          </div>
        </div>
        <p data-testid="resumen-loteos" className={CABECERA_MODULO_RESUMEN}>
          <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" />
          {cantidadLoteos} {cantidadLoteos === 1 ? 'loteo' : 'loteos'} ·{' '}
          {cantidadesPorLoteo.length} {cantidadesPorLoteo.length === 1 ? 'lote' : 'lotes'} ·{' '}
          {sinLoteo} sin asignar
        </p>
      </div>

      {error && <p className={BANNER_ERROR}>{error}</p>}
      {ok && <p className={BANNER_OK}>{ok}</p>}
      {listaPlaceholdersDesconocidos.length > 0 && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          ⚠ La plantilla se guardó igual, pero tiene {listaPlaceholdersDesconocidos.length === 1 ? 'un placeholder' : 'placeholders'} que no reconocemos (revisá si hay un error de tipeo, o completalo a mano en el contrato generado):{' '}
          {listaPlaceholdersDesconocidos.map((nombre, i) => (
            <span key={nombre}>
              {i > 0 && ', '}
              <code className="rounded bg-red-100 px-1 font-mono text-red-700">{`{${nombre}}`}</code>
            </span>
          ))}
        </p>
      )}

      {/* Crear un loteo. En el mockup comparte la barra con un buscador de
          loteos que la pantalla no tiene: ver el comentario de arriba. */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <form
          action={crearLoteo}
          data-testid="crear-loteo"
          className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end"
        >
          <label className="sr-only" htmlFor="nombre-loteo-nuevo">
            Nombre del loteo nuevo
          </label>
          <input
            id="nombre-loteo-nuevo"
            name="nombre"
            type="text"
            placeholder="Nombre del nuevo loteo..."
            required
            className={`${CAMPO_COMPACTO} sm:w-72`}
          />
          <BotonEnvio className={`cursor-pointer justify-center ${BOTON_CHICO_PRIMARIO}`}>
            <Plus className="h-4 w-4" />
            Crear nuevo loteo
          </BotonEnvio>
        </form>
      </div>

      <div className={PANEL_SIN_PADDING}>
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50/60 px-5 py-3.5">
          <h2 className="text-xs font-bold tracking-wider text-slate-800 uppercase">
            Listado de desarrollos y loteos
          </h2>
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
            {cantidadLoteos} {cantidadLoteos === 1 ? 'loteo' : 'loteos'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className={TABLA_OSCURA_HEADER}>
              <tr>
                <th className={TABLA_OSCURA_TH}>Loteo</th>
                <th className={`${TABLA_OSCURA_TH} w-36 text-center`}>Cantidad de lotes</th>
                <th className={`${TABLA_OSCURA_TH} w-72`}>Renombrar</th>
                <th className={TABLA_OSCURA_TH}>Plantilla de contrato (.docx)</th>
                <th className={`${TABLA_OSCURA_TH} w-20 text-center`}>Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(loteos ?? []).map((loteo) => {
                const cantidad = cantidadPorLoteoId.get(loteo.id) ?? 0
                const verSusLotes = `/admin/loteos?loteoActual=${loteo.id}#lotes-filtrados`
                return (
                  <tr key={loteo.id} className="transition hover:bg-slate-50/80">
                    <td className="px-4 py-3.5">
                      <EnlaceBoton
                        href={verSusLotes}
                        className="text-sm font-bold text-blue-600 hover:underline"
                      >
                        {loteo.nombre}
                      </EnlaceBoton>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={CONTADOR_LOTES}>
                        {cantidad} {cantidad === 1 ? 'lote' : 'lotes'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <form action={actualizarLoteo.bind(null, loteo.id)} className="flex items-center gap-1.5">
                        <input
                          name="nombre"
                          type="text"
                          defaultValue={loteo.nombre}
                          required
                          aria-label={`Nombre del loteo ${loteo.nombre}`}
                          className={`${CAMPO_COMPACTO} bg-white`}
                        />
                        <BotonEnvio className={`cursor-pointer ${BOTON_CHICO_NEUTRO}`}>Guardar</BotonEnvio>
                      </form>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-1.5">
                        {loteo.plantilla_contrato_path ? (
                          urlPlantillaPorLoteoId.has(loteo.id) ? (
                            <a
                              href={urlPlantillaPorLoteoId.get(loteo.id)}
                              target="_blank"
                              className="flex w-fit items-center gap-1 font-medium text-blue-600 hover:underline"
                            >
                              <FileText className="h-4 w-4 shrink-0" />
                              {loteo.plantilla_contrato_nombre ?? 'Ver plantilla actual'}
                            </a>
                          ) : (
                            <span className="flex items-center gap-1 text-slate-600">
                              <FileText className="h-4 w-4 shrink-0" />
                              {loteo.plantilla_contrato_nombre ?? 'Cargada'}
                            </span>
                          )
                        ) : (
                          <span className="flex w-fit items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            Sin plantilla cargada
                          </span>
                        )}
                        <form
                          action={subirPlantillaContrato.bind(null, loteo.id)}
                          className="flex items-center gap-2"
                        >
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
                          <BotonEnvio
                            className={`cursor-pointer ${
                              loteo.plantilla_contrato_path ? BOTON_CHICO_NEUTRO : BOTON_CHICO_AZUL_SUAVE
                            }`}
                          >
                            {loteo.plantilla_contrato_path ? 'Reemplazar' : 'Subir .docx'}
                          </BotonEnvio>
                        </form>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <EnlaceBoton
                        href={verSusLotes}
                        className={BOTON_ICONO_AZUL}
                        title="Ver los lotes de este loteo"
                        aria-label={`Ver los lotes de ${loteo.nombre}`}
                      >
                        <Eye className="h-4 w-4" />
                      </EnlaceBoton>
                    </td>
                  </tr>
                )
              })}
              <tr className="bg-slate-50/50 transition hover:bg-slate-100/60">
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <EnlaceBoton
                      href="/admin/loteos?loteoActual=__sin_asignar__#lotes-filtrados"
                      className="font-medium whitespace-nowrap text-slate-600 italic hover:underline"
                    >
                      — sin loteo asignado —
                    </EnlaceBoton>
                    {sinLoteo > 0 && (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                        Pendientes
                      </span>
                    )}
                  </div>
                  <span className="block text-[11px] text-slate-400">
                    Lotes cargados sin un loteo
                  </span>
                </td>
                <td className="px-4 py-3.5 text-center">
                  <span className={sinLoteo > 0 ? CONTADOR_LOTES_PENDIENTES : CONTADOR_LOTES}>
                    {sinLoteo} {sinLoteo === 1 ? 'lote' : 'lotes'}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-[11px] text-slate-400 italic">No aplica renombrado</td>
                <td className="px-4 py-3.5 text-[11px] text-slate-400 italic">
                  Sin loteo no hay plantilla: el contrato sale de la del loteo
                </td>
                <td className="px-4 py-3.5 text-center">
                  <EnlaceBoton
                    href="/admin/loteos?loteoActual=__sin_asignar__#lotes-filtrados"
                    className="inline-flex items-center justify-center rounded-lg p-1.5 text-amber-700 transition hover:bg-amber-100 hover:text-amber-800"
                    title="Reasignarlos abajo"
                    aria-label="Ver los lotes sin loteo para reasignarlos"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </EnlaceBoton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <section id="lotes-filtrados" className={`${PANEL} space-y-4`}>
        <div className="flex flex-col gap-2 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-slate-900">
              <ArrowLeftRight className="h-4 w-4 text-blue-600" />
              Reasignar lotes en bloque
            </h2>
            <p className="text-xs text-slate-500">
              Filtrá para encontrar los lotes que querés mover, marcá los que correspondan y elegí el
              loteo de destino.
            </p>
          </div>
          <span className="text-xs font-medium text-slate-500">
            Mostrando {lotesFiltrados.length} {lotesFiltrados.length === 1 ? 'lote' : 'lotes'}
          </span>
        </div>

        <FiltroEnVivo className="grid grid-cols-1 gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className={ETIQUETA_COMPACTA}>Identificador</span>
            <input
              type="text"
              name="q"
              placeholder="Ej: Mza 4 - Lote 12"
              defaultValue={filtroTexto ?? ''}
              className={`${CAMPO_COMPACTO} bg-white`}
            />
          </label>
          <label className="block">
            <span className={ETIQUETA_COMPACTA}>Ubicación</span>
            <input
              type="text"
              name="ubicacion"
              placeholder="Buscar ubicación"
              defaultValue={filtroUbicacion ?? ''}
              className={`${CAMPO_COMPACTO} bg-white`}
            />
          </label>
          <label className="block">
            <span className={ETIQUETA_COMPACTA}>Moneda</span>
            <select name="moneda" defaultValue={filtroMoneda ?? ''} className={`${CAMPO_COMPACTO} bg-white`}>
              <option value="">Todas (USD / ARS)</option>
              <option value="USD">USD</option>
              <option value="ARS">ARS</option>
            </select>
          </label>
          <label className="block">
            <span className={ETIQUETA_COMPACTA}>Loteo actual</span>
            <select
              name="loteoActual"
              defaultValue={loteoActual ?? ''}
              className={`${CAMPO_COMPACTO} bg-white`}
            >
              <option value="">Todos los loteos</option>
              <option value="__sin_asignar__">— sin loteo asignado — ({sinLoteo})</option>
              {(loteos ?? []).map((loteo) => (
                <option key={loteo.id} value={loteo.id}>
                  {loteo.nombre}
                </option>
              ))}
            </select>
          </label>
          {/* El filtro se aplica solo mientras se tipea (FiltroEnVivo). El
              boton queda para quien aprieta Enter o navega sin mouse. */}
          <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
            <button type="submit" className={`cursor-pointer ${BOTON_CHICO_NEUTRO}`}>
              Filtrar
            </button>
            {hayFiltros && (
              <EnlaceBoton href="/admin/loteos#lotes-filtrados" className={`text-xs ${ENLACE}`}>
                Limpiar filtros
              </EnlaceBoton>
            )}
          </div>
        </FiltroEnVivo>

        <form action={reasignarLotesEnBloque} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200/80 bg-blue-50/70 p-3">
            <label className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-blue-900">Mover los seleccionados a:</span>
              <select
                name="loteoDestino"
                required
                className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs text-slate-800 focus:ring-2 focus:ring-blue-600/20 focus:outline-none"
              >
                <option value="">— elegir loteo destino —</option>
                {(loteos ?? []).map((loteo) => (
                  <option key={loteo.id} value={loteo.id}>
                    {loteo.nombre}
                  </option>
                ))}
              </select>
            </label>
            <BotonEnvio className={`cursor-pointer ${BOTON_CHICO_PRIMARIO}`}>Mover seleccionados</BotonEnvio>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full border-collapse text-left text-xs">
              <thead className={TABLA_CLARA_HEADER}>
                <tr>
                  <th className={`${TABLA_CLARA_TH} w-10 text-center`}>
                    <span className="sr-only">Seleccionar</span>
                  </th>
                  <th className={TABLA_CLARA_TH}>Identificador de lote</th>
                  <th className={TABLA_CLARA_TH}>Ubicación</th>
                  <th className={TABLA_CLARA_TH}>Moneda</th>
                  <th className={TABLA_CLARA_TH}>Estado</th>
                  <th className={TABLA_CLARA_TH}>Loteo actual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lotesFiltrados.map((lote) => (
                  // La fila marcada se tiñe sola, sin JavaScript: `has-[:checked]`
                  // mira la casilla de adentro.
                  <tr
                    key={lote.id}
                    className="transition hover:bg-slate-50/80 has-[:checked]:bg-amber-50/40"
                  >
                    <td className={`${TABLA_COMPACTA_TD} text-center`}>
                      <input
                        type="checkbox"
                        name="loteIds"
                        value={lote.id}
                        aria-label={`Seleccionar ${lote.identificador}`}
                        className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-blue-600"
                      />
                    </td>
                    <td className={TABLA_COMPACTA_TD}>
                      <EnlaceBoton
                        href={`/admin/lotes/${lote.id}`}
                        className="font-semibold text-slate-800 hover:text-blue-700 hover:underline"
                      >
                        {lote.identificador}
                      </EnlaceBoton>
                    </td>
                    <td className={`${TABLA_COMPACTA_TD} text-slate-600`}>{lote.ubicacion ?? '—'}</td>
                    <td className={TABLA_COMPACTA_TD}>
                      <span className={lote.moneda === 'ARS' ? PILL_MONEDA_ARS : PILL_MONEDA_USD}>
                        {lote.moneda}
                      </span>
                    </td>
                    <td className={TABLA_COMPACTA_TD}>
                      <span className={PILL_ESTADO[lote.estado] ?? PILL_ESTADO_NEUTRO}>{lote.estado}</span>
                    </td>
                    <td className={TABLA_COMPACTA_TD}>
                      {lote.loteo_id ? (
                        <span className="font-medium text-slate-700">
                          {nombreLoteoPorId.get(lote.loteo_id) ?? '—'}
                        </span>
                      ) : (
                        <span className="font-medium text-amber-800 italic">— sin loteo asignado —</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lotesFiltrados.length === 0 && (
              <p className="p-4 text-sm text-slate-600">Ningún lote coincide con este filtro.</p>
            )}
          </div>
        </form>
      </section>
    </main>
  )
}
