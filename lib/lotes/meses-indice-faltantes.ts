import { createClient } from '@/lib/supabase/server'
import { calcularPeriodoIndiceNecesario } from './aplicar-indexacion'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export interface LoteConMesFaltante {
  id: string
  identificador: string
}

export interface MesIndiceFaltante {
  nombre: string
  periodo: string
  lotes: LoteConMesFaltante[]
}

// Cuotas en pesos, YA VENCIDAS (o que vencen hoy) y todavía pendientes,
// cuyo índice del mes anterior ("a mes vencido") nunca se cargó -- compute
// on read, mismo criterio que obtenerCuotasSinDistribucion. Agrupado por
// (índice, mes), no por cuota: con muchos clientes puede haber cientos de
// cuotas compartiendo el mismo hueco, y lo que importa mostrar es qué mes
// falta cargar -- pero desde el 24/08 también se listan los lotes
// concretos afectados (pedido de Gabriel: poder ir directo a cargarlo, no
// solo saber que "algo" falta).
//
// Filtro por vencimiento <= hoy (25/08, corrección de un bug real que
// encontró Gabriel): antes se avisaba de CUALQUIER cuota pendiente, incluidas
// las que vencen recién dentro de varios meses -- una cuota de abril 2027
// no necesita el índice de marzo 2027 hoy, lo va a necesitar cuando llegue
// ese mes. Avisar tan lejos en el futuro no tiene sentido: el índice de un
// mes que todavía no pasó ni siquiera existe para cargar.
export async function obtenerMesesIndiceFaltantes(
  supabase: SupabaseServerClient
): Promise<MesIndiceFaltante[]> {
  const { data: lotes } = await supabase
    .from('lotes')
    .select('id, identificador, indice_tipo')
    .eq('moneda', 'ARS')
    .not('indice_tipo', 'is', null)

  if (!lotes || lotes.length === 0) return []

  const lotePorId = new Map(lotes.map((lote) => [lote.id, lote]))

  const hoy = new Date().toISOString().slice(0, 10)

  const { data: cuotasPendientes } = await supabase
    .from('cuotas')
    .select('lote_id, fecha_vencimiento')
    .in(
      'lote_id',
      lotes.map((lote) => lote.id)
    )
    .gt('saldo_pendiente', 0)
    .lte('fecha_vencimiento', hoy)

  const necesarios = new Map<string, { nombre: string; periodo: string; loteIds: Set<string> }>()
  for (const cuota of cuotasPendientes ?? []) {
    const lote = lotePorId.get(cuota.lote_id)
    if (!lote?.indice_tipo) continue
    const periodo = calcularPeriodoIndiceNecesario(cuota.fecha_vencimiento)
    const clave = `${lote.indice_tipo}|${periodo}`
    const existente = necesarios.get(clave)
    if (existente) {
      existente.loteIds.add(lote.id)
    } else {
      necesarios.set(clave, { nombre: lote.indice_tipo, periodo, loteIds: new Set([lote.id]) })
    }
  }

  if (necesarios.size === 0) return []

  const { data: valoresExistentes } = await supabase.from('indices_valores').select('nombre, periodo')
  const existentes = new Set((valoresExistentes ?? []).map((v) => `${v.nombre}|${v.periodo}`))

  return [...necesarios.values()]
    .filter((necesario) => !existentes.has(`${necesario.nombre}|${necesario.periodo}`))
    .map((necesario) => ({
      nombre: necesario.nombre,
      periodo: necesario.periodo,
      lotes: [...necesario.loteIds]
        .map((id) => lotePorId.get(id))
        .filter((lote): lote is NonNullable<typeof lote> => lote !== undefined)
        .map((lote) => ({ id: lote.id, identificador: lote.identificador }))
        .sort((a, b) => a.identificador.localeCompare(b.identificador)),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre) || a.periodo.localeCompare(b.periodo))
}
