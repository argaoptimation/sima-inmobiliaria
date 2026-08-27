import { createClient } from '@/lib/supabase/server'
import { calcularEstadoCobranza } from '@/lib/cobranza/estado-cliente'
import { hoyArgentina } from '@/lib/fecha/hoy-argentina'
import { redirect } from 'next/navigation'

export default async function PortalClientePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: lotes } = await supabase
    .from('lotes')
    .select('id, identificador, moneda')
    .eq('cliente_id', user!.id)
    .order('identificador')

  if (!lotes || lotes.length === 0) {
    return (
      <div className="mx-auto mt-24 max-w-md p-6 text-center text-blue-900/70">
        <p>Todavía no tenés un lote asignado.</p>
      </div>
    )
  }

  const hoy = hoyArgentina()

  const lotesConEstado = await Promise.all(
    lotes.map(async (lote) => {
      const { data: cuotas } = await supabase
        .from('cuotas')
        .select('saldo_pendiente, fecha_vencimiento')
        .eq('lote_id', lote.id)

      const estado = calcularEstadoCobranza(
        (cuotas ?? []).map((cuota) => ({
          saldoPendiente: cuota.saldo_pendiente,
          fechaVencimiento: cuota.fecha_vencimiento,
        })),
        hoy
      )

      return { ...lote, estado }
    })
  )

  const ETIQUETA_ESTADO: Record<string, string> = {
    normal: 'Al día',
    moroso: 'Moroso',
    prejudicial: 'Posible prejudicial',
  }

  const CLASE_ESTADO: Record<string, string> = {
    normal: 'bg-green-50 text-green-700',
    moroso: 'bg-red-50 text-red-600 font-semibold',
    prejudicial: 'bg-amber-50 text-amber-700 font-semibold',
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-extrabold text-blue-900">Tus lotes</h1>
      <div className="overflow-hidden rounded-xl border border-blue-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-blue-50 text-left text-blue-900">
              <th className="px-4 py-3 font-semibold">Lote</th>
              <th className="px-4 py-3 font-semibold">Moneda</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {lotesConEstado.map((lote) => (
              <tr key={lote.id} className="border-t border-blue-100 hover:bg-blue-50/40">
                <td className="px-4 py-3 font-medium text-slate-800">{lote.identificador}</td>
                <td className="px-4 py-3 text-slate-600">{lote.moneda}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs ${CLASE_ESTADO[lote.estado]}`}>
                    {ETIQUETA_ESTADO[lote.estado]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <a
                    href={`/portal-cliente/lotes/${lote.id}`}
                    className="text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
                  >
                    Ver detalle →
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
