import type { SupabaseClient } from '@supabase/supabase-js'
import type { DatosDeLote, DatosDeCuota } from '@/lib/planillas/columnas-del-lote'
import {
  posicionesDelPlan,
  type CuotaConPlan,
  type PosicionEnElPlan,
} from '@/lib/cuotas/plan-de-cuotas'
import { traerTodasLasFilasPorTandas } from '@/lib/supabase/traer-todas-las-filas'

// Resuelve, en pocas consultas, todo lo que las planillas necesitan y que NO
// está en la fila: el loteo, la manzana, el número de lote, el cliente, y de
// qué cuota se trata.
//
// Está acá y no en cada pantalla porque lo usan todos los Excel y las
// pantallas que los muestran, y todos tienen que decir lo mismo.
//
// Todas las consultas pasan por traerTodasLasFilasPorTandas (11/09): con la
// cartera real, "todas las cuotas de estos lotes" son miles de filas y
// PostgREST corta en 1000 sin avisar. El "de cuántas" de "3/24" sale de
// contar esas filas, así que con la lista cortada el número mentía.

export interface DatosPlanilla {
  lotePorId: Map<string, DatosDeLote>
  cuotaPorId: Map<string, DatosDeCuota>
}

interface LoteCrudo {
  id: string
  identificador: string
  manzana: string | null
  numero_lote: string | null
  cliente_id: string | null
  loteos: { nombre: string } | { nombre: string }[] | null
}

