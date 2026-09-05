import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminAcreedorOCobrador } from '@/lib/auth/require-admin'
import { confirmarPago, editarMontoPago } from './actions'
import { FiltroEnVivo } from '@/components/FiltroEnVivo'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import { EncabezadoPagina } from '@/components/EncabezadoPagina'
import {
  ENTRADA,
  BOTON_SECUNDARIO,
  ENLACE,
  BANNER_ERROR,
  BADGE_BASE,
  BADGE_VERDE,
  BADGE_AMARILLO,
  NUMERO_TABULAR,
  PAGO_TARJETA,
  PAGO_TARJETA_ALERTA,
  PAGO_TARJETA_HEADER,
  PAGO_FORM_CONFIRMACION,
  PAGO_BANNER_ALERTA,
} from '@/lib/ui/clases'
import { FileImage, Banknote, ExternalLink, TriangleAlert, CheckCircle2, Clock } from 'lucide-react'

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

function interseccionDeLoteIds(listas: (string[] | null)[]): string[] | null {
  const activas = listas.filter((lista): lista is string[] => lista !== null)
  if (activas.length === 0) return null
  return activas.reduce((acumulado, lista) => {
    const set = new Set(lista)
    return acumulado.filter((id) => set.has(id))
  })
}

function obtenerMotivoTexto(motivo: string) {
  switch (motivo) {
    case 'sena':
      return 'Seña'
    case 'ajuste':
      return 'Corrección'
    case 'saldar':
      return 'Pago total anticipado'
    case 'entrega':
      return 'Entrega'
    default:
      return 'Cuota'
  }
}

