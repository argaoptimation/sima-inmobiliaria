import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { describirSituacion } from '@/lib/cuenta-corriente/situacion'
import { obtenerResumenDeTransferencias } from '@/lib/cuenta-corriente/resumen-transferencias'
import { monedasOrdenadas } from '@/lib/cuenta-corriente/totales-a-transferir'
import { obtenerCuotasSinDistribucion } from '@/lib/cuenta-corriente/cuotas-sin-distribucion'
import { mesRelativoAHoy } from '@/lib/fecha/meses'
import { FiltroEnVivo } from '@/components/FiltroEnVivo'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { EncabezadoPagina } from '@/components/EncabezadoPagina'
import { BotonVerDetalle } from '@/components/BotonVerDetalle'
import {
  ENTRADA,
  BOTON_SECUNDARIO,
  ENLACE,
  ENLACE_TABLA,
  TABLA_CONTENEDOR,
  TABLA_HEADER_FILA,
  TABLA_HEADER_CELDA,
  TABLA_FILA,
  TABLA_CELDA,
  TABLA_CELDA_PRINCIPAL,
  NUMERO_TABULAR,
  TARJETA_KPI,
  LOTE_KPI_ETIQUETA,
  LOTE_KPI_VALOR,
  LOTE_KPI_PILL,
  LOTE_KPI_DATO,
  BOTON_CABECERA_AZUL,
} from '@/lib/ui/clases'
import { Banknote } from 'lucide-react'

