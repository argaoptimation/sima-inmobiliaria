import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminOAcreedor } from '@/lib/auth/require-admin'
import { confirmarPago, editarMontoPago } from './actions'

type Pago = {
  id: string
  monto: number
  moneda: string
  comprobante_path: string | null
  motivo: string
  estado: string
  confirmado_acreedor_por: string | null
  confirmado_admin_por: string | null
  cliente_id: string
  lote_id: string
  monto_recibido: number | null
  moneda_recibida: string | null
}

export default async function PagosPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; q?: string }>
}) {
  const { error, q: filtroTexto } = await searchParams

  await requireAdminOAcreedor()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: perfilPropio } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  const columnasPago =
    'id, monto, moneda, comprobante_path, motivo, estado, confirmado_acreedor_por, confirmado_admin_por, cliente_id, lote_id, monto_recibido, moneda_recibida'

  let loteIdsBusqueda: string[] | null = null

  if (filtroTexto) {
    const { data: lotesPorIdentificador } = await supabase
      .from('lotes')
      .select('id')
      .ilike('identificador', `%${filtroTexto}%`)

    const { data: clientesPorNombre } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'cliente')
      .ilike('full_name', `%${filtroTexto}%`)

    const clienteIds = (clientesPorNombre ?? []).map((cliente) => cliente.id)

    const { data: lotesPorCliente } =
      clienteIds.length > 0
        ? await supabase.from('lotes').select('id').in('cliente_id', clienteIds)
        : { data: [] }

    loteIdsBusqueda = [
      ...new Set([
        ...(lotesPorIdentificador ?? []).map((lote) => lote.id),
        ...(lotesPorCliente ?? []).map((lote) => lote.id),
      ]),
    ]
  }

  let pagos: Pago[] = []

  if (perfilPropio!.role === 'acreedor') {
    const { data: misLotes } = await supabase
      .from('lotes')
      .select('id')
      .eq('acreedor_id', user!.id)

    let loteIds = (misLotes ?? []).map((lote) => lote.id)

    if (loteIdsBusqueda !== null) {
      const busquedaSet = new Set(loteIdsBusqueda)
      loteIds = loteIds.filter((id) => busquedaSet.has(id))
    }

    if (loteIds.length > 0) {
      const { data } = await supabase
        .from('pagos')
        .select(columnasPago)
        .in('lote_id', loteIds)
        .order('created_at', { ascending: false })
      pagos = data ?? []
    }
  } else {
    if (loteIdsBusqueda !== null) {
      if (loteIdsBusqueda.length > 0) {
        const { data } = await supabase
          .from('pagos')
          .select(columnasPago)
          .in('lote_id', loteIdsBusqueda)
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
  }

  const idsPagos = pagos.map((pago) => pago.id)

  const { data: ajustes } =
    idsPagos.length > 0
      ? await supabase.from('pagos').select('corrige_pago_id, monto').in('corrige_pago_id', idsPagos)
      : { data: [] }

  const montoEfectivoPorId = new Map<string, number>(pagos.map((pago) => [pago.id, pago.monto]))

  for (const ajuste of ajustes ?? []) {
    if (!ajuste.corrige_pago_id) continue
    montoEfectivoPorId.set(
      ajuste.corrige_pago_id,
      (montoEfectivoPorId.get(ajuste.corrige_pago_id) ?? 0) + ajuste.monto
    )
  }

  const admin = createAdminClient()

  const loteIdsConPago = [...new Set(pagos.map((pago) => pago.lote_id))]

  const { data: lotesConPago } =
    loteIdsConPago.length > 0
      ? await supabase
          .from('lotes')
          .select('id, identificador, acreedor_id, cuenta_cobro_externa_id')
          .in('id', loteIdsConPago)
      : { data: [] }

  const lotePorId = new Map((lotesConPago ?? []).map((lote) => [lote.id, lote]))

  const clienteIdsConPago = [...new Set(pagos.map((pago) => pago.cliente_id))]

  const { data: clientesConPago } =
    clienteIdsConPago.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', clienteIdsConPago)
      : { data: [] }

  const nombreClientePorId = new Map(
    (clientesConPago ?? []).map((cliente) => [cliente.id, cliente.full_name])
  )

  const pagosConLink = await Promise.all(
    pagos.map(async (pago) => {
      const lote = lotePorId.get(pago.lote_id)
      const sinAcreedorVinculado = !lote?.acreedor_id
      const identificadorLote = lote?.identificador ?? '—'
      const nombreCliente = nombreClientePorId.get(pago.cliente_id) ?? '—'

      if (!pago.comprobante_path) {
        return {
          ...pago,
          comprobanteUrl: null,
          sinAcreedorVinculado,
          identificadorLote,
          nombreCliente,
          cuentaCobroExterna: Boolean(lote?.cuenta_cobro_externa_id),
          montoEfectivo: montoEfectivoPorId.get(pago.id) ?? pago.monto,
        }
      }

      const { data, error: errorSignedUrl } = await admin.storage
        .from('comprobantes')
        .createSignedUrl(pago.comprobante_path, 300)

      return {
        ...pago,
        comprobanteUrl: errorSignedUrl ? null : data?.signedUrl ?? null,
        sinAcreedorVinculado,
        identificadorLote,
        nombreCliente,
        cuentaCobroExterna: Boolean(lote?.cuenta_cobro_externa_id),
        montoEfectivo: montoEfectivoPorId.get(pago.id) ?? pago.monto,
      }
    })
  )

  return (
    <main>
      <h1 className="mb-6 text-xl font-semibold">Pagos</h1>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Buscar
          <input
            type="text"
            name="q"
            placeholder="Buscar cliente o lote"
            defaultValue={filtroTexto ?? ''}
            className="mt-1 block rounded border px-3 py-2"
          />
        </label>
        <button type="submit" className="rounded border px-3 py-2 text-sm">
          Filtrar
        </button>
        {filtroTexto && (
          <a href="/admin/pagos" className="text-sm underline">
            Limpiar búsqueda
          </a>
        )}
      </form>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Lote</th>
            <th>Cliente</th>
            <th>Motivo</th>
            <th>Monto</th>
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
            const editarMontoEstePago = editarMontoPago.bind(null, pago.id)

            return (
              <tr key={pago.id} className="border-b">
                <td className="py-2">{pago.identificadorLote}</td>
                <td>{pago.nombreCliente}</td>
                <td>
                  {pago.motivo === 'sena'
                    ? 'Seña'
                    : pago.motivo === 'ajuste'
                      ? 'Corrección'
                      : pago.motivo === 'entrega'
                        ? 'Entrega'
                        : 'Cuota'}
                </td>
                <td>
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
                <td>
                  {pago.cuentaCobroExterna ? (
                    <span className="text-gray-500">— (cuenta externa)</span>
                  ) : pago.sinAcreedorVinculado ? (
                    <span className="font-semibold text-red-700">⚠ Lote sin acreedor vinculado</span>
                  ) : pago.confirmado_acreedor_por ? (
                    'Sí'
                  ) : (
                    'No'
                  )}
                </td>
                <td>{pago.confirmado_admin_por ? 'Sí' : 'No'}</td>
                <td>
                  {pago.estado === 'pendiente' &&
                    (pago.comprobante_path ? (
                      <>
                        {pago.sinAcreedorVinculado && (
                          <p className="mb-2 font-semibold text-red-700">
                            ⚠ Este lote todavía no tiene un acreedor vinculado. Podés confirmar
                            tu parte, pero el pago no se va a completar hasta asignar uno desde
                            el detalle del lote.
                          </p>
                        )}
                        <form action={confirmarEstePago} className="flex flex-col gap-2">
                        <input type="hidden" name="montoVisto" value={pago.monto} />
                        <label className="text-xs text-gray-500">
                          Monto a confirmar
                          <input
                            name="monto"
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={pago.monto}
                            required
                            className="mt-1 block rounded border px-2 py-1"
                          />
                        </label>
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
                      </>
                    ) : (
                      <span className="text-gray-500">Esperando comprobante</span>
                    ))}
                  {pago.estado === 'confirmado' &&
                    pago.motivo !== 'ajuste' &&
                    perfilPropio!.role === 'administrador' && (
                      <form action={editarMontoEstePago} className="flex flex-col gap-2">
                        <input type="hidden" name="montoEfectivoVisto" value={pago.montoEfectivo} />
                        <label className="text-xs text-gray-500">
                          Corregir monto (actual: {pago.montoEfectivo} {pago.moneda})
                          <input
                            name="montoNuevo"
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={pago.montoEfectivo}
                            required
                            className="mt-1 block rounded border px-2 py-1"
                          />
                        </label>
                        <button type="submit" className="self-start underline">
                          Editar monto
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
