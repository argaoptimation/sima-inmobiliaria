import { Fragment } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FiltroEnVivo } from '@/components/FiltroEnVivo'
import { formatearFechaCorta } from '@/lib/fecha/formatear-fecha-corta'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import {
  ENTRADA,
  ENLACE,
  TITULO_H1,
  TABLA_CONTENEDOR,
  TABLA_HEADER_FILA,
  TABLA_HEADER_CELDA,
  TABLA_FILA,
  TABLA_CELDA,
} from '@/lib/ui/clases'

const ROLES_CON_ACCESO = ['administrador', 'acreedor', 'vendedor', 'cobrador']

export default async function HistorialCotizacionDolarPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>
}) {
  const { desde, hasta } = await searchParams

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user!.id).single()

  if (!perfil || !ROLES_CON_ACCESO.includes(perfil.role)) {
    redirect('/login')
  }

  let queryCotizaciones = supabase
    .from('cotizaciones_dolar')
    .select('id, fecha, valor, cargado_por, created_at')
    .order('fecha', { ascending: false })

  if (desde) queryCotizaciones = queryCotizaciones.gte('fecha', desde)
  if (hasta) queryCotizaciones = queryCotizaciones.lte('fecha', hasta)

  const { data: cotizaciones } = await queryCotizaciones

  // Historial de CADA carga/corrección del día (25/08/2026, pedido de
  // Gabriel) -- uso interno/admin únicamente, nunca se le muestra al
  // cliente. Se agrupa por fecha para poder listar, debajo de cada día, las
  // correcciones que hubo (si el día tuvo una sola carga, no se muestra
  // nada extra). Filtrado por el mismo rango desde/hasta que la tabla
  // principal (26/08/2026, pedido de Gabriel: poder buscar "lo que se cargó
  // hace un mes" por rango de fecha, igual que en el resto de los
  // historiales del admin).
  let queryHistorial = supabase
    .from('cotizaciones_dolar_historial')
    .select('id, fecha, valor, cargado_por, created_at')
    .order('created_at', { ascending: true })

  if (desde) queryHistorial = queryHistorial.gte('fecha', desde)
  if (hasta) queryHistorial = queryHistorial.lte('fecha', hasta)

  const { data: historial } = await queryHistorial

  const historialPorFecha = new Map<string, typeof historial>()
  for (const registro of historial ?? []) {
    const lista = historialPorFecha.get(registro.fecha) ?? []
    lista.push(registro)
    historialPorFecha.set(registro.fecha, lista)
  }

  const cargadorIds = [
    ...new Set([
      ...(cotizaciones ?? []).map((c) => c.cargado_por),
      ...(historial ?? []).map((h) => h.cargado_por),
    ]),
  ]
  const { data: cargadores } =
    cargadorIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', cargadorIds)
      : { data: [] }
  const nombreCargadorPorId = new Map((cargadores ?? []).map((persona) => [persona.id, persona.full_name]))

  return (
    <main>
      <div className="mb-4 flex gap-4">
        <EnlaceBoton href="/admin/lotes" className={`text-sm ${ENLACE}`}>
          ← Volver a Lotes
        </EnlaceBoton>
      </div>
      <h1 className={`mb-2 ${TITULO_H1}`}>Historial de cotización del dólar</h1>
      <p className="mb-6 text-sm text-slate-600">
        Un valor por día. El de hoy se puede corregir desde &quot;Lotes&quot;; los días anteriores
        quedan firmes.
      </p>

      <FiltroEnVivo className="mb-6 flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-600">
          Desde
          <input
            type="date"
            name="desde"
            defaultValue={desde ?? ''}
            className={ENTRADA}
          />
        </label>
        <label className="text-sm text-slate-600">
          Hasta
          <input
            type="date"
            name="hasta"
            defaultValue={hasta ?? ''}
            className={ENTRADA}
          />
        </label>
        {(desde || hasta) && (
          <EnlaceBoton href="/admin/cotizacion-dolar" className={`text-sm ${ENLACE}`}>
            Limpiar filtro
          </EnlaceBoton>
        )}
      </FiltroEnVivo>

      <div className={TABLA_CONTENEDOR}>
      <table className="w-full text-sm">
        <thead>
          <tr className={TABLA_HEADER_FILA}>
            <th className={TABLA_HEADER_CELDA}>Fecha</th>
            <th className={TABLA_HEADER_CELDA}>Valor (ARS por USD)</th>
            <th className={TABLA_HEADER_CELDA}>Cargada por</th>
            <th className={TABLA_HEADER_CELDA}>Hora</th>
          </tr>
        </thead>
        <tbody>
          {(cotizaciones ?? []).map((c) => {
            const correcciones = historialPorFecha.get(c.fecha) ?? []
            return (
              <Fragment key={c.id}>
                <tr className={TABLA_FILA}>
                  <td className={TABLA_CELDA}>{formatearFechaCorta(c.fecha)}</td>
                  <td className={TABLA_CELDA}>{c.valor}</td>
                  <td className={TABLA_CELDA}>{nombreCargadorPorId.get(c.cargado_por) ?? '—'}</td>
                  <td className={TABLA_CELDA}>
                    {new Date(c.created_at).toLocaleTimeString('es-AR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    hs
                  </td>
                </tr>
                {correcciones.length > 1 && (
                  <tr className={`${TABLA_FILA} bg-blue-50/40`}>
                    <td colSpan={4} className="py-2 pl-4 text-xs text-slate-600">
                      Se cargó {correcciones.length} veces este día:{' '}
                      {correcciones
                        .map(
                          (registro) =>
                            `${new Date(registro.created_at).toLocaleTimeString('es-AR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}hs → ${registro.valor} (${nombreCargadorPorId.get(registro.cargado_por) ?? '—'})`
                        )
                        .join(' · ')}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
      </div>
      {(cotizaciones ?? []).length === 0 && (
        <p className="mt-4 text-sm text-slate-600">
          {desde || hasta
            ? 'Ninguna cotización cargada en ese rango de fechas.'
            : 'Todavía no se cargó ninguna cotización.'}
        </p>
      )}
    </main>
  )
}
