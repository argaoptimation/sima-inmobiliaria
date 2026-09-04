import { createClient } from '@/lib/supabase/server'
import { requireAdminOTitularCuenta } from '@/lib/auth/require-admin'
import { notFound } from 'next/navigation'
import { obtenerProyeccionCobranza } from '@/lib/cuenta-corriente/proyeccion'
import { etiquetaMesCorta, ultimoDiaDelMes, mesRelativoAHoy } from '@/lib/fecha/meses'
import { FiltroEnVivo } from '@/components/FiltroEnVivo'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import {
  ENTRADA,
  BOTON_SECUNDARIO,
  ENLACE,
  ENLACE_TABLA,
  TITULO_H1,
  NUMERO_TABULAR,
  TABLA_CONTENEDOR,
  TABLA_HEADER_FILA,
  TABLA_HEADER_CELDA,
  TABLA_FILA,
  TABLA_CELDA,
  TABLA_CELDA_PRINCIPAL,
} from '@/lib/ui/clases'

// Proyección de cobranza mes a mes (pedido de Gabriel tras la llamada con
// Nico, ver memoria project_sima_backlog_notion_2026_08.md): reutiliza
// cuota_distribuciones -- la misma tabla que ya arma "Destinos" en el
// detalle del lote y el saldo de cuenta corriente -- solo agrupada por mes
// de vencimiento. Vive como una pantalla más del detalle de cuenta
// corriente, no como link de nav nuevo (ubicación confirmada por Gabriel).
//
// El formato de la tabla es el del Excel que ya usaba Nico (captura que
// pasó Gabriel el 04/09): una fila por lote + comprador, una columna por
// mes, y la fila TOTAL al pie. La primera versión era una fila por
// (mes, lote), que se hacía larguísima con muchas cuotas.
export default async function ProyeccionCuentaCorrientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ desde?: string; hasta?: string }>
}) {
  const { id } = await params
  const { esAdmin } = await requireAdminOTitularCuenta(id)
  const { desde: mesDesde, hasta: mesHasta } = await searchParams

  const supabase = await createClient()

  const { data: persona } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', id)
    .maybeSingle()

  if (!persona) {
    notFound()
  }

  const mesDesdeEfectivo = mesDesde || mesRelativoAHoy(0)
  const mesHastaEfectivo = mesHasta || mesRelativoAHoy(5)

  const desde = `${mesDesdeEfectivo}-01`
  const hasta = `${mesHastaEfectivo}-${String(ultimoDiaDelMes(mesHastaEfectivo)).padStart(2, '0')}`

  const rangoInvalido = mesDesdeEfectivo > mesHastaEfectivo

  const proyeccion = rangoInvalido
    ? null
    : await obtenerProyeccionCobranza(supabase, id, desde, hasta)

  const paramsExport = new URLSearchParams({ desde: mesDesdeEfectivo, hasta: mesHastaEfectivo })

  return (
    <main>
      <EnlaceBoton href={`/admin/cuentas-corrientes/${id}`} className={`mb-4 inline-block ${ENLACE}`}>
        ← Volver a {esAdmin ? persona!.full_name : 'mi cuenta corriente'}
      </EnlaceBoton>
      <h1 className={`mb-1 ${TITULO_H1}`}>Proyección de cobranza</h1>
      <p className="mb-6 text-sm text-slate-600">{persona!.full_name}</p>

      <p className="mb-6 max-w-3xl text-sm text-slate-600">
        Cuánto va a cobrar {esAdmin ? persona!.full_name : ''} mes a mes en el rango elegido, lote por
        lote, según los vencimientos ya cargados. Sirve para planificar: no reemplaza al saldo real de
        la cuenta corriente, que refleja lo que ya se cobró.
      </p>

      <FiltroEnVivo className="mb-6 flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-600">
          Desde
          <input type="month" name="desde" defaultValue={mesDesdeEfectivo} className={ENTRADA} />
        </label>
        <label className="text-sm text-slate-600">
          Hasta
          <input type="month" name="hasta" defaultValue={mesHastaEfectivo} className={ENTRADA} />
        </label>
        <button type="submit" className={`cursor-pointer ${BOTON_SECUNDARIO}`}>
          Filtrar
        </button>
      </FiltroEnVivo>

      {rangoInvalido ? (
        <p className="text-sm text-slate-600">
          El mes &quot;desde&quot; tiene que ser anterior o igual al mes &quot;hasta&quot;.
        </p>
      ) : proyeccion!.filas.length === 0 ? (
        <p className="text-sm text-slate-600">Sin cuotas asignadas a esta persona en el rango elegido.</p>
      ) : (
        <>
          <a
            href={`/admin/cuentas-corrientes/${id}/proyeccion/export?${paramsExport.toString()}`}
            className={`mb-3 inline-block ${ENLACE}`}
          >
            Descargar Excel →
          </a>
          <div className={TABLA_CONTENEDOR}>
            <table className="w-full text-sm">
              <thead>
                <tr className={TABLA_HEADER_FILA}>
                  <th className={TABLA_HEADER_CELDA}>Lote</th>
                  <th className={TABLA_HEADER_CELDA}>Comprador</th>
                  {proyeccion!.meses.map((mes) => (
                    <th key={mes} className={`${TABLA_HEADER_CELDA} text-right whitespace-nowrap`}>
                      {etiquetaMesCorta(mes)}
                    </th>
                  ))}
                  <th className={`${TABLA_HEADER_CELDA} text-right`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {proyeccion!.filas.map((fila) => (
                  <tr key={fila.loteId} className={TABLA_FILA}>
                    <td className={TABLA_CELDA_PRINCIPAL}>
                      <EnlaceBoton href={`/admin/lotes/${fila.loteId}`} className={ENLACE_TABLA}>
                        {fila.loteIdentificador}
                      </EnlaceBoton>
                    </td>
                    <td className={TABLA_CELDA}>{fila.compradorNombre ?? '—'}</td>
                    {proyeccion!.meses.map((mes) => (
                      <td
                        key={mes}
                        className={`${TABLA_CELDA} text-right whitespace-nowrap ${NUMERO_TABULAR}`}
                      >
                        {fila.porMes[mes] ? `${fila.porMes[mes]} ${fila.moneda}` : '—'}
                      </td>
                    ))}
                    <td
                      className={`${TABLA_CELDA} text-right font-semibold whitespace-nowrap ${NUMERO_TABULAR}`}
                    >
                      {fila.total} {fila.moneda}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-blue-900 bg-blue-50/70">
                  <td className={`${TABLA_CELDA_PRINCIPAL} uppercase`}>Total</td>
                  <td className={TABLA_CELDA}></td>
                  {proyeccion!.meses.map((mes) => {
                    const porMoneda = Object.entries(proyeccion!.totalesPorMes[mes] ?? {})
                    return (
                      <td
                        key={mes}
                        className={`px-4 py-3 text-right font-bold whitespace-nowrap text-blue-900 ${NUMERO_TABULAR}`}
                      >
                        {porMoneda.length === 0
                          ? '—'
                          : porMoneda.map(([moneda, monto]) => `${monto} ${moneda}`).join(' / ')}
                      </td>
                    )
                  })}
                  <td
                    className={`px-4 py-3 text-right font-bold whitespace-nowrap text-blue-900 ${NUMERO_TABULAR}`}
                  >
                    {Object.entries(proyeccion!.totalGeneral)
                      .map(([moneda, monto]) => `${monto} ${moneda}`)
                      .join(' / ') || '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  )
}
