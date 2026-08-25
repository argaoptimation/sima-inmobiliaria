import { createClient } from '@/lib/supabase/server'
import { requireAdminOCobrador } from '@/lib/auth/require-admin'
import { registrarPagoEfectivo } from './actions'
import { confirmarPago } from '../pagos/actions'
import { BuscadorLote } from '../cuentas-corrientes/BuscadorLote'

export default async function EfectivoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>
}) {
  const { error, ok } = await searchParams

  await requireAdminOCobrador()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: perfilPropio } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  const esAdministrador = perfilPropio!.role === 'administrador'

  const { data: lotesVendidos } = await supabase
    .from('lotes')
    .select('id, identificador')
    .eq('estado', 'vendido')
    .order('identificador')

  const { data: pagosData } = await supabase
    .from('pagos')
    .select(
      'id, monto, moneda, estado, confirmado_admin_por, created_at, lote_id, cliente_id, lotes(identificador)'
    )
    .eq('medio_pago', 'efectivo')
    .order('created_at', { ascending: false })

  const pagos = (pagosData ?? []) as unknown as Array<{
    id: string
    monto: number
    moneda: string
    estado: string
    confirmado_admin_por: string | null
    created_at: string
    lote_id: string
    cliente_id: string
    lotes: { identificador: string } | null
  }>

  const clienteIds = [...new Set(pagos.map((p) => p.cliente_id))]
  const { data: clientes } =
    clienteIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', clienteIds)
      : { data: [] }
  const nombreClientePorId = new Map((clientes ?? []).map((c) => [c.id, c.full_name]))

  return (
    <main>
      <h1 className="mb-2 text-xl font-semibold">Pagos en efectivo</h1>
      <p className="mb-6 text-sm text-gray-600">
        Registrá acá la plata que se recibió en mano. Queda pendiente hasta que un administrador
        la marque como recibida — recién ahí queda confirmada y se refleja en el saldo del
        cliente.
      </p>

      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      {ok && <p className="mb-4 rounded bg-green-100 p-2 text-sm text-green-700">{ok}</p>}

      <h2 className="mb-2 text-lg font-semibold">Registrar pago en efectivo</h2>
      <form action={registrarPagoEfectivo} className="mb-8 flex max-w-sm flex-col gap-3">
        <label className="text-sm">
          Lote
          <BuscadorLote lotes={lotesVendidos ?? []} />
        </label>
        <label className="text-sm">
          Monto
          <input
            name="monto"
            type="number"
            step="0.01"
            min="0.01"
            required
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Moneda
          <select name="moneda" defaultValue="USD" className="mt-1 block w-full rounded border px-3 py-2">
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>
        </label>
        <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
          Registrar
        </button>
      </form>

      <h2 className="mb-2 text-lg font-semibold">Pagos en efectivo</h2>
      {pagos.length === 0 ? (
        <p className="text-sm text-gray-600">Todavía no se registró ningún pago en efectivo.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Fecha</th>
              <th>Lote</th>
              <th>Cliente</th>
              <th>Monto</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pagos.map((pago) => {
              const confirmarEstePago = confirmarPago.bind(null, pago.id)
              return (
                <tr key={pago.id} className="border-b">
                  <td className="py-2">{new Date(pago.created_at).toLocaleDateString('es-AR')}</td>
                  <td>
                    <a href={`/admin/lotes/${pago.lote_id}`} className="underline">
                      {pago.lotes?.identificador ?? '—'}
                    </a>
                  </td>
                  <td>{nombreClientePorId.get(pago.cliente_id) ?? '—'}</td>
                  <td>
                    {pago.monto} {pago.moneda}
                  </td>
                  <td>{pago.estado === 'confirmado' ? 'Recibido' : 'Pendiente'}</td>
                  <td>
                    {pago.estado === 'pendiente' &&
                      (esAdministrador ? (
                        <form action={confirmarEstePago}>
                          <input type="hidden" name="montoVisto" value={pago.monto} />
                          <input type="hidden" name="monto" value={pago.monto} />
                          <button type="submit" className="text-sm underline">
                            Marcar como recibido
                          </button>
                        </form>
                      ) : (
                        <span className="text-gray-500">Esperando confirmación del admin</span>
                      ))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </main>
  )
}
