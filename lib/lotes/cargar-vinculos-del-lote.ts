import { createClient } from '@/lib/supabase/server'
import { traerTodasLasFilasPorTandas } from '@/lib/supabase/traer-todas-las-filas'
import { vinculosDeIntegrante, type CuotaParaVinculos, type VinculosDeIntegrante } from './vinculos-integrante'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export function claveDeCuenta(profileId: string | null, cuentaExternaId: string | null): string {
  if (profileId) return `profile:${profileId}`
  if (cuentaExternaId) return `externa:${cuentaExternaId}`
  return ''
}

// Lee de la base todo lo que hace falta para saber qué cuotas tiene atadas
// cada integrante de un lote (ver vinculos-integrante.ts). Solo las cuotas
// vivas del ciclo vigente: las refinanciadas y las de un ciclo rescindido ya
// no se reparten ni se cobran.
//
// Lo usan la pantalla de distribución (para el aviso previo) y las acciones
// que sacan a alguien del lote, que lo vuelven a leer en el momento de
// confirmar: entre que se abrió la pantalla y se apretó el botón, el cliente
// pudo haber informado un pago.
export async function cargarVinculosDelLote(
  supabase: SupabaseServerClient,
  loteId: string,
  ciclo: number
): Promise<{ cuotas: CuotaParaVinculos[]; porcentajePorClave: Record<string, number>; de: (clave: string) => VinculosDeIntegrante }> {
  const { data: cuotasDelLote, error } = await supabase
    .from('cuotas')
    .select('id, numero, cuenta_cobro_id, cuenta_cobro_externa_id')
    .eq('lote_id', loteId)
    .eq('ciclo', ciclo)
    .eq('refinanciada', false)

  if (error) throw new Error(`No se pudieron leer las cuotas del lote: ${error.message}`)

  const ids = (cuotasDelLote ?? []).map((cuota) => cuota.id)

  const [repartos, imputaciones, pagosPendientes, objetivos] = await Promise.all([
    traerTodasLasFilasPorTandas<{ cuota_id: string; profile_id: string | null; cuenta_externa_id: string | null }>(
      ids,
      (tanda, desde, hasta) =>
        supabase
          .from('cuota_distribuciones')
          .select('id, cuota_id, profile_id, cuenta_externa_id')
          .in('cuota_id', tanda)
          .order('id')
          .range(desde, hasta)
    ),
    traerTodasLasFilasPorTandas<{ cuota_id: string }>(ids, (tanda, desde, hasta) =>
      supabase.from('pago_imputaciones').select('id, cuota_id').in('cuota_id', tanda).order('id').range(desde, hasta)
    ),
    traerTodasLasFilasPorTandas<{ cuota_origen_id: string }>(ids, (tanda, desde, hasta) =>
      supabase
        .from('pagos')
        .select('id, cuota_origen_id')
        .in('cuota_origen_id', tanda)
        .eq('estado', 'pendiente')
        .order('id')
        .range(desde, hasta)
    ),
    supabase.from('lote_distribucion_objetivos').select('profile_id, cuenta_externa_id, porcentaje').eq('lote_id', loteId),
  ])

  const cobradas = new Set(imputaciones.map((fila) => fila.cuota_id))
  const conPagoPendiente = new Set(pagosPendientes.map((fila) => fila.cuota_origen_id))
  const repartidaEntre = new Map<string, string[]>()
  for (const reparto of repartos) {
    const lista = repartidaEntre.get(reparto.cuota_id) ?? []
    lista.push(claveDeCuenta(reparto.profile_id, reparto.cuenta_externa_id))
    repartidaEntre.set(reparto.cuota_id, lista)
  }

  const cuotas: CuotaParaVinculos[] = (cuotasDelLote ?? []).map((cuota) => ({
    numero: cuota.numero,
    cobrada: cobradas.has(cuota.id),
    conPagoPendiente: conPagoPendiente.has(cuota.id),
    destino: claveDeCuenta(cuota.cuenta_cobro_id, cuota.cuenta_cobro_externa_id),
    repartidaEntre: repartidaEntre.get(cuota.id) ?? [],
  }))

  const porcentajePorClave: Record<string, number> = {}
  for (const objetivo of objetivos.data ?? []) {
    if (objetivo.porcentaje === null) continue
    porcentajePorClave[claveDeCuenta(objetivo.profile_id, objetivo.cuenta_externa_id)] = Number(objetivo.porcentaje)
  }

  return {
    cuotas,
    porcentajePorClave,
    de: (clave) => vinculosDeIntegrante(clave, cuotas, porcentajePorClave),
  }
}
