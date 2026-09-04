import { createAdminClient } from '@/lib/supabase/admin'

export interface CuotaDelRecibo {
  numero: number
  fechaVencimiento: string
}

export interface DatosRecibo {
  pagoId: string
  clienteNombre: string
  clienteDni: string | null
  identificadorLote: string
  numeroLote: string | null
  manzana: string | null
  loteoNombre: string | null
  cuotas: CuotaDelRecibo[]
  monto: number
  moneda: string
  medioPago: 'efectivo' | 'transferencia'
  motivo: 'cuota' | 'sena' | 'ajuste' | 'entrega' | 'saldar'
  fecha: string // YYYY-MM-DD, calendario Argentina
}

// Recibo oficial de un pago ya CONFIRMADO (por ambas partes, o solo por
// admin en los casos donde alcanza -- ver confirmarPago). Se usa desde dos
// lugares (04/09, pedido de Gabriel: "se replicaría la misma lógica en
// ambas situaciones"): la impresión en /admin/efectivo|pagos y la descarga
// en el portal del cliente.
//
// Lee siempre con el cliente admin (bypassa RLS): el llamador (la página)
// ya validó por su cuenta que quien pide este recibo tiene derecho a verlo
// (dueño del pago, o admin/acreedor/cobrador) -- hace falta igual porque
// `loteos` ni siquiera es legible por RLS para el rol cliente, así que leer
// con el cliente normal del portal se queda sin el nombre del loteo.
export async function obtenerDatosRecibo(pagoId: string): Promise<DatosRecibo | null> {
  const admin = createAdminClient()

  const { data: pago } = await admin
    .from('pagos')
    .select(
      'id, monto, moneda, motivo, medio_pago, estado, lote_id, cliente_id, created_at, confirmado_admin_at'
    )
    .eq('id', pagoId)
    .single()

  if (!pago || pago.estado !== 'confirmado') return null

  const { data: lote } = await admin
    .from('lotes')
    .select('identificador, numero_lote, manzana, loteos(nombre)')
    .eq('id', pago.lote_id)
    .single()

  if (!lote) return null

  const { data: cliente } = await admin
    .from('profiles')
    .select('full_name, dni')
    .eq('id', pago.cliente_id)
    .single()

  const { data: imputaciones } = await admin
    .from('pago_imputaciones')
    .select('cuotas(numero, fecha_vencimiento)')
    .eq('pago_id', pagoId)

  const cuotas = ((imputaciones ?? []) as unknown as Array<{
    cuotas: { numero: number; fecha_vencimiento: string } | null
  }>)
    .map((imputacion) => imputacion.cuotas)
    .filter((cuota): cuota is { numero: number; fecha_vencimiento: string } => cuota !== null)
    .sort((a, b) => a.numero - b.numero)
    .map((cuota) => ({ numero: cuota.numero, fechaVencimiento: cuota.fecha_vencimiento }))

  const loteosRelacion = lote.loteos as { nombre: string } | { nombre: string }[] | null
  const loteoNombre = Array.isArray(loteosRelacion)
    ? loteosRelacion[0]?.nombre ?? null
    : loteosRelacion?.nombre ?? null

  // Fecha del recibo: la de confirmación del admin (cuando el pago quedó
  // efectivamente cerrado), y si por lo que sea no está cargada, la de
  // creación del pago -- nunca "hoy", para que un recibo reimpreso más
  // tarde siga mostrando la fecha real del pago.
  const fechaInstante = pago.confirmado_admin_at ?? pago.created_at
  const fecha = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Cordoba',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(fechaInstante))

  return {
    pagoId: pago.id,
    clienteNombre: cliente?.full_name ?? '—',
    clienteDni: cliente?.dni ?? null,
    identificadorLote: lote.identificador,
    numeroLote: lote.numero_lote,
    manzana: lote.manzana,
    loteoNombre,
    cuotas,
    monto: pago.monto,
    moneda: pago.moneda,
    medioPago: pago.medio_pago,
    motivo: pago.motivo,
    fecha,
  }
}
