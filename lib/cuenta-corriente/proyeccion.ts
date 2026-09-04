import type { SupabaseClient } from '@supabase/supabase-js'

export interface FilaProyeccion {
  mes: string // 'YYYY-MM'
  moneda: string
  monto: number
}

export interface DetalleLoteProyeccion {
  mes: string
  loteId: string
  loteIdentificador: string
  moneda: string
  monto: number
}

// Proyección de cobranza mes a mes para una persona (acreedor/vendedor/etc.),
// sumando su parte de TODAS las cuotas de TODOS sus lotes cuyo vencimiento cae
// en el rango [desde, hasta] -- pedido de Gabriel tras la llamada con Nico
// (ver memoria project_sima_backlog_notion_2026_08.md). Reutiliza
// cuota_distribuciones (la misma tabla que ya arma "Destinos" en el detalle
// del lote y que alimenta el saldo de cuenta corriente), no inventa ningún
// cálculo nuevo -- solo agrupa por mes de vencimiento en vez de por lote.
//
// Se trae todo lo del profile sin acotar por fecha en la query (volumen bajo,
// mismo patrón que ya usa la página de cuenta corriente) y se filtra/agrupa
// en JS.
export async function obtenerProyeccionCuotas(
  supabase: SupabaseClient,
  profileId: string,
  desde: string, // 'YYYY-MM-DD'
  hasta: string // 'YYYY-MM-DD'
): Promise<{ filas: FilaProyeccion[]; detalle: DetalleLoteProyeccion[] }> {
  const { data } = await supabase
    .from('cuota_distribuciones')
    .select('monto, cuotas!inner(fecha_vencimiento, lote_id, lotes!inner(identificador, moneda))')
    .eq('profile_id', profileId)

  const filas = (data ?? []) as unknown as Array<{
    monto: number
    cuotas: {
      fecha_vencimiento: string
      lote_id: string
      lotes: { identificador: string; moneda: string }
    }
  }>

  const porMesYMoneda = new Map<string, number>()
  const detalle: DetalleLoteProyeccion[] = []

  for (const fila of filas) {
    const vencimiento = fila.cuotas.fecha_vencimiento
    if (vencimiento < desde || vencimiento > hasta) continue

    const mes = vencimiento.slice(0, 7)
    const moneda = fila.cuotas.lotes.moneda
    const clave = `${mes}|${moneda}`
    porMesYMoneda.set(clave, (porMesYMoneda.get(clave) ?? 0) + fila.monto)

    detalle.push({
      mes,
      loteId: fila.cuotas.lote_id,
      loteIdentificador: fila.cuotas.lotes.identificador,
      moneda,
      monto: fila.monto,
    })
  }

  const resultado: FilaProyeccion[] = [...porMesYMoneda.entries()]
    .map(([clave, monto]) => {
      const [mes, moneda] = clave.split('|')
      return { mes, moneda, monto: Math.round(monto * 100) / 100 }
    })
    .sort((a, b) => (a.mes === b.mes ? a.moneda.localeCompare(b.moneda) : a.mes.localeCompare(b.mes)))

  detalle.sort((a, b) => (a.mes === b.mes ? a.loteIdentificador.localeCompare(b.loteIdentificador) : a.mes.localeCompare(b.mes)))

  return { filas: resultado, detalle }
}
