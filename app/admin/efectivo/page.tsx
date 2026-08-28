import { createClient } from '@/lib/supabase/server'
import { requireAdminOCobrador } from '@/lib/auth/require-admin'
import { hoyArgentina } from '@/lib/fecha/hoy-argentina'
import { registrarPagoEfectivo } from './actions'
import { confirmarPago } from '../pagos/actions'
import { PanelEfectivo, type LoteConDeuda, type CuotaPendienteInfo } from './PanelEfectivo'

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
    .select('id, identificador, cliente_id, moneda, interes_moratorio_diario, ciclo_actual')
    .eq('estado', 'vendido')
    .order('identificador')

  const loteIdsVendidos = (lotesVendidos ?? []).map((lote) => lote.id)
  const clienteIdsVendidos = [
    ...new Set((lotesVendidos ?? []).map((lote) => lote.cliente_id).filter(Boolean) as string[]),
  ]

  const { data: clientesVendidos } =
    clienteIdsVendidos.length > 0
      ? await supabase.from('profiles').select('id, full_name, dni').in('id', clienteIdsVendidos)
      : { data: [] }
  const clientePorId = new Map((clientesVendidos ?? []).map((cliente) => [cliente.id, cliente]))

  // Buscador amplio (por lote, cliente o DNI) + panel de cuotas/mora del
  // lote elegido (pedido de Gabriel 28/08) -- necesita las cuotas
  // PENDIENTES de cada lote vendido, acotadas al ciclo de venta vigente
  // (mismo criterio que confirmarPago/panel-morosos: nunca mostrar deuda de
  // un ciclo anterior si el lote fue rescindido y revendido).
  const { data: cuotasSinFiltrar } =
    loteIdsVendidos.length > 0
      ? await supabase
          .from('cuotas')
          .select('id, lote_id, numero, saldo_pendiente, fecha_vencimiento, ciclo')
          .in('lote_id', loteIdsVendidos)
          .gt('saldo_pendiente', 0)
          .order('numero', { ascending: true })
      : { data: [] }

  const cicloActualPorLoteId = new Map((lotesVendidos ?? []).map((lote) => [lote.id, lote.ciclo_actual]))

  const cuotasPorLoteId: Record<string, CuotaPendienteInfo[]> = {}
  for (const cuota of cuotasSinFiltrar ?? []) {
    if (cuota.ciclo !== cicloActualPorLoteId.get(cuota.lote_id)) continue
    const lista = cuotasPorLoteId[cuota.lote_id] ?? []
    lista.push({
      id: cuota.id,
      loteId: cuota.lote_id,
      numero: cuota.numero,
      fechaVencimiento: cuota.fecha_vencimiento,
      saldoPendiente: cuota.saldo_pendiente,
    })
    cuotasPorLoteId[cuota.lote_id] = lista
  }

  const lotesBuscables: LoteConDeuda[] = (lotesVendidos ?? []).map((lote) => ({
    id: lote.id,
    identificador: lote.identificador,
    clienteNombre: clientePorId.get(lote.cliente_id as string)?.full_name ?? '—',
    clienteDni: clientePorId.get(lote.cliente_id as string)?.dni ?? null,
    moneda: lote.moneda,
    interesMoratorioDiario: lote.interes_moratorio_diario,
  }))

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
      <div className="mb-8">
        <PanelEfectivo
          lotes={lotesBuscables}
          cuotasPorLoteId={cuotasPorLoteId}
          hoy={hoyArgentina()}
          accion={registrarPagoEfectivo}
        />
      </div>

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
