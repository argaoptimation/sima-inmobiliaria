import { createClient } from '@/lib/supabase/server'
import { requireAdminOCobrador } from '@/lib/auth/require-admin'
import { FiltroEnVivo } from '@/components/FiltroEnVivo'
import { hoyArgentina as hoyISO, fechaEnArgentina } from '@/lib/fecha/hoy-argentina'

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
      <h1 className="mb-2 text-xl font-semibold">Cierre de caja</h1>
      <p className="mb-6 text-sm text-gray-600">
        Resumen de lo recibido en el día — efectivo y transferencias por separado, una caja única
        para toda la operación.
      </p>

      <FiltroEnVivo className="mb-6 flex items-end gap-3">
        <label className="text-sm">
          Fecha
          <input
            type="date"
            name="fecha"
            defaultValue={fecha}
            max={hoyISO()}
            className="mt-1 block rounded border px-3 py-2"
          />
        </label>
      </FiltroEnVivo>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded border border-gray-200 bg-gray-50 p-4">
          <h2 className="mb-2 text-base font-semibold">Efectivo</h2>
          {totalesEfectivo.length === 0 ? (
            <p className="text-sm text-gray-600">Sin efectivo recibido este día.</p>
          ) : (
            <ul className="text-sm">
              {totalesEfectivo.map(([clave, total]) => {
                const moneda = clave.split('|')[1]
                return (
                  <li key={clave} className="font-semibold">
                    {total} {moneda}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <div className="rounded border border-gray-200 bg-gray-50 p-4">
          <h2 className="mb-2 text-base font-semibold">Transferencias</h2>
          {totalesTransferencia.length === 0 ? (
            <p className="text-sm text-gray-600">Sin transferencias recibidas este día.</p>
          ) : (
            <ul className="text-sm">
              {totalesTransferencia.map(([clave, total]) => {
                const moneda = clave.split('|')[1]
                return (
                  <li key={clave} className="font-semibold">
                    {total} {moneda}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Detalle del día</h2>
        <a href={`/admin/cierre-caja/export?fecha=${fecha}`} className="text-sm underline">
          Descargar Excel →
        </a>
      </div>
      {pagosDelDia.length === 0 ? (
        <p className="text-sm text-gray-600">Ningún pago confirmado este día.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Lote</th>
              <th>Cliente</th>
              <th>Medio</th>
              <th>Motivo</th>
              <th>Monto</th>
            </tr>
          </thead>
          <tbody>
            {pagosDelDia.map((pago) => (
              <tr key={pago.id} className="border-b">
                <td className="py-2">
                  <a href={`/admin/lotes/${pago.lote_id}`} className="underline">
                    {pago.lotes?.identificador ?? '—'}
                  </a>
                </td>
                <td>{nombreClientePorId.get(pago.cliente_id) ?? '—'}</td>
                <td>{pago.medio_pago === 'efectivo' ? 'Efectivo' : 'Transferencia'}</td>
                <td>{MOTIVO_ETIQUETA[pago.motivo] ?? pago.motivo}</td>
                <td>
                  {pago.monto} {pago.moneda}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