export async function traerDatosDeLotes(
  supabase: SupabaseClient,
  loteIds: string[]
): Promise<Map<string, DatosDeLote>> {
  const lotes = await traerTodasLasFilasPorTandas<LoteCrudo>(loteIds, (tanda, desde, hasta) =>
    supabase
      .from('lotes')
      .select('id, identificador, manzana, numero_lote, cliente_id, loteos(nombre)')
      .in('id', tanda)
      .order('id')
      .range(desde, hasta)
  )

  // El comprador va en una consulta aparte y no anidado: cliente_id puede
  // ser null (lote todavía sin vender) y un join !inner se comería esas
  // filas justo cuando la planilla las necesita.
  const clientes = await traerTodasLasFilasPorTandas<{ id: string; full_name: string }>(
    lotes.map((lote) => lote.cliente_id).filter((id): id is string => Boolean(id)),
    (tanda, desde, hasta) =>
      supabase.from('profiles').select('id, full_name').in('id', tanda).order('id').range(desde, hasta)
  )
  const nombrePorClienteId = new Map(clientes.map((cliente) => [cliente.id, cliente.full_name]))

  const lotePorId = new Map<string, DatosDeLote>()
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

export interface CuotaDeUnPlan {
  lote_id: string
  ciclo: number
  numero: number
  plan: number
}

function claveDeGrupo(cuota: { lote_id: string; ciclo: number }) {
  return `${cuota.lote_id}|${cuota.ciclo}`
}

// La posición de cada cuota adentro de su plan, agrupada por lote Y ciclo.
//
// Por ciclo: un lote rescindido y vuelto a vender tiene dos juegos de
// cuotas. El conteo anterior usaba el ciclo vigente del lote para todas, así
// que un movimiento de la venta vieja se contaba contra el plan de la nueva.
//
// Por plan: después de refinanciar, las cuotas nuevas continúan la
// numeración. Contando todas las del ciclo, la primera cuota del plan nuevo
// salía "25/44", que no es ni su número en el plan viejo ni en el nuevo (ver
// lib/cuotas/plan-de-cuotas.ts).
export function agruparPosicionesPorLoteYCiclo(
  cuotas: CuotaDeUnPlan[]
): Map<string, Map<number, PosicionEnElPlan>> {
  const porGrupo = new Map<string, CuotaConPlan[]>()
  for (const cuota of cuotas) {
    const clave = claveDeGrupo(cuota)
    const lista = porGrupo.get(clave) ?? []
    lista.push({ numero: cuota.numero, plan: cuota.plan })
    porGrupo.set(clave, lista)
  }

  return new Map([...porGrupo].map(([clave, lista]) => [clave, posicionesDelPlan(lista)]))
}

export function posicionDeLaCuota(
  posiciones: Map<string, Map<number, PosicionEnElPlan>>,
  cuota: CuotaDeUnPlan
): PosicionEnElPlan {
  return (
    posiciones.get(claveDeGrupo(cuota))?.get(cuota.numero) ?? {
      // No debería pasar: la cuota sale de la misma tabla que se agrupó. Si
      // pasa, va sin "de cuántas" (totalDelPlan 0), que es mejor que un
      // total inventado.
      numero: cuota.numero,
      plan: cuota.plan,
      posicion: cuota.numero,
      totalDelPlan: 0,
      esDeUnPlanRefinanciado: cuota.plan > 1,
      textoCorto: '',
      textoLargo: '',
    }
  )
}

async function traerPosiciones(supabase: SupabaseClient, loteIds: string[]) {
  const cuotas = await traerTodasLasFilasPorTandas<CuotaDeUnPlan>(loteIds, (tanda, desde, hasta) =>
    supabase
      .from('cuotas')
      .select('lote_id, ciclo, numero, plan')
      .in('lote_id', tanda)
      .order('id')
      .range(desde, hasta)
  )
  return agruparPosicionesPorLoteYCiclo(cuotas)
}

interface CuotaCruda extends CuotaDeUnPlan {
  id: string
  fecha_vencimiento: string
}

const CAMPOS_CUOTA = 'id, lote_id, ciclo, numero, plan, fecha_vencimiento'

async function traerCuotas(supabase: SupabaseClient, cuotaIds: string[]) {
  return traerTodasLasFilasPorTandas<CuotaCruda>(cuotaIds, (tanda, desde, hasta) =>
    supabase.from('cuotas').select(CAMPOS_CUOTA).in('id', tanda).order('id').range(desde, hasta)
  )
}

// Cuenta corriente de una PERSONA, y las órdenes de pago de su Excel: la
// fila apunta directo a la cuota.
export async function traerDatosDeCuotas(
  supabase: SupabaseClient,
  cuotaIds: string[]
): Promise<Map<string, DatosDeCuota>> {
  const cuotas = await traerCuotas(supabase, cuotaIds)
  const posiciones = await traerPosiciones(
    supabase,
    cuotas.map((cuota) => cuota.lote_id)
  )

  const cuotaPorId = new Map<string, DatosDeCuota>()
  for (const cuota of cuotas) {
    cuotaPorId.set(cuota.id, {
      fechaVencimiento: cuota.fecha_vencimiento,
      cuotas: [posicionDeLaCuota(posiciones, cuota)],
    })
  }

  return cuotaPorId
}

// Cuenta EXTERNA y cierre de caja: la fila no guarda la cuota, guarda el
// pago. Y un pago puede haberse repartido por FIFO entre varias cuotas, así
// que se resuelven todas y la fila termina diciendo "3-4/24".
//
// El mapa devuelto se indexa por pago_id, no por cuota_id.
export async function traerDatosDeCuotasPorPago(
  supabase: SupabaseClient,
  pagoIds: string[]
): Promise<Map<string, DatosDeCuota>> {
  const imputaciones = await traerTodasLasFilasPorTandas<{ pago_id: string; cuota_id: string }>(
    pagoIds,
    (tanda, desde, hasta) =>
      supabase
        .from('pago_imputaciones')
        .select('pago_id, cuota_id')
        .in('pago_id', tanda)
        .order('id')
        .range(desde, hasta)
  )

  const cuotas = await traerCuotas(
    supabase,
    imputaciones.map((imputacion) => imputacion.cuota_id)
  )
  const cuotaPorId = new Map(cuotas.map((cuota) => [cuota.id, cuota]))
  const posiciones = await traerPosiciones(
    supabase,
    cuotas.map((cuota) => cuota.lote_id)
  )

  const porPago = new Map<string, DatosDeCuota>()
  for (const imputacion of imputaciones) {
    const cuota = cuotaPorId.get(imputacion.cuota_id)
    if (!cuota) continue

    const posicion = posicionDeLaCuota(posiciones, cuota)
    const existente = porPago.get(imputacion.pago_id)
    if (!existente) {
      porPago.set(imputacion.pago_id, {
        fechaVencimiento: cuota.fecha_vencimiento,
        cuotas: [posicion],
      })
      continue
    }

    // Dos imputaciones del mismo pago a la misma cuota son UNA cuota en la
    // fila: "3/24", no "3-3/24".
    if (!existente.cuotas.some((otra) => otra.numero === posicion.numero)) {
      existente.cuotas.push(posicion)
    }
    // La cuota más vieja manda para la columna "mes de": es el mes que el
    // cliente estaba saldando cuando pagó.
    if (cuota.fecha_vencimiento < existente.fechaVencimiento) {
      existente.fechaVencimiento = cuota.fecha_vencimiento
    }
  }

  return porPago
}
