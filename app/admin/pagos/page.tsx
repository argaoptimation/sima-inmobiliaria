import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminOAcreedor } from '@/lib/auth/require-admin'
import { confirmarPago, editarMontoPago } from './actions'
import { FiltroEnVivo } from '@/components/FiltroEnVivo'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import {
  TARJETA,
  ENTRADA,
  BOTON_SECUNDARIO,
  ENLACE,
  TITULO_H1,
  BANNER_ERROR,
  TABLA_CONTENEDOR,
  TABLA_HEADER_FILA,
  TABLA_HEADER_CELDA,
  TABLA_FILA,
  TABLA_CELDA,
} from '@/lib/ui/clases'

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
  medio_pago: 'efectivo' | 'transferencia'
  created_at: string
}

// Intersección de varios filtros por lote_id (búsqueda de texto + acreedor)
// -- si ninguno está activo, no filtra nada (null); si hay más de uno
// activo, un lote solo pasa si está en TODOS.
function interseccionDeLoteIds(listas: (string[] | null)[]): string[] | null {
  const activas = listas.filter((lista): lista is string[] => lista !== null)
  if (activas.length === 0) return null
  return activas.reduce((acumulado, lista) => {
    const set = new Set(lista)
    return acumulado.filter((id) => set.has(id))
  })
}

