import { createClient } from '@/lib/supabase/server'
import { requireAdminOCobrador } from '@/lib/auth/require-admin'
import { hoyArgentina } from '@/lib/fecha/hoy-argentina'
import { registrarPagoEfectivo } from './actions'
import { confirmarPago } from '../pagos/actions'
import { PanelEfectivo, type LoteConDeuda, type CuotaPendienteInfo } from './PanelEfectivo'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import { EncabezadoPagina } from '@/components/EncabezadoPagina'
import {
  TARJETA,
  TITULO_H2,
  BANNER_ERROR,
  BANNER_OK,
  ENLACE_TABLA,
  TABLA_CONTENEDOR,
  TABLA_HEADER_FILA,
  TABLA_HEADER_CELDA,
  TABLA_FILA,
  TABLA_CELDA,
} from '@/lib/ui/clases'

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
      <EncabezadoPagina titulo="Pagos en efectivo" migas={['Efectivo']} />
      <p className="mb-6 text-sm text-slate-600">
        Registrá acá la plata que se recibió en mano. Queda pendiente hasta que un administrador
        la marque como recibida — recién ahí queda confirmada y se refleja en el saldo del
        cliente.
      </p>

      {error && <p className={BANNER_ERROR}>{error}</p>}
      {ok && <p className={BANNER_OK}>{ok}</p>}

      <h2 className={`mb-2 ${TITULO_H2}`}>Registrar pago en efectivo</h2>
      <div className={`mb-8 ${TARJETA}`}>
        <PanelEfectivo
          lotes={lotesBuscables}
          cuotasPorLoteId={cuotasPorLoteId}
          hoy={hoyArgentina()}
          accion={registrarPagoEfectivo}
        />
      </div>

      <h2 className={`mb-2 ${TITULO_H2}`}>Pagos en efectivo</h2>
      {pagos.length === 0 ? (
        <p className="text-sm text-slate-600">Todavía no se registró ningún pago en efectivo.</p>
      ) : (
        <div className={TABLA_CONTENEDOR}>
          <table className="w-full text-sm">
            <thead>
              <tr className={TABLA_HEADER_FILA}>
                <th className={TABLA_HEADER_CELDA}>Fecha</th>
                <th className={TABLA_HEADER_CELDA}>Lote</th>
                <th className={TABLA_HEADER_CELDA}>Cliente</th>
                <th className={TABLA_HEADER_CELDA}>Monto</th>
                <th className={TABLA_HEADER_CELDA}>Estado</th>
                <th className={TABLA_HEADER_CELDA}></th>
              </tr>
            </thead>
            <tbody>
              {pagos.map((pago) => {
                const confirmarEstePago = confirmarPago.bind(null, pago.id)
                return (
                  <tr key={pago.id} className={TABLA_FILA}>
                    <td className={TABLA_CELDA}>{new Date(pago.created_at).toLocaleDateString('es-AR')}</td>
                    <td className={TABLA_CELDA}>
                      <EnlaceBoton href={`/admin/lotes/${pago.lote_id}`} className={ENLACE_TABLA}>
                        {pago.lotes?.identificador ?? '—'}
                      </EnlaceBoton>
                    </td>
                    <td className={TABLA_CELDA}>{nombreClientePorId.get(pago.cliente_id) ?? '—'}</td>
                    <td className={TABLA_CELDA}>
                      {pago.monto} {pago.moneda}
                    </td>
                    <td className={TABLA_CELDA}>
                      {pago.estado === 'confirmado' ? (
                        <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs text-green-700">
                          Recibido
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-700">
                          Pendiente
                        </span>
                      )}
                    </td>
                    <td className={TABLA_CELDA}>
                      {pago.estado === 'pendiente' &&
                        (esAdministrador ? (
                          <form action={confirmarEstePago}>
                            <input type="hidden" name="montoVisto" value={pago.monto} />
                            <input type="hidden" name="monto" value={pago.monto} />
                            <BotonEnvio className={ENLACE_TABLA}>Marcar como recibido</BotonEnvio>
                          </form>
                        ) : (
                          <span className="text-slate-500">Esperando confirmación del admin</span>
                        ))}
                      {pago.estado === 'confirmado' && (
                        <EnlaceBoton
                          href={`/admin/pagos/${pago.id}/recibo?desde=efectivo`}
                          className={ENLACE_TABLA}
                        >
                          Recibo
                        </EnlaceBoton>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
