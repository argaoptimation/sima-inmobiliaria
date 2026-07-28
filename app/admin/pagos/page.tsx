import { createClient } from '@/lib/supabase/server'
import { confirmarPago } from './actions'

export default async function PagosPage() {
  const supabase = await createClient()
  const { data: pagos } = await supabase
    .from('pagos')
    .select(
      'id, monto, moneda, comprobante_path, estado, confirmado_acreedor_por, confirmado_admin_por, cliente_id'
    )
    .order('created_at', { ascending: false })

  return (
    <main>
      <h1 className="mb-6 text-xl font-semibold">Pagos</h1>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Monto</th>
            <th>Estado</th>
            <th>Confirmado acreedor</th>
            <th>Confirmado admin</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pagos?.map((pago) => {
            const confirmarEstePago = confirmarPago.bind(null, pago.id)

            return (
              <tr key={pago.id} className="border-b">
                <td className="py-2">
                  {pago.monto} {pago.moneda}
                </td>
                <td>{pago.estado}</td>
                <td>{pago.confirmado_acreedor_por ? 'Sí' : 'No'}</td>
                <td>{pago.confirmado_admin_por ? 'Sí' : 'No'}</td>
                <td>
                  {pago.estado === 'pendiente' && (
                    <form action={confirmarEstePago}>
                      <button type="submit" className="underline">
                        Confirmar mi parte
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </main>
  )
}