// Pantalla de Pagos (PR4 del rediseño, MOCKUP 4): bandeja de aprobación en tarjetas
// en lugar de tabla ancha de 12 columnas. Encabezado con cliente+DNI, lote, motivo,
// medio de pago, monto, link a comprobante y badge de estado; formulario de
// confirmación plegado dentro de la tarjeta para pagos pendientes.
export default async function PagosPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string
    q?: string
    estado?: string
    acreedor?: string
    motivo?: string
    desde?: string
    hasta?: string
  }>
}) {
  const {
    error,
    q: filtroTexto,
    estado: filtroEstado,
    acreedor: filtroAcreedorId,
    motivo: filtroMotivo,
    desde: filtroDesde,
    hasta: filtroHasta,
  } = await searchParams

  // Cobrador ahora entra acá también (03/09, confirmado con Nico) -- ya
  // veía el link "Pagos" en el sidebar pero la página lo bloqueaba igual.
  await requireAdminAcreedorOCobrador()

  // "Esperando mi confirmación" (05/09, pedido de Gabriel): "Pendientes"
  // mezcla dos cosas muy distintas -- el cliente que todavía no pagó y el
  // pago que YA llegó y espera que yo mire el comprobante. Este filtro
  // deja solo lo segundo. No es un estado en la base: se filtra sobre el
  // mismo predicado que habilita el botón Confirmar, así que el filtro y
  // el botón nunca pueden discrepar.
  const soloEsperandoMiConfirmacion = filtroEstado === 'por-confirmar'
  const estadoParaQuery = soloEsperandoMiConfirmacion ? 'pendiente' : filtroEstado

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

    const textoSaneado = filtroTexto.replace(/[,()]/g, '')
    const { data: clientesPorNombreODni } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'cliente')
      .or(`full_name.ilike.%${textoSaneado}%,dni.ilike.%${textoSaneado}%`)

    const clienteIds = (clientesPorNombreODni ?? []).map((cliente) => cliente.id)

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
      if (estadoParaQuery) query = query.eq('estado', estadoParaQuery)
      if (filtroMotivo) query = query.eq('motivo', filtroMotivo)
      if (filtroDesde) query = query.gte('created_at', `${filtroDesde}T00:00:00`)
      if (filtroHasta) query = query.lte('created_at', `${filtroHasta}T23:59:59`)
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
        if (estadoParaQuery) query = query.eq('estado', estadoParaQuery)
        if (filtroMotivo) query = query.eq('motivo', filtroMotivo)
        if (filtroDesde) query = query.gte('created_at', `${filtroDesde}T00:00:00`)
        if (filtroHasta) query = query.lte('created_at', `${filtroHasta}T23:59:59`)
        const { data } = await query
        pagos = data ?? []
      }
    } else {
      let query = supabase.from('pagos').select(columnasPago).order('created_at', { ascending: false })
      if (estadoParaQuery) query = query.eq('estado', estadoParaQuery)
      if (filtroMotivo) query = query.eq('motivo', filtroMotivo)
      if (filtroDesde) query = query.gte('created_at', `${filtroDesde}T00:00:00`)
      if (filtroHasta) query = query.lte('created_at', `${filtroHasta}T23:59:59`)
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
          .select('id, identificador, acreedor_id, cuenta_cobro_externa_id, loteo_id, manzana, numero_lote, loteos(nombre)')
          .in('id', loteIdsConPago)
      : { data: [] }

  const lotePorId = new Map(
    ((lotesConPago ?? []) as unknown as Array<{
      id: string
      identificador: string
      acreedor_id: string | null
      cuenta_cobro_externa_id: string | null
      loteo_id: string | null
      manzana: string | null
      numero_lote: string | null
      loteos: { nombre: string } | { nombre: string }[] | null
    }>).map((lote) => [lote.id, lote])
  )

  const clienteIdsConPago = [...new Set(pagos.map((pago) => pago.cliente_id))]

  const { data: clientesConPago } =
    clienteIdsConPago.length > 0
      ? await supabase.from('profiles').select('id, full_name, dni').in('id', clienteIdsConPago)
      : { data: [] }

  const nombreClientePorId = new Map(
    (clientesConPago ?? []).map((cliente) => [cliente.id, cliente.full_name])
  )
  const dniClientePorId = new Map((clientesConPago ?? []).map((cliente) => [cliente.id, cliente.dni]))

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

  const { data: todosLosAcreedores } =
    perfilPropio!.role !== 'acreedor'
      ? await supabase.from('profiles').select('id, full_name').eq('role', 'acreedor').order('full_name')
      : { data: [] }

  const pagosConLink = await Promise.all(
    pagos.map(async (pago) => {
      const lote = lotePorId.get(pago.lote_id)
      const sinAcreedorVinculado = !lote?.acreedor_id
      const loteoNombre = Array.isArray(lote?.loteos)
        ? lote.loteos[0]?.nombre
        : lote?.loteos?.nombre
      const ubicacionLote = loteoNombre
        ? `${loteoNombre}${lote?.manzana ? ` · Mz ${lote.manzana}` : ''}${lote?.numero_lote ? ` Lt ${lote.numero_lote}` : ''}`
        : lote?.identificador ?? '—'
      const identificadorLote = lote?.identificador ?? '—'
      const nombreCliente = nombreClientePorId.get(pago.cliente_id) ?? '—'
      const dniCliente = dniClientePorId.get(pago.cliente_id) ?? null
      const nombreAcreedor = lote?.acreedor_id ? nombreAcreedorPorId.get(lote.acreedor_id) ?? '—' : '—'

      if (!pago.comprobante_path) {
        return {
          ...pago,
          comprobanteUrl: null,
          sinAcreedorVinculado,
          ubicacionLote,
          identificadorLote,
          nombreCliente,
          dniCliente,
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
        ubicacionLote,
        nombreAcreedor,
        identificadorLote,
        nombreCliente,
        dniCliente,
        cuentaCobroExterna: Boolean(lote?.cuenta_cobro_externa_id),
        montoEfectivo: montoEfectivoPorId.get(pago.id) ?? pago.monto,
      }
    })
  )

  const cantidadPendientes = pagos.filter((p) => p.estado === 'pendiente').length

  // Un pago espera MI confirmación si está pendiente, ya hay evidencia que
  // mirar (comprobante, o efectivo que solo confirma el admin) y todavía no
  // lo firmé yo. Es exactamente lo que habilita el botón de abajo.
  function esperaMiConfirmacion(pago: (typeof pagosConLink)[number]): boolean {
    if (pago.estado !== 'pendiente') return false
    if (!pago.comprobante_path && pago.medio_pago !== 'efectivo') return false
    if (pago.medio_pago === 'efectivo' && perfilPropio!.role !== 'administrador') return false
    return perfilPropio!.role === 'acreedor'
      ? !pago.confirmado_acreedor_por
      : !pago.confirmado_admin_por
  }

  const pagosVisibles = soloEsperandoMiConfirmacion
    ? pagosConLink.filter(esperaMiConfirmacion)
    : pagosConLink

  const cantidadEsperandoMiConfirmacion = pagosConLink.filter(esperaMiConfirmacion).length

  return (
    <main className="flex flex-col gap-5">
      <EncabezadoPagina titulo="Pagos" migas={['Pagos']} />

      {error && <p className={BANNER_ERROR}>{error}</p>}

      {/* Barra de Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FiltroEnVivo className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px]">
            <input
              type="text"
              name="q"
              placeholder="Cliente, DNI o lote…"
              defaultValue={filtroTexto ?? ''}
              className={`${ENTRADA} !mt-0 !py-2 !pl-3 !text-[13.5px]`}
            />
          </div>

          {perfilPropio!.role !== 'acreedor' && (
            <select
              key={filtroAcreedorId ?? 'empty'}
              name="acreedor"
              defaultValue={filtroAcreedorId ?? ''}
              className={`${ENTRADA} !mt-0 !py-2 !text-[13.5px]`}
            >
              <option value="">Todos los acreedores</option>
              {(todosLosAcreedores ?? []).map((acreedor) => (
                <option key={acreedor.id} value={acreedor.id}>
                  {acreedor.full_name}
                </option>
              ))}
            </select>
          )}

          {/* Filtro por motivo y por fecha (pedido de Nico 03/09: concilia
              día por día contra el banco, hoy tenía que revisar todo sin
              poder acotar). Filtra sobre created_at -- el mismo campo que
              ya se muestra como "fecha" en cada tarjeta. */}
          <select
            key={filtroMotivo ?? 'empty'}
            name="motivo"
            defaultValue={filtroMotivo ?? ''}
            className={`${ENTRADA} !mt-0 !py-2 !text-[13.5px]`}
          >
            <option value="">Todos los motivos</option>
            <option value="cuota">Cuota</option>
            <option value="sena">Seña</option>
            <option value="entrega">Entrega</option>
            <option value="ajuste">Corrección</option>
            <option value="saldar">Pago total anticipado</option>
          </select>

          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            Desde
            <input
              type="date"
              name="desde"
              defaultValue={filtroDesde ?? ''}
              className={`${ENTRADA} !mt-0 !py-2 !text-[13.5px]`}
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            Hasta
            <input
              type="date"
              name="hasta"
              defaultValue={filtroHasta ?? ''}
              className={`${ENTRADA} !mt-0 !py-2 !text-[13.5px]`}
            />
          </label>

          {/* Acceso Rápido de Estado (Integrado al Filtro en Vivo) */}
          <div className="flex items-center gap-1 rounded-xl border border-blue-100 bg-blue-50/80 p-1">
            <label
              className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                !filtroEstado
                  ? 'bg-white font-bold text-blue-800 shadow-sm'
                  : 'text-slate-600 hover:text-blue-900'
              }`}
            >
              <input type="radio" name="estado" value="" defaultChecked={!filtroEstado} className="hidden" />
              Todos
            </label>
            <label
              className={`flex items-center gap-1 cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                filtroEstado === 'pendiente'
                  ? 'bg-white font-bold text-amber-800 shadow-sm'
                  : 'text-slate-600 hover:text-amber-800'
              }`}
            >
              <input type="radio" name="estado" value="pendiente" defaultChecked={filtroEstado === 'pendiente'} className="hidden" />
              Pendientes
              {cantidadPendientes > 0 && (
                <span className={`opacity-70 ${NUMERO_TABULAR}`}>({cantidadPendientes})</span>
              )}
            </label>
            <label
              className={`flex items-center gap-1 cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                filtroEstado === 'por-confirmar'
                  ? 'bg-white font-bold text-blue-800 shadow-sm'
                  : 'text-slate-600 hover:text-blue-800'
              }`}
              title="Pagos que ya llegaron y esperan que vos mires el comprobante y los confirmes"
            >
              <input
                type="radio"
                name="estado"
                value="por-confirmar"
                defaultChecked={filtroEstado === 'por-confirmar'}
                className="hidden"
              />
              Esperando mi confirmación
              {cantidadEsperandoMiConfirmacion > 0 && (
                <span className={`opacity-70 ${NUMERO_TABULAR}`}>
                  ({cantidadEsperandoMiConfirmacion})
                </span>
              )}
            </label>
            <label
              className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                filtroEstado === 'confirmado'
                  ? 'bg-white font-bold text-green-800 shadow-sm'
                  : 'text-slate-600 hover:text-green-800'
              }`}
            >
              <input type="radio" name="estado" value="confirmado" defaultChecked={filtroEstado === 'confirmado'} className="hidden" />
              Confirmados
            </label>
          </div>

          {(filtroTexto || filtroEstado || filtroAcreedorId || filtroMotivo || filtroDesde || filtroHasta) && (
            <EnlaceBoton 
              href="/admin/pagos" 
              className="ml-auto flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-[0_1px_2px_rgba(15,32,73,0.05)] transition-all hover:bg-slate-50 hover:text-slate-900"
            >
              Limpiar filtros
            </EnlaceBoton>
          )}
        </FiltroEnVivo>
      </div>

      {/* Lista de Tarjetas de Pago */}
      <div className="flex flex-col gap-3">
        {pagosVisibles.length === 0 ? (
          <div className="rounded-xl border border-blue-100 bg-white p-8 text-center text-sm text-slate-600 shadow-sm">
            {filtroTexto || filtroEstado || filtroAcreedorId || filtroMotivo || filtroDesde || filtroHasta
              ? 'No se encontraron pagos con los filtros seleccionados.'
              : 'No hay pagos registrados todavía.'}
          </div>
        ) : (
          pagosVisibles.map((pago) => {
            const confirmarEstePago = confirmarPago.bind(null, pago.id)
            const editarMontoEstePago = editarMontoPago.bind(null, pago.id)
            const tieneAlerta = pago.sinAcreedorVinculado && pago.medio_pago !== 'efectivo'
            const fechaFormateada = new Date(pago.created_at).toLocaleDateString('es-AR', {
              timeZone: 'America/Argentina/Cordoba',
            })
            const motivoTexto = obtenerMotivoTexto(pago.motivo)
            const medioTexto = pago.medio_pago === 'efectivo' ? 'Efectivo' : 'Transferencia'

            const puedeConfirmar = esperaMiConfirmacion(pago)

            return (
              <div
                key={pago.id}
                // Ancla estable para los tests: el listado dejó de ser una
                // tabla y pasó a tarjetas, y no hay ninguna clase ni rol
                // que identifique "una fila de pago" sin acoplarse al
                // diseño (misma convención que CampoArchivoDirecto).
                data-testid="tarjeta-pago"
                className={tieneAlerta ? PAGO_TARJETA_ALERTA : PAGO_TARJETA}
              >
                {/* Cabecera de la Tarjeta */}
                <div className={PAGO_TARJETA_HEADER}>
                  {/* Icono de Medio de Pago */}
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      pago.medio_pago === 'efectivo'
                        ? 'bg-green-50 text-green-700 border border-green-100'
                        : 'bg-blue-50 text-blue-800 border border-blue-100'
                    }`}
                  >
                    {pago.medio_pago === 'efectivo' ? (
                      <Banknote className="h-4.5 w-4.5" />
                    ) : (
                      <FileImage className="h-4.5 w-4.5" />
                    )}
                  </div>

                  {/* Datos del Cliente y Lote */}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-baseline gap-2">
                      <EnlaceBoton
                        href={`/admin/clientes/${pago.cliente_id}`}
                        className="text-[14px] font-bold text-blue-900 hover:underline"
                      >
                        {pago.nombreCliente}
                      </EnlaceBoton>
                      {pago.dniCliente && (
                        <span className="text-xs font-medium text-slate-500">
                          DNI {pago.dniCliente}
                        </span>
                      )}
                    </div>
                    <div className="text-[12.5px] text-slate-600">
                      {/* 05/09, pedido de Gabriel: desde un pago no había
                          forma de saltar al lote para ver el detalle. */}
                      {pago.lote_id ? (
                        <EnlaceBoton
                          href={`/admin/lotes/${pago.lote_id}`}
                          className="font-medium text-blue-800 hover:underline"
                        >
                          {pago.ubicacionLote}
                        </EnlaceBoton>
                      ) : (
                        pago.ubicacionLote
                      )}{' '}
                      · {motivoTexto} · {medioTexto} · {fechaFormateada}
                      {pago.nombreAcreedor !== '—' && (
                        <span className="text-slate-500"> · Acreedor: {pago.nombreAcreedor}</span>
                      )}
                    </div>
                    {/* Indicadores de Doble Confirmación para pagos pendientes */}
                    {pago.estado === 'pendiente' && (
                      <div className="flex items-center gap-3 pt-0.5 text-[11.5px]">
                        {pago.medio_pago === 'efectivo' ? (
                          <span className="text-slate-500">Confirmación solo de Admin (Efectivo)</span>
                        ) : pago.cuentaCobroExterna ? (
                          <span className="text-slate-500">Confirmación solo de Admin (Cuenta externa)</span>
                        ) : (
                          <>
                            <span className={pago.confirmado_acreedor_por ? 'font-semibold text-green-700' : 'text-slate-500'}>
                              {pago.confirmado_acreedor_por ? '✓ Acreedor confirmó' : '⏳ Acreedor pendiente'}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className={pago.confirmado_admin_por ? 'font-semibold text-green-700' : 'text-slate-500'}>
                              {pago.confirmado_admin_por ? '✓ Admin confirmó' : '⏳ Admin pendiente'}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Monto */}
                  <div className="shrink-0 text-right">
                    <span className={`text-[15px] font-extrabold text-blue-950 ${NUMERO_TABULAR}`}>
                      {pago.moneda} {pago.monto.toLocaleString('es-AR')}
                    </span>
                  </div>

                  {/* Enlace al Comprobante */}
                  <div className="shrink-0">
                    {pago.comprobante_path ? (
                      pago.comprobanteUrl ? (
                        <a
                          href={pago.comprobanteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Comprobante
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">Comprobante no disponible</span>
                      )
                    ) : pago.medio_pago === 'efectivo' ? (
                      <span className="text-xs text-slate-400">— (efectivo)</span>
                    ) : (
                      <span className="text-xs text-slate-400">Sin comprobante</span>
                    )}
                  </div>

                  {/* Badge de Estado */}
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {pago.estado === 'confirmado' ? (
                      <>
                        <span className={`${BADGE_BASE} ${BADGE_VERDE}`}>
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Confirmado
                        </span>
                        <EnlaceBoton href={`/admin/pagos/${pago.id}/recibo`} className={`text-xs ${ENLACE}`}>
                          Recibo →
                        </EnlaceBoton>
                      </>
                    ) : pago.medio_pago === 'efectivo' &&
                      perfilPropio!.role !== 'administrador' ? (
                      <span className={`${BADGE_BASE} ${BADGE_AMARILLO}`}>
                        <Clock className="mr-1 h-3 w-3" />
                        Pendiente admin
                      </span>
                    ) : (
                      <span className={`${BADGE_BASE} ${BADGE_AMARILLO}`}>
                        <Clock className="mr-1 h-3 w-3" />
                        Pendiente
                      </span>
                    )}
                  </div>
                </div>

                {/* Banner de Alerta si el lote no tiene acreedor vinculado */}
                {tieneAlerta && (
                  <div className={PAGO_BANNER_ALERTA}>
                    <TriangleAlert className="h-4 w-4 shrink-0 text-red-600" />
                    <span>
                      Este lote todavía no tiene acreedor vinculado. Podés confirmar tu parte, pero el
                      pago no se completa hasta asignar uno desde el detalle del lote.
                    </span>
                  </div>
                )}

                {/* Formulario de Confirmación Plegado (para pagos pendientes) */}
                {puedeConfirmar && (
                  <form action={confirmarEstePago} className={PAGO_FORM_CONFIRMACION}>
                    <input type="hidden" name="montoVisto" value={pago.monto} />

                    <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
                      Monto a confirmar
                      <input
                        name="monto"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={pago.monto}
                        required
                        className={`w-32 rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-sm ${NUMERO_TABULAR} focus:border-blue-600 focus:outline-none`}
                      />
                    </label>

                    <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
                      Monto recibido (caja)
                      <input
                        name="montoRecibido"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={pago.monto_recibido ?? undefined}
                        placeholder="opcional"
                        className={`w-32 rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-sm ${NUMERO_TABULAR} focus:border-blue-600 focus:outline-none`}
                      />
                    </label>

                    <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
                      Moneda recibida
                      <select
                        name="monedaRecibida"
                        defaultValue={pago.moneda_recibida ?? 'USD'}
                        className="rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-sm focus:border-blue-600 focus:outline-none"
                      >
                        <option value="USD">USD</option>
                        <option value="ARS">ARS</option>
                      </select>
                    </label>

                    <BotonEnvio className="cursor-pointer rounded-lg bg-blue-800 px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-blue-900 active:scale-[0.98]">
                      Confirmar mi parte
                    </BotonEnvio>
                  </form>
                )}

                {/* Formulario de Corrección de Monto (para pagos confirmados, admin) */}
                {pago.estado === 'confirmado' &&
                  pago.motivo !== 'ajuste' &&
                  pago.motivo !== 'saldar' &&
                  perfilPropio!.role === 'administrador' && (
                    <form action={editarMontoEstePago} className={PAGO_FORM_CONFIRMACION}>
                      <input type="hidden" name="montoEfectivoVisto" value={pago.montoEfectivo} />

                      <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
                        Corregir monto (actual: {pago.montoEfectivo.toLocaleString('es-AR')}{' '}
                        {pago.moneda})
                        <input
                          name="montoNuevo"
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={pago.montoEfectivo}
                          required
                          className={`w-36 rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-sm ${NUMERO_TABULAR} focus:border-blue-600 focus:outline-none`}
                        />
                      </label>

                      <BotonEnvio className="cursor-pointer rounded-lg border-2 border-blue-800 bg-white px-3 py-1.5 text-xs font-bold text-blue-800 shadow-sm transition-all hover:bg-blue-50 active:scale-[0.98]">
                        Editar monto
                      </BotonEnvio>
                    </form>
                  )}
              </div>
            )
          })
        )}
      </div>

      {perfilPropio!.role === 'administrador' && (
        <p className="mt-3 text-xs text-slate-400">
          <EnlaceBoton href="/admin/pagos/auditoria" className={ENLACE}>
            Ver historial de auditoría de confirmaciones →
          </EnlaceBoton>
        </p>
      )}
    </main>
  )
}
