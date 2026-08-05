import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { confirmarPago } from './actions'

type Pago = {
  id: string
  monto: number
  moneda: string
  comprobante_path: string | null
  estado: string
  confirmado_acreedor_por: string | null
  confirmado_admin_por: string | null
  cliente_id: string
  monto_recibido: number | null
  moneda_recibida: string | null
}

export default async function PagosPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: perfilPropio } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  if (!perfilPropio) {
    redirect('/login')
  }

  const columnasPago =
    'id, monto, moneda, comprobante_path, estado, confirmado_acreedor_por, confirmado_admin_por, cliente_id, monto_recibido, moneda_recibida'

  let pagos: Pago[] = []

  if (perfilPropio!.role === 'acreedor') {
    const { data: misLotes } = await supabase
      .from('lotes')
      .select('cliente_id')
      .eq('acreedor_id', user!.id)
      .not('cliente_id', 'is', null)

    const clienteIds = [...new Set((misLotes ?? []).map((lote) => lote.cliente_id as string))]

    if (clienteIds.length > 0) {
      const { data } = await supabase
        .from('pagos')
        .select(columnasPago)
        .in('cliente_id', clienteIds)
        .order('created_at', { ascending: false })
      pagos = data ?? []
    }
  } else {
    const { data } = await supabase
      .from('pagos')
      .select(columnasPago)
      .order('created_at', { ascending: false })
    pagos = data ?? []
  }

  const admin = createAdminClient()

  const pagosConLink = await Promise.all(
    pagos.map(async (pago) => {
      if (!pago.comprobante_path) {
        return { ...pago, comprobanteUrl: null }
      }

      const { data, error } = await admin.storage
        .from('comprobantes')
        .createSignedUrl(pago.comprobante_path, 300)

      return { ...pago, comprobanteUrl: error ? null : data?.signedUrl ?? null }
    })
  )

  return (
    <main>
      <h1 className="mb-6 text-xl font-semibold">Pagos</h1>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Monto</th>
            <th>Comprobante</th>
            <th>Estado</th>
            <th>Confirmado acreedor</th>
            <th>Confirmado admin</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pagosConLink.map((pago) => {
            const confirmarEstePago = confirmarPago.bind(null, pago.id)

            return (
              <tr key={pago.id} className="border-b">
                <td className="py-2">
                  {pago.monto} {pago.moneda}
                </td>
                <td>
                  {pago.comprobante_path ? (
                    pago.comprobanteUrl ? (
                      <a href={pago.comprobanteUrl} target="_blank" className="underline">
                        Ver comprobante
                      </a>
                    ) : (
                      <span className="text-gray-500">Comprobante no disponible</span>
                    )
                  ) : (
                    <span className="text-gray-500">Sin comprobante</span>
                  )}
                </td>
                <td>{pago.estado}</td>
                <td>{pago.confirmado_acreedor_por ? 'Sí' : 'No'}</td>
                <td>{pago.confirmado_admin_por ? 'Sí' : 'No'}</td>
                <td>
                  {pago.estado === 'pendiente' &&
                    (pago.comprobante_path ? (
                      <form action={confirmarEstePago} className="flex flex-col gap-2">
                        <label className="text-xs text-gray-500">
                          Monto recibido (opcional, para cierre de caja)
                          <input
                            name="montoRecibido"
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={pago.monto_recibido ?? undefined}
                            className="mt-1 block rounded border px-2 py-1"
                          />
                        </label>
                        <label className="text-xs text-gray-500">
                          Moneda recibida
                          <select
                            name="monedaRecibida"
                            defaultValue={pago.moneda_recibida ?? 'USD'}
                            className="mt-1 block rounded border px-2 py-1"
                          >
                            <option value="USD">USD</option>
                            <option value="ARS">ARS</option>
                          </select>
                        </label>
                        <button type="submit" className="self-start underline">
                          Confirmar mi parte
                        </button>
                      </form>
                    ) : (
                      <span className="text-gray-500">Esperando comprobante</span>
                    ))}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </main>
  )
}
