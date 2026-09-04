import { createClient } from '@/lib/supabase/server'
import { requireAdminOTitularCuenta } from '@/lib/auth/require-admin'
import { notFound } from 'next/navigation'
import { obtenerProyeccionCuotas } from '@/lib/cuenta-corriente/proyeccion'
import { FiltroEnVivo } from '@/components/FiltroEnVivo'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import {
  ENTRADA,
  BOTON_SECUNDARIO,
  ENLACE,
  ENLACE_TABLA,
  TITULO_H1,
  TITULO_H2,
  TABLA_CONTENEDOR,
  TABLA_HEADER_FILA,
  TABLA_HEADER_CELDA,
  TABLA_FILA,
  TABLA_CELDA,
  TABLA_CELDA_PRINCIPAL,
} from '@/lib/ui/clases'

const NOMBRE_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function etiquetaMes(mes: string) {
  const [anio, numeroMes] = mes.split('-').map(Number)
  return `${NOMBRE_MES[numeroMes - 1]} ${anio}`
}

function ultimoDiaDelMes(mes: string) {
  const [anio, numeroMes] = mes.split('-').map(Number)
  return new Date(anio, numeroMes, 0).getDate()
}

function mesPorDefecto(offset: number) {
  const hoy = new Date()
  const fecha = new Date(hoy.getFullYear(), hoy.getMonth() + offset, 1)
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
}

// Proyección de cobranza mes a mes (pedido de Gabriel tras la llamada con
// Nico, ver memoria project_sima_backlog_notion_2026_08.md): reutiliza
// cuota_distribuciones -- la misma tabla que ya arma "Destinos" en el
// detalle del lote y el saldo de cuenta corriente -- solo agrupada por mes
// de vencimiento en vez de por lote. Vive como una pestaña más del detalle
// de cuenta corriente, no como link de nav nuevo (ubicación confirmada por
// Gabriel).
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

  const mesDesdeEfectivo = mesDesde || mesPorDefecto(0)
  const mesHastaEfectivo = mesHasta || mesPorDefecto(5)

  const desde = `${mesDesdeEfectivo}-01`
  const hasta = `${mesHastaEfectivo}-${String(ultimoDiaDelMes(mesHastaEfectivo)).padStart(2, '0')}`

  const rangoInvalido = mesDesdeEfectivo > mesHastaEfectivo

  const { filas, detalle } = rangoInvalido
    ? { filas: [], detalle: [] }
    : await obtenerProyeccionCuotas(supabase, id, desde, hasta)

  return (
    <main className="max-w-3xl">
      <EnlaceBoton href={`/admin/cuentas-corrientes/${id}`} className={`mb-4 inline-block ${ENLACE}`}>
        ← Volver a {esAdmin ? persona!.full_name : 'mi cuenta corriente'}
      </EnlaceBoton>
      <h1 className={`mb-1 ${TITULO_H1}`}>Proyección de cobranza</h1>
      <p className="mb-6 text-sm text-slate-600">{persona!.full_name}</p>

      <p className="mb-6 text-sm text-slate-600">
        Cuánto va a cobrar {esAdmin ? persona!.full_name : ''} mes a mes en el rango elegido, sumando su
        parte de todas las cuotas de todos sus lotes según los vencimientos ya cargados. Sirve para
        planificar, no reemplaza el saldo real de la cuenta corriente (que ya tiene en cuenta lo cobrado).
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
        <p className="text-sm text-slate-600">El mes &quot;desde&quot; tiene que ser anterior o igual al mes &quot;hasta&quot;.</p>
      ) : filas.length === 0 ? (
        <p className="text-sm text-slate-600">Sin cuotas asignadas a esta persona en el rango elegido.</p>
      ) : (
        <>
          <h2 className={`mb-2 ${TITULO_H2}`}>Resumen por mes</h2>
          <div className={`mb-8 ${TABLA_CONTENEDOR}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className={TABLA_HEADER_FILA}>
                  <th className={TABLA_HEADER_CELDA}>Mes</th>
                  <th className={TABLA_HEADER_CELDA}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => (
                  <tr key={`${fila.mes}|${fila.moneda}`} className={TABLA_FILA}>
                    <td className={TABLA_CELDA_PRINCIPAL}>{etiquetaMes(fila.mes)}</td>
                    <td className={TABLA_CELDA}>
                      {fila.monto} {fila.moneda}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className={`mb-2 ${TITULO_H2}`}>Detalle por lote</h2>
          <div className={TABLA_CONTENEDOR}>
            <table className="w-full text-sm">
              <thead>
                <tr className={TABLA_HEADER_FILA}>
                  <th className={TABLA_HEADER_CELDA}>Mes</th>
                  <th className={TABLA_HEADER_CELDA}>Lote</th>
                  <th className={TABLA_HEADER_CELDA}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {detalle.map((fila, indice) => (
                  <tr key={`${fila.mes}|${fila.loteId}|${indice}`} className={TABLA_FILA}>
                    <td className={TABLA_CELDA_PRINCIPAL}>{etiquetaMes(fila.mes)}</td>
                    <td className={TABLA_CELDA}>
                      <EnlaceBoton href={`/admin/lotes/${fila.loteId}`} className={ENLACE_TABLA}>
                        {fila.loteIdentificador}
                      </EnlaceBoton>
                    </td>
                    <td className={TABLA_CELDA}>
                      {fila.monto} {fila.moneda}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  )
}
