import { createClient } from '@/lib/supabase/server'
import { formatearDetalleCuota } from './formatear-detalle-cuota'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

// Postea el Debe automatico de una cuota (uno por cada participante cargado
// en cuota_distribuciones) la primera vez que recibe algun pago -- no
// importa si fue parcial, el monto posteado es siempre el total cargado en
// la distribucion (no proporcional a lo cobrado). El indice unico
// movimientos_cc_cobro_cuota_unico ya evita duplicar esto si se llama de
// nuevo para la misma cuota (ej. un segundo pago parcial mas adelante).
export async function generarDebeAutomaticoSiCorresponde(
  supabase: SupabaseServerClient,
  { cuotaId, loteId, userId }: { cuotaId: string; loteId: string; userId: string }
): Promise<void> {
  const { count: yaPosteado } = await supabase
    .from('movimientos_cuenta_corriente')
    .select('id', { count: 'exact', head: true })
    .eq('cuota_id', cuotaId)
    .eq('origen', 'cobro_cuota')

  if (yaPosteado && yaPosteado > 0) return

  const { data: distribuciones } = await supabase
    .from('cuota_distribuciones')
    .select('profile_id, monto')
    .eq('cuota_id', cuotaId)
    .not('profile_id', 'is', null)

  // Sin distribucion cargada para esta cuota puntual: no hay nada que
  // postear. Este caso se refleja aparte en el aviso de "cuotas cobradas sin
  // distribucion cargada" (obtenerCuotasSinDistribucion), nunca en silencio.
  if (!distribuciones || distribuciones.length === 0) return

  const { data: cuota } = await supabase
    .from('cuotas')
    .select('numero, fecha_vencimiento')
    .eq('id', cuotaId)
    .single()

  const { data: lote } = await supabase.from('lotes').select('identificador, moneda').eq('id', loteId).single()

  if (!cuota || !lote) return

  const detalle = formatearDetalleCuota({
    numero: cuota.numero,
    fechaVencimiento: cuota.fecha_vencimiento,
    loteIdentificador: lote.identificador,
  })

  const filas = distribuciones.map((distribucion) => ({
    profile_id: distribucion.profile_id,
    tipo: 'debe' as const,
    monto: distribucion.monto,
    moneda: lote.moneda,
    lote_id: loteId,
    cuota_id: cuotaId,
    origen: 'cobro_cuota' as const,
    detalle,
    cargado_por: userId,
  }))

  const { error } = await supabase.from('movimientos_cuenta_corriente').insert(filas)

  if (error) {
    console.error('No se pudo generar el Debe automático de cuenta corriente:', error)
  }
}

// Cuando una correccion de pago revierte TODA la plata cobrada de una cuota
// (vuelve a saldo_pendiente == monto_base), el Debe automatico que se habia
// posteado deja de tener sentido -- se revierte con una fila nueva (nunca se
// edita/borra la original, mismo criterio que el resto de las correcciones
// del sistema).
export async function revertirDebeAutomaticoSiCorresponde(
  supabase: SupabaseServerClient,
  { cuotaId, userId }: { cuotaId: string; userId: string }
): Promise<void> {
  const { data: cuota } = await supabase
    .from('cuotas')
    .select('saldo_pendiente, monto_base')
    .eq('id', cuotaId)
    .single()

  // Sigue teniendo algo cobrado (correccion parcial): el Debe se mantiene
  // igual, "no importa si el pago fue parcial" tambien aplica en reversa.
  if (!cuota || cuota.saldo_pendiente < cuota.monto_base) return

  const { data: originales } = await supabase
    .from('movimientos_cuenta_corriente')
    .select('id, profile_id, monto, moneda, lote_id')
    .eq('cuota_id', cuotaId)
    .eq('origen', 'cobro_cuota')

  if (!originales || originales.length === 0) return

  const { data: yaRevertidas } = await supabase
    .from('movimientos_cuenta_corriente')
    .select('corrige_movimiento_id')
    .eq('cuota_id', cuotaId)
    .eq('origen', 'reversion_cobro_cuota')

  const idsYaRevertidos = new Set((yaRevertidas ?? []).map((fila) => fila.corrige_movimiento_id))
  const pendientesDeRevertir = originales.filter((original) => !idsYaRevertidos.has(original.id))

  if (pendientesDeRevertir.length === 0) return

  const filas = pendientesDeRevertir.map((original) => ({
    profile_id: original.profile_id,
    tipo: 'debe' as const,
    monto: -original.monto,
    moneda: original.moneda,
    lote_id: original.lote_id,
    cuota_id: cuotaId,
    origen: 'reversion_cobro_cuota' as const,
    detalle: 'Reversión — una corrección de pago dejó esta cuota sin cobrar',
    corrige_movimiento_id: original.id,
    cargado_por: userId,
  }))

  const { error } = await supabase.from('movimientos_cuenta_corriente').insert(filas)

  if (error) {
    console.error('No se pudo revertir el Debe automático de cuenta corriente:', error)
  }
}
