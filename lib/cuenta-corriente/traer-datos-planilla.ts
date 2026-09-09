import type { SupabaseClient } from '@supabase/supabase-js'
import type { DatosDeLote, DatosDeCuota } from './filas-movimiento'

// Resuelve, en pocas consultas, todo lo que la planilla de Nicolás necesita
// y que NO está en la fila del movimiento: el loteo, la manzana, el número
// de lote, el comprador, y de qué cuota se trata.
//
// Está acá y no en cada pantalla porque lo usan cuatro lugares (la cuenta
// corriente de una persona y la de una cuenta externa, cada una con su
// tabla y su descarga) y las cuatro tienen que mostrar lo mismo.

export interface DatosPlanilla {
  lotePorId: Map<string, DatosDeLote>
  cuotaPorId: Map<string, DatosDeCuota>
}

export async function traerDatosDeLotes(
  supabase: SupabaseClient,
  loteIds: string[]
): Promise<Map<string, DatosDeLote>> {
  const lotePorId = new Map<string, DatosDeLote>()
  const ids = [...new Set(loteIds)]
  if (ids.length === 0) return lotePorId

  const { data } = await supabase
    .from('lotes')
    .select('id, identificador, manzana, numero_lote, cliente_id, loteos(nombre)')
    .in('id', ids)

  const lotes = (data ?? []) as unknown as Array<{
    id: string
    identificador: string
    manzana: string | null
    numero_lote: string | null
    cliente_id: string | null
    loteos: { nombre: string } | { nombre: string }[] | null
  }>

  // El comprador va en una consulta aparte y no anidado: cliente_id puede
  // ser null (lote todavía sin vender) y un join !inner se comería esas
  // filas justo cuando la planilla las necesita.
  const clienteIds = [
    ...new Set(lotes.map((lote) => lote.cliente_id).filter((id): id is string => Boolean(id))),
  ]

  const nombrePorClienteId = new Map<string, string>()
  if (clienteIds.length > 0) {
    const { data: clientes } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', clienteIds)
    for (const cliente of clientes ?? []) nombrePorClienteId.set(cliente.id, cliente.full_name)
  }

  for (const lote of lotes) {
    const loteo = Array.isArray(lote.loteos) ? lote.loteos[0]?.nombre : lote.loteos?.nombre
    lotePorId.set(lote.id, {
      loteo: loteo ?? null,
      manzana: lote.manzana,
      numeroLote: lote.numero_lote,
      identificador: lote.identificador,
      clienteNombre: lote.cliente_id ? (nombrePorClienteId.get(lote.cliente_id) ?? null) : null,
    })
  }

  return lotePorId
}

// Cuántas cuotas tiene el plan de cada lote, para el denominador de "3/24".
// Se cuenta el ciclo vigente: si el lote se rescindió y se revendió, las
// cuotas del ciclo anterior no son parte de este plan.
async function contarCuotasPorLote(
  supabase: SupabaseClient,
  loteIds: string[]
): Promise<Map<string, number>> {
  const total = new Map<string, number>()
  if (loteIds.length === 0) return total

  const { data: lotes } = await supabase
    .from('lotes')
    .select('id, ciclo_actual')
    .in('id', loteIds)

  const cicloPorLote = new Map((lotes ?? []).map((lote) => [lote.id, lote.ciclo_actual]))

  const { data: cuotas } = await supabase
    .from('cuotas')
    .select('lote_id, ciclo')
    .in('lote_id', loteIds)

  for (const cuota of cuotas ?? []) {
    if (cuota.ciclo !== cicloPorLote.get(cuota.lote_id)) continue
    total.set(cuota.lote_id, (total.get(cuota.lote_id) ?? 0) + 1)
  }

  return total
}

// Cuenta corriente de una PERSONA: el movimiento apunta directo a la cuota.
export async function traerDatosDeCuotas(
  supabase: SupabaseClient,
  cuotaIds: string[]
): Promise<Map<string, DatosDeCuota>> {
  const cuotaPorId = new Map<string, DatosDeCuota>()
  const ids = [...new Set(cuotaIds)]
  if (ids.length === 0) return cuotaPorId

  const { data: cuotas } = await supabase
    .from('cuotas')
    .select('id, numero, fecha_vencimiento, lote_id')
    .in('id', ids)

  const totalPorLote = await contarCuotasPorLote(
    supabase,
    [...new Set((cuotas ?? []).map((cuota) => cuota.lote_id))]
  )

  for (const cuota of cuotas ?? []) {
    cuotaPorId.set(cuota.id, {
      numeros: [cuota.numero],
      fechaVencimiento: cuota.fecha_vencimiento,
      totalDelPlan: totalPorLote.get(cuota.lote_id) ?? 0,
    })
  }

  return cuotaPorId
}

// Cuenta EXTERNA: el movimiento no guarda la cuota, guarda el pago. Y un
// pago puede haberse repartido por FIFO entre varias cuotas, así que se
// resuelven todas y la fila termina diciendo "3-4/24".
//
// El mapa devuelto se indexa por pago_id, no por cuota_id: el llamador le
// pasa el pago como si fuera la cuota del movimiento.
export async function traerDatosDeCuotasPorPago(
  supabase: SupabaseClient,
  pagoIds: string[]
): Promise<Map<string, DatosDeCuota>> {
  const porPago = new Map<string, DatosDeCuota>()
  const ids = [...new Set(pagoIds)]
  if (ids.length === 0) return porPago

  const { data: imputaciones } = await supabase
    .from('pago_imputaciones')
    .select('pago_id, cuota_id')
    .in('pago_id', ids)

  const cuotaIds = [...new Set((imputaciones ?? []).map((fila) => fila.cuota_id))]
  if (cuotaIds.length === 0) return porPago

  const { data: cuotas } = await supabase
    .from('cuotas')
    .select('id, numero, fecha_vencimiento, lote_id')
    .in('id', cuotaIds)

  const cuotaPorId = new Map((cuotas ?? []).map((cuota) => [cuota.id, cuota]))
  const totalPorLote = await contarCuotasPorLote(
    supabase,
    [...new Set((cuotas ?? []).map((cuota) => cuota.lote_id))]
  )

  for (const imputacion of imputaciones ?? []) {
    const cuota = cuotaPorId.get(imputacion.cuota_id)
    if (!cuota) continue

    const existente = porPago.get(imputacion.pago_id)
    if (existente) {
      existente.numeros.push(cuota.numero)
      // La cuota más vieja manda para la columna "mes de": es el mes que el
      // cliente estaba saldando cuando pagó.
      if (cuota.fecha_vencimiento < existente.fechaVencimiento) {
        existente.fechaVencimiento = cuota.fecha_vencimiento
      }
    } else {
      porPago.set(imputacion.pago_id, {
        numeros: [cuota.numero],
        fechaVencimiento: cuota.fecha_vencimiento,
        totalDelPlan: totalPorLote.get(cuota.lote_id) ?? 0,
      })
    }
  }

  return porPago
}
