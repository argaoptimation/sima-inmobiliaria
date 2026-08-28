import { createClient } from '@/lib/supabase/server'
import { requireAdminOCobrador } from '@/lib/auth/require-admin'
import { FiltroEnVivo } from '@/components/FiltroEnVivo'
import { hoyArgentina as hoyISO, fechaEnArgentina } from '@/lib/fecha/hoy-argentina'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import {
  ENTRADA,
  ENLACE,
  ENLACE_TABLA,
  TITULO_H1,
  TITULO_H2,
  TARJETA,
  TABLA_CONTENEDOR,
  TABLA_HEADER_FILA,
  TABLA_HEADER_CELDA,
  TABLA_FILA,
  TABLA_CELDA,
  TABLA_CELDA_PRINCIPAL,
} from '@/lib/ui/clases'

export default async function CierreCajaPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>
}) {
  const { fecha: fechaParam } = await searchParams

  await requireAdminOCobrador()

  const fecha = fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam) ? fechaParam : hoyISO()

  const supabase = await createClient()

  const { data: pagosData } = await supabase
    .from('pagos')
    .select(
      'id, monto, moneda, medio_pago, motivo, cliente_id, confirmado_acreedor_at, confirmado_admin_at, lote_id, lotes(identificador)'
    )
    .eq('estado', 'confirmado')

  const pagos = (pagosData ?? []) as unknown as Array<{
    id: string
    monto: number
    moneda: string
    medio_pago: 'efectivo' | 'transferencia'
    motivo: string
    cliente_id: string
    confirmado_acreedor_at: string | null
    confirmado_admin_at: string | null
    lote_id: string
    lotes: { identificador: string } | null
  }>

  // "Recibido el día X" = el día en que la confirmación TERMINÓ de
  // cerrarse -- el toque más tardío entre acreedor y admin (para
  // transferencia, que necesita ambos) o directamente el de admin (para
  // efectivo/cuenta externa, que solo necesita uno). No hay una columna
  // única "confirmado_at" en la tabla, se calcula acá.
  function fechaDeConfirmacion(pago: (typeof pagos)[number]): string | null {
    const candidatos = [pago.confirmado_acreedor_at, pago.confirmado_admin_at].filter(
      (valor): valor is string => valor !== null
    )
    if (candidatos.length === 0) return null
    const masTardio = candidatos.reduce((a, b) => (a > b ? a : b))
    return fechaEnArgentina(masTardio)
  }

  const pagosDelDia = pagos.filter((pago) => fechaDeConfirmacion(pago) === fecha)

  const clienteIds = [...new Set(pagosDelDia.map((pago) => pago.cliente_id))]
  const { data: clientes } =
    clienteIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', clienteIds)
      : { data: [] }
  const nombreClientePorId = new Map((clientes ?? []).map((persona) => [persona.id, persona.full_name]))

  const totalesPorMedioYMoneda = new Map<string, number>()
  for (const pago of pagosDelDia) {
    const clave = `${pago.medio_pago}|${pago.moneda}`
    totalesPorMedioYMoneda.set(clave, (totalesPorMedioYMoneda.get(clave) ?? 0) + pago.monto)
  }

  const totalesEfectivo = [...totalesPorMedioYMoneda.entries()].filter(([clave]) =>
    clave.startsWith('efectivo|')
  )
  const totalesTransferencia = [...totalesPorMedioYMoneda.entries()].filter(([clave]) =>
    clave.startsWith('transferencia|')
  )

  const MOTIVO_ETIQUETA: Record<string, string> = {
    cuota: 'Cuota',
    sena: 'Seña',
    entrega: 'Entrega',
    ajuste: 'Corrección',
  }

  return (
    <main>
      <h1 className={`mb-2 ${TITULO_H1}`}>Cierre de caja</h1>
      <p className="mb-6 text-sm text-slate-600">
        Resumen de lo recibido en el día — efectivo y transferencias por separado, una caja única
        para toda la operación.
      </p>

      <FiltroEnVivo className="mb-6 flex items-end gap-3">
        <label className="text-sm text-slate-600">
          Fecha
          <input type="date" name="fecha" defaultValue={fecha} max={hoyISO()} className={ENTRADA} />
        </label>
      </FiltroEnVivo>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className={TARJETA}>
          <h2 className="mb-2 text-base font-semibold text-blue-900">Efectivo</h2>
          {totalesEfectivo.length === 0 ? (
            <p className="text-sm text-slate-600">Sin efectivo recibido este día.</p>
          ) : (
            <ul className="text-sm">
              {totalesEfectivo.map(([clave, total]) => {
                const moneda = clave.split('|')[1]
                return (
                  <li key={clave} className="font-semibold text-slate-800">
                    {total} {moneda}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <div className={TARJETA}>
          <h2 className="mb-2 text-base font-semibold text-blue-900">Transferencias</h2>
          {totalesTransferencia.length === 0 ? (
            <p className="text-sm text-slate-600">Sin transferencias recibidas este día.</p>
          ) : (
            <ul className="text-sm">
              {totalesTransferencia.map(([clave, total]) => {
                const moneda = clave.split('|')[1]
                return (
                  <li key={clave} className="font-semibold text-slate-800">
                    {total} {moneda}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <h2 className={TITULO_H2}>Detalle del día</h2>
        <a href={`/admin/cierre-caja/export?fecha=${fecha}`} className={ENLACE}>
          Descargar Excel →
        </a>
      </div>
      {pagosDelDia.length === 0 ? (
        <p className="text-sm text-slate-600">Ningún pago confirmado este día.</p>
      ) : (
        <div className={TABLA_CONTENEDOR}>
          <table className="w-full text-sm">
            <thead>
              <tr className={TABLA_HEADER_FILA}>
                <th className={TABLA_HEADER_CELDA}>Lote</th>
                <th className={TABLA_HEADER_CELDA}>Cliente</th>
                <th className={TABLA_HEADER_CELDA}>Medio</th>
                <th className={TABLA_HEADER_CELDA}>Motivo</th>
                <th className={TABLA_HEADER_CELDA}>Monto</th>
              </tr>
            </thead>
            <tbody>
              {pagosDelDia.map((pago) => (
                <tr key={pago.id} className={TABLA_FILA}>
                  <td className={TABLA_CELDA_PRINCIPAL}>
                    <EnlaceBoton href={`/admin/lotes/${pago.lote_id}`} className={ENLACE_TABLA}>
                      {pago.lotes?.identificador ?? '—'}
                    </EnlaceBoton>
                  </td>
                  <td className={TABLA_CELDA}>{nombreClientePorId.get(pago.cliente_id) ?? '—'}</td>
                  <td className={TABLA_CELDA}>{pago.medio_pago === 'efectivo' ? 'Efectivo' : 'Transferencia'}</td>
                  <td className={TABLA_CELDA}>{MOTIVO_ETIQUETA[pago.motivo] ?? pago.motivo}</td>
                  <td className={TABLA_CELDA}>
                    {pago.monto} {pago.moneda}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
