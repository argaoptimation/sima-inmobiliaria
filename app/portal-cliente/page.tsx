import { createClient } from '@/lib/supabase/server'
import { calcularEstadoCobranza } from '@/lib/cobranza/estado-cliente'
import { redirect } from 'next/navigation'

export default async function PortalClientePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: lote } = await supabase
    .from('lotes')
    .select('id, identificador, moneda')
    .eq('cliente_id', user.id)
    .single()

  if (!lote) {
    return (
      <main className="mx-auto mt-24 max-w-md p-6 text-center">
        <p>Todavía no tenés un lote asignado.</p>
      </main>
    )
  }

  const { data: cuotas } = await supabase
    .from('cuotas')
    .select('id, numero, monto_base, saldo_pendiente, fecha_vencimiento')
    .eq('lote_id', lote.id)
    .order('numero', { ascending: true })

  const hoy = new Date().toISOString().slice(0, 10)
  const estado = calcularEstadoCobranza(
    (cuotas ?? []).map((cuota) => ({
      saldoPendiente: cuota.saldo_pendiente,
      fechaVencimiento: cuota.fecha_vencimiento,
    })),
    hoy
  )

  const primeraImpaga = cuotas?.find((cuota) => cuota.saldo_pendiente > 0)

  return (
    <main className="mx-auto mt-12 max-w-2xl p-6">
      <h1 className="mb-2 text-xl font-semibold">{lote.identificador}</h1>
      <p className="mb-6 text-sm">
        Estado:{' '}
        <span
          className={
            estado === 'normal'
              ? 'text-green-700'
              : estado === 'moroso'
                ? 'text-amber-700'
                : 'text-red-700'
          }
        >
          {estado}
        </span>
      </p>
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
          {cuotas?.map((cuota) => (
            <tr key={cuota.id} className="border-b">
              <td className="py-2">{cuota.numero}</td>
              <td>{cuota.fecha_vencimiento}</td>
              <td>
                {cuota.monto_base} {lote.moneda}
              </td>
              <td>
                {cuota.saldo_pendiente} {lote.moneda}
              </td>
              <td>
                {primeraImpaga?.id === cuota.id && (
                  <a href={`/portal-cliente/pagar/${cuota.id}`} className="underline">
                    Pagar / subir comprobante
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
