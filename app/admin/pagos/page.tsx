import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { confirmarPago } from './actions'

export default async function PagosPage() {
  const supabase = await createClient()
  const { data: pagos } = await supabase
    .from('pagos')
    .select(
      'id, monto, moneda, comprobante_path, estado, confirmado_acreedor_por, confirmado_admin_por, cliente_id'
    )
    .order('created_at', { ascending: false })

  const admin = createAdminClient()

  const pagosConLink = await Promise.all(
    (pagos ?? []).map(async (pago) => {
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
                      <form action={confirmarEstePago}>
                        <button type="submit" className="underline">
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