export default async function CuentasCorrientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pendientes?: string; desde?: string; hasta?: string }>
}) {
  await requireAdministrador()

  const { q: filtroTexto, pendientes, desde, hasta } = await searchParams
  const soloPendientes = pendientes === '1'

  // El rango de meses de la hoja "Proyeccion" del Excel. Vive aca y no en
  // el export porque hasta el 10/09 estaba clavado en seis meses: el boton
  // de descarga cuelga de este listado, que no tenia ningun filtro de
  // meses, asi que no habia forma de pedir otro rango (lo marco Gabriel).
  // No cambia nada de lo que se ve en pantalla -- de ahi la etiqueta.
  const mesDesdeEfectivo = desde || mesRelativoAHoy(0)
  const mesHastaEfectivo = hasta || mesRelativoAHoy(5)

  const supabase = await createClient()

  // El calculo vive en lib para que el Excel exporte exactamente lo que se
  // ve (regla de Gabriel, 09/09). Ver resumen-transferencias.ts.
  const { personas: todas, totales } = await obtenerResumenDeTransferencias(supabase, {
    filtroNombre: filtroTexto,
  })

  const personas = soloPendientes
    ? todas.filter((persona) =>
        Object.values(persona.porMoneda).some((situacion) => situacion.saldo > 0)
      )
    : todas

  // Primero los que esperan plata, y de esos el que mas espera: es el orden
  // con el que se hacen las transferencias. Despues los que cobraron de mas
  // y por ultimo los que estan al dia, que no requieren ninguna accion.
  const mayorSaldo = (persona: (typeof personas)[number]) =>
    Math.max(0, ...Object.values(persona.porMoneda).map((situacion) => situacion.saldo))
  const personasOrdenadas = [...personas].sort((a, b) => mayorSaldo(b) - mayorSaldo(a))

  const parametrosDelExport = new URLSearchParams()
  if (filtroTexto) parametrosDelExport.set('q', filtroTexto)
  if (soloPendientes) parametrosDelExport.set('pendientes', '1')
  parametrosDelExport.set('desde', mesDesdeEfectivo)
  parametrosDelExport.set('hasta', mesHastaEfectivo)
  const urlExport = `/admin/cuentas-corrientes/export?${parametrosDelExport.toString()}`

  const monedasConTotal = monedasOrdenadas(totales)

  const cuotasSinDistribucion = await obtenerCuotasSinDistribucion(supabase)

  return (
    <main>
      <EncabezadoPagina titulo="Cuentas corrientes" migas={['Cuentas corrientes']} />

      {cuotasSinDistribucion.length > 0 && (
        <div className="mb-6 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <p className="mb-1 font-semibold">
            {cuotasSinDistribucion.length} cuota{cuotasSinDistribucion.length > 1 ? 's' : ''} cobrada
            {cuotasSinDistribucion.length > 1 ? 's' : ''} sin distribución cargada:
          </p>
          <ul className="list-inside list-disc">
            {cuotasSinDistribucion.map((cuota) => (
              <li key={cuota.cuotaId}>
                <EnlaceBoton href={`/admin/lotes/${cuota.loteId}/distribucion`} className={ENLACE}>
                  {cuota.loteIdentificador} — cuota {cuota.numero}
                </EnlaceBoton>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* El resumen global (09/09, add-on "Resumen de transferencias por
          acreedor"): la pregunta con la que Nicolas abre esta pantalla todos
          los meses es "cuanto tengo que girar hoy", y hasta ahora habia que
          sumarlo a mano recorriendo la tabla.

          Las dos cifras van separadas a proposito: los saldos NO se netean
          entre personas. Si a uno hay que darle 800 y otro tiene 300 de mas,
          hay que girar 800 igual -- la plata de mas del segundo no paga al
          primero. Ver totales-a-transferir.ts. */}
      {monedasConTotal.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {monedasConTotal.map((moneda) => {
            const total = totales[moneda]
            return (
              <div key={moneda} className={TARJETA_KPI}>
                <div className="flex items-center justify-between gap-2">
                  <span className={LOTE_KPI_ETIQUETA}>Hay que girar</span>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                    <Banknote className="h-4 w-4" />
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={LOTE_KPI_VALOR}>{total.aGirar.toLocaleString('es-AR')}</span>
                  <span className={LOTE_KPI_PILL}>{moneda}</span>
                </div>
                <div className="space-y-0.5">
                  <p className={LOTE_KPI_DATO}>
                    {total.cuantosEsperan === 0
                      ? 'Nadie está esperando plata'
                      : `A ${total.cuantosEsperan} ${total.cuantosEsperan === 1 ? 'persona' : 'personas'}`}
                  </p>
                  {total.deMas > 0 && (
                    <p className="text-[11px] text-slate-500 tabular-nums">
                      Aparte, {total.deMas.toLocaleString('es-AR')} {moneda} cobrados de más por{' '}
                      {total.cuantosTienenDeMas}{' '}
                      {total.cuantosTienenDeMas === 1 ? 'persona' : 'personas'}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <EnlaceBoton
          href={
            soloPendientes
              ? `/admin/cuentas-corrientes${filtroTexto ? `?q=${encodeURIComponent(filtroTexto)}` : ''}`
              : `/admin/cuentas-corrientes?pendientes=1${filtroTexto ? `&q=${encodeURIComponent(filtroTexto)}` : ''}`
          }
          className={
            soloPendientes
              ? 'inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-blue-700 bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white'
              : BOTON_CABECERA_AZUL
          }
        >
          Solo a quienes hay que girarles
        </EnlaceBoton>

        {/* Un <a> y no EnlaceBoton: es una descarga, no una navegación del
            router -- con <Link> el .xlsx se pide por el router de Next y no
            dispara la descarga del navegador. */}
        <a href={urlExport} className={BOTON_CABECERA_AZUL}>
          Descargar Excel (con la proyección)
        </a>
      </div>

      <FiltroEnVivo className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-600">
          Buscar
          <input type="text" name="q" placeholder="Nombre" defaultValue={filtroTexto ?? ''} className={ENTRADA} />
        </label>
        <label className="text-sm text-slate-600">
          Proyección del Excel: desde
          <input type="month" name="desde" defaultValue={mesDesdeEfectivo} className={ENTRADA} />
        </label>
        <label className="text-sm text-slate-600">
          hasta
          <input type="month" name="hasta" defaultValue={mesHastaEfectivo} className={ENTRADA} />
        </label>
        <button type="submit" className={`cursor-pointer ${BOTON_SECUNDARIO}`}>
          Filtrar
        </button>
        {filtroTexto && (
          <EnlaceBoton href="/admin/cuentas-corrientes" className={ENLACE}>
            Limpiar
          </EnlaceBoton>
        )}
      </FiltroEnVivo>

      {personasOrdenadas.length === 0 ? (
        <p className="text-sm text-slate-600">
          {soloPendientes
            ? 'No hay nadie esperando una transferencia.'
            : 'Nadie coincide con la búsqueda.'}
        </p>
      ) : (
        <div className={TABLA_CONTENEDOR}>
          <table className="w-full text-sm">
            <thead>
              <tr className={TABLA_HEADER_FILA}>
                <th className={TABLA_HEADER_CELDA}>Nombre</th>
                <th className={TABLA_HEADER_CELDA}>Rol</th>
                <th className={TABLA_HEADER_CELDA}>Le corresponde</th>
                <th className={TABLA_HEADER_CELDA}>Cobró directo</th>
                <th className={TABLA_HEADER_CELDA}>Cómo queda</th>
                <th className={TABLA_HEADER_CELDA}></th>
              </tr>
            </thead>
            <tbody>
              {personasOrdenadas.map((persona) => {
                const resumen = persona.porMoneda
                const monedas = monedasOrdenadas(resumen)

                return (
                  <tr key={persona.id} className={TABLA_FILA}>
                    <td className={TABLA_CELDA_PRINCIPAL}>
                      <EnlaceBoton href={`/admin/cuentas-corrientes/${persona.id}`} className={ENLACE_TABLA}>
                        {persona.nombre}
                      </EnlaceBoton>
                    </td>
                    <td className={TABLA_CELDA}>{persona.rol}</td>
                    <td className={`${TABLA_CELDA} ${NUMERO_TABULAR}`}>
                      {monedas.length === 0
                        ? '—'
                        : monedas.map((moneda) => (
                            <span key={moneda} className="block">
                              {resumen[moneda].leCorresponde.toLocaleString('es-AR')} {moneda}
                            </span>
                          ))}
                    </td>
                    <td className={`${TABLA_CELDA} ${NUMERO_TABULAR}`}>
                      {monedas.length === 0
                        ? '—'
                        : monedas.map((moneda) => (
                            <span key={moneda} className="block">
                              {resumen[moneda].cobroDirecto.toLocaleString('es-AR')} {moneda}
                            </span>
                          ))}
                    </td>
                    <td className={TABLA_CELDA}>
                      {monedas.length === 0 ? (
                        <span className="text-slate-500">Sin movimientos</span>
                      ) : (
                        monedas.map((moneda) => {
                          const saldo = resumen[moneda].saldo
                          return (
                            <span
                              key={moneda}
                              className={`block font-medium ${
                                saldo > 0
                                  ? 'text-amber-800'
                                  : saldo < 0
                                    ? 'text-blue-800'
                                    : 'text-green-700'
                              }`}
                            >
                              {describirSituacion(saldo, moneda)}
                            </span>
                          )
                        })
                      )}
                    </td>
                    <td className={TABLA_CELDA}>
                      <BotonVerDetalle
                        href={`/admin/cuentas-corrientes/${persona.id}`}
                        titulo={`Ver la cuenta de ${persona.nombre}`}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