export default async function PagosPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; q?: string; estado?: string; acreedor?: string }>
}) {
  const { error, q: filtroTexto, estado: filtroEstado, acreedor: filtroAcreedorId } = await searchParams

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
    'id, monto, moneda, comprobante_path, motivo, estado, confirmado_acreedor_por, confirmado_admin_por, cliente_id, lote_id, monto_recibido, moneda_recibida, medio_pago, created_at'

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

  // Filtro por acreedor: solo tiene sentido para admin (un acreedor ya ve
  // nada más que sus propios lotes, filtrarlo por sí mismo no aporta nada).
  let loteIdsFiltroAcreedor: string[] | null = null
  if (filtroAcreedorId && perfilPropio!.role !== 'acreedor') {
    const { data: lotesDelAcreedor } = await supabase
      .from('lotes')
      .select('id')
      .eq('acreedor_id', filtroAcreedorId)
    loteIdsFiltroAcreedor = (lotesDelAcreedor ?? []).map((lote) => lote.id)
  }

  const loteIdsFiltro = interseccionDeLoteIds([loteIdsBusqueda, loteIdsFiltroAcreedor])

  let pagos: Pago[] = []

  if (perfilPropio!.role === 'acreedor') {
    const { data: misLotes } = await supabase
      .from('lotes')
      .select('id')
      .eq('acreedor_id', user!.id)

    let loteIds = (misLotes ?? []).map((lote) => lote.id)

    if (loteIdsFiltro !== null) {
      const filtroSet = new Set(loteIdsFiltro)
      loteIds = loteIds.filter((id) => filtroSet.has(id))
    }

    if (loteIds.length > 0) {
      let query = supabase
        .from('pagos')
        .select(columnasPago)
        .in('lote_id', loteIds)
        .order('created_at', { ascending: false })
      if (filtroEstado) query = query.eq('estado', filtroEstado)
      const { data } = await query
      pagos = data ?? []
    }
  } else {
    if (loteIdsFiltro !== null) {
      if (loteIdsFiltro.length > 0) {
        let query = supabase
          .from('pagos')
          .select(columnasPago)
          .in('lote_id', loteIdsFiltro)
          .order('created_at', { ascending: false })
        if (filtroEstado) query = query.eq('estado', filtroEstado)
        const { data } = await query
        pagos = data ?? []
      }
    } else {
      let query = supabase.from('pagos').select(columnasPago).order('created_at', { ascending: false })
      if (filtroEstado) query = query.eq('estado', filtroEstado)
      const { data } = await query
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

  const acreedorIdsConPago = [
    ...new Set((lotesConPago ?? []).map((lote) => lote.acreedor_id).filter(Boolean) as string[]),
  ]
  const { data: acreedoresConPago } =
    acreedorIdsConPago.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', acreedorIdsConPago)
      : { data: [] }
  const nombreAcreedorPorId = new Map(
    (acreedoresConPago ?? []).map((acreedor) => [acreedor.id, acreedor.full_name])
  )

  // Lista completa de acreedores para el desplegable del filtro -- solo
  // tiene sentido para admin (un acreedor no necesita filtrarse a sí mismo).
  const { data: todosLosAcreedores } =
    perfilPropio!.role !== 'acreedor'
      ? await supabase.from('profiles').select('id, full_name').eq('role', 'acreedor').order('full_name')
      : { data: [] }

  const pagosConLink = await Promise.all(
    pagos.map(async (pago) => {
      const lote = lotePorId.get(pago.lote_id)
      const sinAcreedorVinculado = !lote?.acreedor_id
      const identificadorLote = lote?.identificador ?? '—'
      const nombreCliente = nombreClientePorId.get(pago.cliente_id) ?? '—'
      const nombreAcreedor = lote?.acreedor_id ? nombreAcreedorPorId.get(lote.acreedor_id) ?? '—' : '—'

      if (!pago.comprobante_path) {
        return {
          ...pago,
          comprobanteUrl: null,
          sinAcreedorVinculado,
          identificadorLote,
          nombreCliente,
          nombreAcreedor,
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
        nombreAcreedor,
        identificadorLote,
        nombreCliente,
        cuentaCobroExterna: Boolean(lote?.cuenta_cobro_externa_id),
        montoEfectivo: montoEfectivoPorId.get(pago.id) ?? pago.monto,
      }
    })
  )

  return (
    <main>
      <h1 className={`mb-6 ${TITULO_H1}`}>Pagos</h1>
      {error && <p className={BANNER_ERROR}>{error}</p>}
      <FiltroEnVivo className={`mb-4 flex flex-wrap items-end gap-3 ${TARJETA}`}>
        <label className="text-sm text-slate-600">
          Buscar
          <input
            type="text"
            name="q"
            placeholder="Buscar cliente o lote"
            defaultValue={filtroTexto ?? ''}
            className={ENTRADA}
          />
        </label>
        <label className="text-sm text-slate-600">
          Estado
          <select
            name="estado"
            defaultValue={filtroEstado ?? ''}
            className={ENTRADA}
          >
            <option value="">Todos</option>
            <option value="confirmado">Confirmado</option>
            <option value="pendiente">Pendiente</option>
          </select>
        </label>
        {perfilPropio!.role !== 'acreedor' && (
          <label className="text-sm text-slate-600">
            Acreedor
            <select
              name="acreedor"
              defaultValue={filtroAcreedorId ?? ''}
              className={ENTRADA}
            >
              <option value="">Todos</option>
              {(todosLosAcreedores ?? []).map((acreedor) => (
                <option key={acreedor.id} value={acreedor.id}>
                  {acreedor.full_name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" className={`cursor-pointer ${BOTON_SECUNDARIO}`}>
          Filtrar
        </button>
        {(filtroTexto || filtroEstado || filtroAcreedorId) && (
          <EnlaceBoton href="/admin/pagos" className={`text-sm ${ENLACE}`}>
            Limpiar filtros
          </EnlaceBoton>
        )}
      </FiltroEnVivo>
      <div className={TABLA_CONTENEDOR}>
      <table className="w-full text-sm">
        <thead>
          <tr className={TABLA_HEADER_FILA}>
            <th className={TABLA_HEADER_CELDA}>Fecha</th>
            <th className={TABLA_HEADER_CELDA}>Lote</th>
            <th className={TABLA_HEADER_CELDA}>Cliente</th>
            <th className={TABLA_HEADER_CELDA}>Acreedor</th>
            <th className={TABLA_HEADER_CELDA}>Motivo</th>
            <th className={TABLA_HEADER_CELDA}>Medio</th>
            <th className={TABLA_HEADER_CELDA}>Monto</th>
            <th className={TABLA_HEADER_CELDA}>Comprobante</th>
            <th className={TABLA_HEADER_CELDA}>Estado</th>
            <th className={TABLA_HEADER_CELDA}>Confirmado acreedor</th>
            <th className={TABLA_HEADER_CELDA}>Confirmado admin</th>
            <th className={TABLA_HEADER_CELDA}></th>
          </tr>
        </thead>
        <tbody>
          {pagosConLink.map((pago) => {
            const confirmarEstePago = confirmarPago.bind(null, pago.id)
            const editarMontoEstePago = editarMontoPago.bind(null, pago.id)

            return (
              <tr key={pago.id} className={TABLA_FILA}>
                <td className={TABLA_CELDA}>{new Date(pago.created_at).toLocaleDateString('es-AR')}</td>
                <td className={TABLA_CELDA}>{pago.identificadorLote}</td>
                <td className={TABLA_CELDA}>{pago.nombreCliente}</td>
                <td className={TABLA_CELDA}>{pago.nombreAcreedor}</td>
                <td className={TABLA_CELDA}>
                  {pago.motivo === 'sena'
                    ? 'Seña'
                    : pago.motivo === 'ajuste'
                      ? 'Corrección'
                      : pago.motivo === 'entrega'
                        ? 'Entrega'
                        : 'Cuota'}
                </td>
                <td className={TABLA_CELDA}>{pago.medio_pago === 'efectivo' ? 'Efectivo' : 'Transferencia'}</td>
                <td className={TABLA_CELDA}>
                  {pago.monto} {pago.moneda}
                </td>
                <td className={TABLA_CELDA}>
                  {pago.comprobante_path ? (
                    pago.comprobanteUrl ? (
                      <a href={pago.comprobanteUrl} target="_blank" className={ENLACE}>
                        Ver comprobante
                      </a>
                    ) : (
                      <span className="text-slate-500">Comprobante no disponible</span>
                    )
                  ) : pago.medio_pago === 'efectivo' ? (
                    <span className="text-slate-500">— (efectivo, no hace falta)</span>
                  ) : (
                    <span className="text-slate-500">Sin comprobante</span>
                  )}
                </td>
                <td className={TABLA_CELDA}>{pago.estado}</td>
                <td className={TABLA_CELDA}>
                  {pago.medio_pago === 'efectivo' ? (
                    <span className="text-slate-500">— (efectivo)</span>
                  ) : pago.cuentaCobroExterna ? (
                    <span className="text-slate-500">— (cuenta externa)</span>
                  ) : pago.sinAcreedorVinculado ? (
                    <span className="font-semibold text-red-700">⚠ Lote sin acreedor vinculado</span>
                  ) : pago.confirmado_acreedor_por ? (
                    'Sí'
                  ) : (
                    'No'
                  )}
                </td>
                <td className={TABLA_CELDA}>{pago.confirmado_admin_por ? 'Sí' : 'No'}</td>
                <td className={TABLA_CELDA}>
                  {pago.estado === 'pendiente' &&
                  pago.medio_pago === 'efectivo' &&
                  perfilPropio!.role !== 'administrador' ? (
                    <span className="text-slate-500">Pendiente de confirmación del admin</span>
                  ) : (
                    pago.estado === 'pendiente' &&
                    (pago.comprobante_path || pago.medio_pago === 'efectivo' ? (
                      <>
                        {pago.sinAcreedorVinculado && pago.medio_pago !== 'efectivo' && (
                          <p className="mb-2 font-semibold text-red-700">
                            ⚠ Este lote todavía no tiene un acreedor vinculado. Podés confirmar
                            tu parte, pero el pago no se va a completar hasta asignar uno desde
                            el detalle del lote.
                          </p>
                        )}
                        <form action={confirmarEstePago} className="flex flex-col gap-2">
                        <input type="hidden" name="montoVisto" value={pago.monto} />
                        <label className="text-xs text-slate-500">
                          Monto a confirmar
                          <input
                            name="monto"
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={pago.monto}
                            required
                            className={ENTRADA}
                          />
                        </label>
                        <label className="text-xs text-slate-500">
                          Monto recibido (opcional, para cierre de caja)
                          <input
                            name="montoRecibido"
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={pago.monto_recibido ?? undefined}
                            className={ENTRADA}
                          />
                        </label>
                        <label className="text-xs text-slate-500">
                          Moneda recibida
                          <select
                            name="monedaRecibida"
                            defaultValue={pago.moneda_recibida ?? 'USD'}
                            className={ENTRADA}
                          >
                            <option value="USD">USD</option>
                            <option value="ARS">ARS</option>
                          </select>
                        </label>
                        <BotonEnvio className={`cursor-pointer self-start ${ENLACE}`}>
                          Confirmar mi parte
                        </BotonEnvio>
                        </form>
                      </>
                    ) : (
                      <span className="text-slate-500">Esperando comprobante</span>
                    )))}
                  {pago.estado === 'confirmado' &&
                    pago.motivo !== 'ajuste' &&
                    perfilPropio!.role === 'administrador' && (
                      <form action={editarMontoEstePago} className="flex flex-col gap-2">
                        <input type="hidden" name="montoEfectivoVisto" value={pago.montoEfectivo} />
                        <label className="text-xs text-slate-500">
                          Corregir monto (actual: {pago.montoEfectivo} {pago.moneda})
                          <input
                            name="montoNuevo"
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={pago.montoEfectivo}
                            required
                            className={ENTRADA}
                          />
                        </label>
                        <BotonEnvio className={`cursor-pointer self-start ${ENLACE}`}>
                          Editar monto
                        </BotonEnvio>
                      </form>
                    )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>

      {perfilPropio!.role === 'administrador' && (
        // A propósito sin link en la navegación principal (pedido de Gabriel
        // 28/08: "una pestaña que no esté visible pero que se pueda ver sin
        // ningún problema") -- queda accesible acá, al pie.
        <p className="mt-6 text-xs text-slate-400">
          <EnlaceBoton href="/admin/pagos/auditoria" className={ENLACE}>
            Ver historial de auditoría de confirmaciones →
          </EnlaceBoton>
        </p>
      )}
    </main>
  )
}
