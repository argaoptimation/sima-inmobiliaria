import { createClient } from '@/lib/supabase/server'
import { requireAdminOCobrador } from '@/lib/auth/require-admin'
import { obtenerMesesIndiceFaltantes } from '@/lib/lotes/meses-indice-faltantes'
import { cargarValorIndice, corregirValorIndice, eliminarValorIndice } from './actions'
import { BotonEliminarIndice } from './BotonEliminarIndice'
import { FormularioCargarIndice } from './FormularioCargarIndice'
import { FormularioCorregirIndice } from './FormularioCorregirIndice'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import {
  ENLACE,
  TITULO_H1,
  TITULO_H2,
  BANNER_ERROR,
  BANNER_OK,
  TABLA_CONTENEDOR,
  TABLA_HEADER_FILA,
  TABLA_HEADER_CELDA,
  TABLA_FILA,
  TABLA_CELDA,
} from '@/lib/ui/clases'

const NOMBRES_MES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

function formatearPeriodo(periodo: string): string {
  const [anio, mes] = periodo.split('-').map(Number)
  return `${NOMBRES_MES[mes - 1]} ${anio}`
}

export default async function IndicesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string; prellenarNombre?: string; prellenarMes?: string }>
}) {
  const { error, ok, prellenarNombre, prellenarMes } = await searchParams

  await requireAdminOCobrador()

  const supabase = await createClient()

  const { data: valores } = await supabase
    .from('indices_valores')
    .select('id, nombre, periodo, valor, cargado_por, created_at')
    .order('periodo', { ascending: false })
    .order('nombre', { ascending: true })

  const cargadorIds = [...new Set((valores ?? []).map((v) => v.cargado_por))]
  const { data: cargadores } =
    cargadorIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', cargadorIds)
      : { data: [] }
  const nombreCargadorPorId = new Map((cargadores ?? []).map((persona) => [persona.id, persona.full_name]))

  const nombresExistentes = [...new Set((valores ?? []).map((v) => v.nombre))].sort()

  // Grilla tipo planilla (índice = columna, mes = fila) -- la lista de abajo
  // ya tiene el detalle completo (quién cargó cada valor y cuándo), pero
  // para ver de un vistazo qué meses están cargados de cada índice hace
  // falta esta vista, mismo pedido de Nicolás desde el principio.
  const periodosExistentes = [...new Set((valores ?? []).map((v) => v.periodo))].sort((a, b) =>
    b.localeCompare(a)
  )
  const valorPorNombreYPeriodo = new Map((valores ?? []).map((v) => [`${v.nombre}|${v.periodo}`, v.valor]))

  // Valores ya vienen ordenados por período descendente -- el primero que
  // aparece para cada nombre es el más reciente, el único corregible.
  const masRecientePorNombre = new Map<string, { periodo: string; valor: number }>()
  for (const v of valores ?? []) {
    if (!masRecientePorNombre.has(v.nombre)) {
      masRecientePorNombre.set(v.nombre, { periodo: v.periodo, valor: v.valor })
    }
  }

  const mesesFaltantes = await obtenerMesesIndiceFaltantes(supabase)

  // Blast radius de "corregir"/"eliminar" el valor más reciente de cada
  // índice: a cuántos lotes distintos ya les tocó ese período (exacto o
  // como fallback) -- pedido de Gabriel 24/08 para que el riesgo de una
  // corrección no quede invisible hasta después de aplicarla.
  const nombresConValorReciente = [...masRecientePorNombre.keys()]
  const { data: ajustesParaBlastRadius } =
    nombresConValorReciente.length > 0
      ? await supabase
          .from('ajustes_indexacion')
          .select('lote_id, indice_nombre, indice_periodo')
          .in('indice_nombre', nombresConValorReciente)
      : { data: [] }

  const cantidadLotesAfectadosPorNombre = new Map<string, number>()
  for (const [nombre, info] of masRecientePorNombre) {
    const loteIdsAfectados = new Set(
      (ajustesParaBlastRadius ?? [])
        .filter((a) => a.indice_nombre === nombre && a.indice_periodo === info.periodo)
        .map((a) => a.lote_id)
    )
    cantidadLotesAfectadosPorNombre.set(nombre, loteIdsAfectados.size)
  }

  return (
    <main>
      <h1 className={`mb-2 ${TITULO_H1}`}>Índices</h1>
      <p className="mb-6 text-sm text-slate-600">
        Valores mensuales de índices (IPC, ICC, u otros) para lotes cobrados en pesos. Apenas se
        carga el valor de un mes, se aplica solo a las cuotas que vencen el mes siguiente de los
        lotes atados a ese índice — sin ningún botón adicional. Un mes sin valor cargado
        simplemente no ajusta nada.
      </p>

      {error && <p className={BANNER_ERROR}>{error}</p>}
      {ok && <p className={BANNER_OK}>{ok}</p>}

      {mesesFaltantes.length > 0 && (
        <div className="mb-6 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <p className="mb-1 font-semibold">
            ⚠ Hay lotes con cuotas pendientes cuyo índice del mes anterior todavía no se cargó:
          </p>
          <ul className="list-inside list-disc">
            {mesesFaltantes.map((faltante) => {
              // Ya vienen ordenados por nombre y después por período -- el
              // primero que aparece para cada nombre es el más viejo
              // pendiente. Si este NO es el primero de su nombre, avisamos
              // cuál hay que cargar antes (pedido de Gabriel 24/08: evitar
              // cargar los meses de un mismo índice fuera de orden).
              const masViejoDelMismoNombre = mesesFaltantes.find((otro) => otro.nombre === faltante.nombre)
              const esElMasViejo = masViejoDelMismoNombre === faltante || masViejoDelMismoNombre?.periodo === faltante.periodo
              return (
                <li key={`${faltante.nombre}|${faltante.periodo}`}>
                  <EnlaceBoton
                    href={`/admin/indices?prellenarNombre=${encodeURIComponent(faltante.nombre)}&prellenarMes=${faltante.periodo.slice(0, 7)}#form-cargar`}
                    className={`font-medium ${ENLACE}`}
                  >
                    {faltante.nombre} — {formatearPeriodo(faltante.periodo)} — cargar ahora →
                  </EnlaceBoton>{' '}
                  (lote{faltante.lotes.length > 1 ? 's' : ''}:{' '}
                  {faltante.lotes.map((lote, j) => (
                    <span key={lote.id}>
                      {j > 0 && ', '}
                      <EnlaceBoton href={`/admin/lotes/${lote.id}`} className={ENLACE}>
                        {lote.identificador}
                      </EnlaceBoton>
                    </span>
                  ))}
                  )
                  {!esElMasViejo && masViejoDelMismoNombre && (
                    <p className="ml-4 font-semibold text-red-700">
                      ⚠ Ojo: todavía falta cargar {formatearPeriodo(masViejoDelMismoNombre.periodo)} de{' '}
                      {faltante.nombre} antes que este mes.
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <FormularioCargarIndice
        cargarValorIndiceAction={cargarValorIndice}
        nombresExistentes={nombresExistentes}
        prellenarNombre={prellenarNombre}
        prellenarMes={prellenarMes}
      />

      <p className="mb-2 text-sm text-slate-600">
        Solo se puede corregir el valor MÁS RECIENTE cargado de cada índice (abajo). Un mes viejo
        ya no se puede tocar una vez que se cargó uno más nuevo después. Para cambiar un valor sin
        tocar el índice original (ej. una excepción para un loteo puntual), cargalo con un nombre
        nuevo (ej. &quot;IPC 2&quot;) — queda como un índice aparte, independiente del original,
        para asociar solo a los lotes que corresponda.
      </p>

      {masRecientePorNombre.size > 0 && (
        <>
          <h2 className={`mb-2 mt-6 ${TITULO_H2}`}>Corregir el último valor cargado</h2>
          <div className={`mb-8 w-full max-w-2xl ${TABLA_CONTENEDOR}`}>
          <table className="w-full text-sm">
            <thead>
              <tr className={TABLA_HEADER_FILA}>
                <th className={TABLA_HEADER_CELDA}>Índice</th>
                <th className={TABLA_HEADER_CELDA}>Mes</th>
                <th className={TABLA_HEADER_CELDA}>Valor actual</th>
                <th className={TABLA_HEADER_CELDA}>Corregir a</th>
                <th className={TABLA_HEADER_CELDA}></th>
              </tr>
            </thead>
            <tbody>
              {[...masRecientePorNombre.entries()].map(([nombre, info]) => (
                <tr key={nombre} className={TABLA_FILA}>
                  <td className={TABLA_CELDA}>{nombre}</td>
                  <td className={TABLA_CELDA}>{formatearPeriodo(info.periodo)}</td>
                  <td className={TABLA_CELDA}>{info.valor}%</td>
                  <td className={TABLA_CELDA}>
                    <FormularioCorregirIndice
                      corregirValorIndiceAction={corregirValorIndice}
                      nombre={nombre}
                      periodo={info.periodo}
                      valorActual={info.valor}
                      cantidadLotesAfectados={cantidadLotesAfectadosPorNombre.get(nombre) ?? 0}
                    />
                  </td>
                  <td className={TABLA_CELDA}>
                    <BotonEliminarIndice
                      eliminarValorIndiceAction={eliminarValorIndice}
                      nombre={nombre}
                      periodo={info.periodo}
                      cantidadLotesAfectados={cantidadLotesAfectadosPorNombre.get(nombre) ?? 0}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}

      {periodosExistentes.length === 0 ? (
        <p className="mb-8 text-sm text-slate-600">Todavía no se cargó ningún valor.</p>
      ) : (
        <div className={`mb-8 ${TABLA_CONTENEDOR}`}>
        <table className="w-full text-sm">
          <thead>
            <tr className={TABLA_HEADER_FILA}>
              <th className={TABLA_HEADER_CELDA}>Mes</th>
              {nombresExistentes.map((nombre) => (
                <th key={nombre} className={TABLA_HEADER_CELDA}>{nombre}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periodosExistentes.map((periodo) => (
              <tr key={periodo} className={TABLA_FILA}>
                <td className={TABLA_CELDA}>{formatearPeriodo(periodo)}</td>
                {nombresExistentes.map((nombre) => {
                  const valor = valorPorNombreYPeriodo.get(`${nombre}|${periodo}`)
                  return <td key={nombre} className={TABLA_CELDA}>{valor === undefined ? '—' : `${valor}%`}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      <h2 className={`mb-2 ${TITULO_H2}`}>Detalle completo</h2>
      <div className={TABLA_CONTENEDOR}>
      <table className="w-full text-sm">
        <thead>
          <tr className={TABLA_HEADER_FILA}>
            <th className={TABLA_HEADER_CELDA}>Índice</th>
            <th className={TABLA_HEADER_CELDA}>Mes</th>
            <th className={TABLA_HEADER_CELDA}>Valor</th>
            <th className={TABLA_HEADER_CELDA}>Cargado por</th>
            <th className={TABLA_HEADER_CELDA}>Cuándo</th>
          </tr>
        </thead>
        <tbody>
          {(valores ?? []).map((v) => (
            <tr key={v.id} className={TABLA_FILA}>
              <td className={TABLA_CELDA}>{v.nombre}</td>
              <td className={TABLA_CELDA}>{formatearPeriodo(v.periodo)}</td>
              <td className={TABLA_CELDA}>{v.valor}%</td>
              <td className={TABLA_CELDA}>{nombreCargadorPorId.get(v.cargado_por) ?? '—'}</td>
              <td className={TABLA_CELDA}>{new Date(v.created_at).toLocaleDateString('es-AR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </main>
  )
}
