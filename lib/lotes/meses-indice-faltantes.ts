import { createClient } from '@/lib/supabase/server'
import { calcularPeriodoIndiceNecesario } from './aplicar-indexacion'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export interface MesIndiceFaltante {
  nombre: string
  periodo: string
}

// Cuotas en pesos, todavía pendientes, cuyo índice del mes anterior ("a mes
// vencido") nunca se cargó -- compute on read, mismo criterio que
// obtenerCuotasSinDistribucion. Agrupado por (índice, mes), no por cuota:
// con muchos clientes puede haber cientos de cuotas compartiendo el mismo
// hueco, y lo que importa mostrar es qué mes falta cargar, no cuáles
// cuotas puntuales lo necesitan.
export async function obtenerMesesIndiceFaltantes(
  supabase: SupabaseServerClient
): Promise<MesIndiceFaltante[]> {
  const { data: lotes } = await supabase
    .from('lotes')
    .select('id, indice_tipo')
    .eq('moneda', 'ARS')
    .not('indice_tipo', 'is', null)

  if (!lotes || lotes.length === 0) return []

  const indicePorLoteId = new Map(lotes.map((lote) => [lote.id, lote.indice_tipo as string]))

  const { data: cuotasPendientes } = await supabase
    .from('cuotas')
    .select('lote_id, fecha_vencimiento')
    .in(
      'lote_id',
      lotes.map((lote) => lote.id)
    )
    .gt('saldo_pendiente', 0)

  const necesarios = new Map<string, MesIndiceFaltante>()
  for (const cuota of cuotasPendientes ?? []) {
    const nombre = indicePorLoteId.get(cuota.lote_id)
    if (!nombre) continue
    const periodo = calcularPeriodoIndiceNecesario(cuota.fecha_vencimiento)
    necesarios.set(`${nombre}|${periodo}`, { nombre, periodo })
  }

  if (necesarios.size === 0) return []

  const { data: valoresExistentes } = await supabase.from('indices_valores').select('nombre, periodo')
  const existentes = new Set((valoresExistentes ?? []).map((v) => `${v.nombre}|${v.periodo}`))

  return [...necesarios.values()]
    .filter((necesario) => !existentes.has(`${necesario.nombre}|${necesario.periodo}`))
    .sort((a, b) => a.nombre.localeCompare(b.nombre) || a.periodo.localeCompare(b.periodo))
}
