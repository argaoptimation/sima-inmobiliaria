import { createClient } from '@/lib/supabase/server'
import { calcularEstadoCobranza } from '@/lib/cobranza/estado-cliente'
import { notFound } from 'next/navigation'

export default async function LoteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()

  const { data: lote } = await supabase
    .from('lotes')
    .select(
      'id, identificador, moneda, estado, cliente_id, admin_id, acreedor_id, vendedor_id, cuenta_cobro_id'
    )
    .eq('id', id)
    .single()

  if (!lote) {
    notFound()
  }

  const { data: cuotas } = await supabase
    .from('cuotas')
    .select('id, numero, monto_base, saldo_pendiente, fecha_vencimiento')
    .eq('lote_id', id)
    .order('numero', { ascending: true })

  const hoy = new Date().toISOString().slice(0, 10)
  const estado =
    lote!.estado === 'vendido'
      ? calcularEstadoCobranza(
          (cuotas ?? []).map((cuota) => ({
            saldoPendiente: cuota.saldo_pendiente,
            fechaVencimiento: cuota.fecha_vencimiento,
          })),
          hoy
        )
      : null

  const { data: cliente } = lote!.cliente_id
    ? await supabase.from('profiles').select('full_name').eq('id', lote!.cliente_id).single()
    : { data: null }

  return (
    <main className="max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">{lote!.identificador}</h1>

      <p className="mb-1 text-sm">Moneda: {lote!.moneda}</p>
      <p className="mb-1 text-sm">Estado: {lote!.estado}</p>
      {cliente && <p className="mb-1 text-sm">Cliente: {cliente.full_name}</p>}
      {estado && (
        <p className="mb-4 text-sm">
          Estado de cobranza:{' '}
          <span
            className={
              estado === 'normal'
                ? 'text-green-700'
                : estado === 'moroso'
                  ? 'text-amber-700'
                  : 'text-red-700'
            }
          >
            {estado === 'normal' ? 'Normal' : estado === 'moroso' ? 'Moroso' : 'Candidato a prejudicial'}
          </span>
        </p>
      )}

      <h2 className="mb-2 mt-6 text-lg font-semibold">Cuotas</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Cuota</th>
            <th>Vencimiento</th>
            <th>Monto base</th>
            <th>Saldo pendiente</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {cuotas?.map((cuota) => {
            const vencida = cuota.saldo_pendiente > 0 && cuota.fecha_vencimiento < hoy
            return (
              <tr key={cuota.id} className="border-b">
                <td className="py-2">{cuota.numero}</td>
                <td>{cuota.fecha_vencimiento}</td>
                <td>
                  {cuota.monto_base} {lote!.moneda}
                </td>
                <td>
                  {cuota.saldo_pendiente} {lote!.moneda}
                </td>
                <td>{vencida && <span className="text-red-700">Vencida</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </main>
  )
}
