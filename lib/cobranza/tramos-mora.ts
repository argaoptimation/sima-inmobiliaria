import { createClient } from '@/lib/supabase/server'
import { hoyArgentina } from '@/lib/fecha/hoy-argentina'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export interface FilaMoroso {
  loteId: string
  identificador: string
  clienteId: string
  clienteNombre: string
  cuotasVencidas: number
  saldoPendiente: number
  moneda: string
  loteoNombre?: string
  manzana?: string | null
  numeroLote?: string | null
}

export interface TramosMora {
  debe1: FilaMoroso[]
  debe2: FilaMoroso[]
  posiblePrejudicial: FilaMoroso[]
  prejudicialOficial: FilaMoroso[]
}

// Extraído de app/admin/panel-morosos/page.tsx (PR2 del rediseño, ver
// design-system/rediseno/PLAN.md) para que el dashboard de /admin/inicio
// pueda mostrar los mismos 4 tramos sin duplicar la lógica -- MISMO cálculo
// exacto que ya usaba el panel, no se tocó ningún criterio (cuotas del
// ciclo actual, saldo_pendiente > 0 y vencida antes de hoy).
export async function calcularTramosMora(supabase: SupabaseServerClient): Promise<TramosMora> {
  const hoy = hoyArgentina()

  const { data: lotesVendidos } = await supabase
    .from('lotes')
    .select('id, identificador, moneda, cliente_id, ciclo_actual, marcado_prejudicial, loteo_id, manzana, numero_lote, loteos(nombre)')
    .eq('estado', 'vendido')
    .not('cliente_id', 'is', null)

  const loteIds = (lotesVendidos ?? []).map((lote) => lote.id)
  const clienteIds = [...new Set((lotesVendidos ?? []).map((lote) => lote.cliente_id as string))]

  const { data: clientes } =
    clienteIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', clienteIds)
      : { data: [] }
  const nombreClientePorId = new Map((clientes ?? []).map((cliente) => [cliente.id, cliente.full_name]))

  const { data: cuotasSinFiltrar } =
    loteIds.length > 0
      ? await supabase.from('cuotas').select('lote_id, ciclo, saldo_pendiente, fecha_vencimiento').in('lote_id', loteIds)
      : { data: [] }

  const cicloActualPorLoteId = new Map((lotesVendidos ?? []).map((lote) => [lote.id, lote.ciclo_actual]))
  const cuotas = (cuotasSinFiltrar ?? []).filter((cuota) => cuota.ciclo === cicloActualPorLoteId.get(cuota.lote_id))

  const cuotasPorLote = new Map<string, { saldo_pendiente: number; fecha_vencimiento: string }[]>()
  for (const cuota of cuotas) {
    const lista = cuotasPorLote.get(cuota.lote_id) ?? []
    lista.push(cuota)
    cuotasPorLote.set(cuota.lote_id, lista)
  }

  const tramos: TramosMora = {
    debe1: [],
    debe2: [],
    posiblePrejudicial: [],
    prejudicialOficial: [],
  }

  for (const lote of (lotesVendidos ?? []) as unknown as Array<{
    id: string
    identificador: string
    moneda: string
    cliente_id: string
    ciclo_actual: number
    marcado_prejudicial: boolean
    loteo_id: string | null
    manzana: string | null
    numero_lote: string | null
    loteos: { nombre: string } | { nombre: string }[] | null
  }>) {
    const cuotasDelLote = cuotasPorLote.get(lote.id) ?? []
    const cuotasVencidas = cuotasDelLote.filter(
      (cuota) => cuota.saldo_pendiente > 0 && cuota.fecha_vencimiento < hoy
    ).length
    const saldoPendiente = cuotasDelLote.reduce((acum, cuota) => acum + cuota.saldo_pendiente, 0)

    if (saldoPendiente === 0 && !lote.marcado_prejudicial) continue

    const loteoNombre = Array.isArray(lote.loteos)
      ? lote.loteos[0]?.nombre
      : lote.loteos?.nombre

    const fila: FilaMoroso = {
      loteId: lote.id,
      identificador: lote.identificador,
      clienteId: lote.cliente_id as string,
      clienteNombre: nombreClientePorId.get(lote.cliente_id as string) ?? '—',
      cuotasVencidas,
      saldoPendiente,
      moneda: lote.moneda,
      loteoNombre,
      manzana: lote.manzana,
      numeroLote: lote.numero_lote,
    }

    if (lote.marcado_prejudicial) {
      tramos.prejudicialOficial.push(fila)
    } else if (cuotasVencidas === 1) {
      tramos.debe1.push(fila)
    } else if (cuotasVencidas === 2) {
      tramos.debe2.push(fila)
    } else if (cuotasVencidas >= 3) {
      tramos.posiblePrejudicial.push(fila)
    }
  }

  return tramos
}
