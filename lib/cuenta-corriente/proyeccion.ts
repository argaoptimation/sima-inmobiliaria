import type { SupabaseClient } from '@supabase/supabase-js'

export interface FilaProyeccion {
  loteId: string
  loteIdentificador: string
  compradorNombre: string | null
  moneda: string
  // mes ('YYYY-MM') -> monto que le corresponde a esta persona ese mes por
  // este lote. Los meses sin nada directamente no están.
  porMes: Record<string, number>
  total: number
}

export interface ProyeccionCobranza {
  // Todos los meses del rango elegido, en orden, aunque alguno no tenga
  // nada: son las columnas de la tabla.
  meses: string[]
  filas: FilaProyeccion[]
  // Por mes, el total por moneda (fila TOTAL al pie de la tabla). Se agrupa
  // por moneda porque un acreedor puede tener lotes en USD y en ARS a la
  // vez, y sumarlos en un solo número sería mentir.
  totalesPorMes: Record<string, Record<string, number>>
  totalGeneral: Record<string, number>
}

function redondear(monto: number) {
  return Math.round(monto * 100) / 100
}

// Lista de meses 'YYYY-MM' entre dos fechas 'YYYY-MM-DD', inclusive.
export function mesesEntre(desde: string, hasta: string): string[] {
  const meses: string[] = []
  let [anio, mes] = desde.slice(0, 7).split('-').map(Number)
  const [anioFin, mesFin] = hasta.slice(0, 7).split('-').map(Number)

  while (anio < anioFin || (anio === anioFin && mes <= mesFin)) {
    meses.push(`${anio}-${String(mes).padStart(2, '0')}`)
    mes += 1
    if (mes > 12) {
      mes = 1
      anio += 1
    }
  }

  return meses
}

// Proyección de cobranza para una persona (acreedor/vendedor/etc.): cuánto
// le toca cobrar mes a mes, lote por lote, según los vencimientos ya
// cargados -- pedido de Gabriel tras la llamada con Nico (ver memoria
// project_sima_backlog_notion_2026_08.md). Reutiliza cuota_distribuciones
// (la misma tabla que ya arma "Destinos" en el detalle del lote y que
// alimenta el saldo de cuenta corriente), no inventa ningún cálculo nuevo.
//
// 04/09: la primera versión devolvía una fila por (mes, lote), que con un
// acreedor con muchas cuotas se volvía una lista larguísima. Ahora se
// devuelve pivoteado como lo tenía Nico en su Excel: una fila por lote
// (con el comprador al lado) y una columna por mes.
export async function obtenerProyeccionCobranza(
  supabase: SupabaseClient,
  profileId: string,
  desde: string, // 'YYYY-MM-DD'
  hasta: string // 'YYYY-MM-DD'
): Promise<ProyeccionCobranza> {
  const { data } = await supabase
    .from('cuota_distribuciones')
    .select(
      'monto, cuotas!inner(fecha_vencimiento, lote_id, lotes!inner(identificador, moneda, cliente_id))'
    )
    .eq('profile_id', profileId)

  const distribuciones = (data ?? []) as unknown as Array<{
    monto: number
    cuotas: {
      fecha_vencimiento: string
      lote_id: string
      lotes: { identificador: string; moneda: string; cliente_id: string | null }
    }
  }>

  const meses = mesesEntre(desde, hasta)
  const mesesValidos = new Set(meses)

  const porLote = new Map<string, FilaProyeccion>()

  for (const distribucion of distribuciones) {
    const vencimiento = distribucion.cuotas.fecha_vencimiento
    if (vencimiento < desde || vencimiento > hasta) continue

    const mes = vencimiento.slice(0, 7)
    if (!mesesValidos.has(mes)) continue

    const lote = distribucion.cuotas.lotes
    const loteId = distribucion.cuotas.lote_id

    let fila = porLote.get(loteId)
    if (!fila) {
      fila = {
        loteId,
        loteIdentificador: lote.identificador,
        compradorNombre: null,
        moneda: lote.moneda,
        porMes: {},
        total: 0,
      }
      porLote.set(loteId, fila)
    }

    fila.porMes[mes] = (fila.porMes[mes] ?? 0) + distribucion.monto
    fila.total += distribucion.monto
  }

  // Nombre del comprador de cada lote (la columna "comprador" del Excel de
  // Nico). Se resuelve en una sola consulta aparte en vez de anidarla en el
  // select de arriba: cliente_id puede ser null (lote todavía sin vender) y
  // un !inner ahí se comería esas filas.
  const clienteIdPorLote = new Map<string, string>()
  for (const distribucion of distribuciones) {
    const clienteId = distribucion.cuotas.lotes.cliente_id
    if (clienteId) clienteIdPorLote.set(distribucion.cuotas.lote_id, clienteId)
  }

  const clienteIds = [...new Set(clienteIdPorLote.values())]
  if (clienteIds.length > 0) {
    const { data: clientes } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', clienteIds)

    const nombrePorClienteId = new Map((clientes ?? []).map((c) => [c.id, c.full_name]))
    for (const fila of porLote.values()) {
      const clienteId = clienteIdPorLote.get(fila.loteId)
      fila.compradorNombre = clienteId ? (nombrePorClienteId.get(clienteId) ?? null) : null
    }
  }

  const filas = [...porLote.values()]
    .map((fila) => ({
      ...fila,
      porMes: Object.fromEntries(
        Object.entries(fila.porMes).map(([mes, monto]) => [mes, redondear(monto)])
      ),
      total: redondear(fila.total),
    }))
    .sort((a, b) => a.loteIdentificador.localeCompare(b.loteIdentificador))

  const totalesPorMes: Record<string, Record<string, number>> = {}
  const totalGeneral: Record<string, number> = {}

  for (const mes of meses) {
    totalesPorMes[mes] = {}
    for (const fila of filas) {
      const monto = fila.porMes[mes]
      if (!monto) continue
      totalesPorMes[mes][fila.moneda] = redondear((totalesPorMes[mes][fila.moneda] ?? 0) + monto)
      totalGeneral[fila.moneda] = redondear((totalGeneral[fila.moneda] ?? 0) + monto)
    }
  }

  return { meses, filas, totalesPorMes, totalGeneral }
}
