import type { SupabaseClient } from '@supabase/supabase-js'
import { resolverDestinoDeCobro } from '@/lib/pagos/quien-cobra'
import { mesesEntre, type ProyeccionCobranza, type FilaProyeccion } from './proyeccion'

// LAS DOS COLUMNAS QUE NICOLÁS PIDIÓ VER JUNTAS (llamada del 09/09).
//
// Son dos números distintos sobre la misma cuota, y hasta ahora la
// plataforma solo sabía calcular uno:
//
//   LE CORRESPONDE  -> `cuota_distribuciones`: de esa cuota, qué parte es
//                      suya. Es la proyección que ya existía.
//   LE ASIGNASTE    -> `cuotas.cuenta_cobro_id`: a qué cuotas COMPLETAS le
//                      dijiste al cliente "pagale a él". Entra el monto
//                      entero de la cuota, no su parte.
//
// Su ejemplo textual: "le asignaste 900 y en realidad debería cobrar 510,
// por lo tanto le estás dando 390 de más". Hoy esa diferencia recién
// aparece DESPUÉS de que el cliente paga, cuando ya está en el saldo de la
// cuenta corriente. Él la necesita ANTES, mientras decide qué asignar: "si
// no voy anotando en un papel, en un Excel paralelo, no sé cuánto le
// asigné".
//
// Todo sale de UNA sola función para que las tres tablas de la pantalla
// (el resumen mes a mes, la proyección por lote y el detalle cuota por
// cuota) no puedan contradecirse entre ellas: es la misma lista de cuotas
// mirada de tres formas.

export interface FilaCuotaMesAMes {
  cuotaId: string
  loteId: string
  loteIdentificador: string
  compradorNombre: string | null
  numero: number
  fechaVencimiento: string
  mes: string
  moneda: string
  // El total de la cuota (el `monto_ajustado`, que es el monto vigente
  // después de indexaciones).
  montoCuota: number
  // El total de la cuota si él es quien la cobra; 0 si la cobra otro.
  asignado: number
  // Su parte según la distribución cargada.
  leCorresponde: number
  cobraEl: boolean
  pagada: boolean
}

export interface CeldaMesAMes {
  leCorresponde: number
  asignado: number
  // asignado − leCorresponde. Positivo: va a cobrar de más. Negativo:
  // todavía no le asignaste con qué cobrar lo que le toca.
  diferencia: number
}

export interface MesAMesDelAcreedor {
  meses: string[]
  filas: FilaCuotaMesAMes[]
  // mes -> moneda -> celda
  porMes: Record<string, Record<string, CeldaMesAMes>>
  // moneda -> celda (la fila TOTAL)
  totales: Record<string, CeldaMesAMes>
  monedas: string[]
}

function redondear(monto: number) {
  return Math.round(monto * 100) / 100
}

interface LoteCrudo {
  identificador: string
  moneda: string
  cliente_id: string | null
  ciclo_actual: number
  cuenta_cobro_id: string | null
  cuenta_cobro_externa_id: string | null
}

interface CuotaCruda {
  id: string
  numero: number
  fecha_vencimiento: string
  monto_ajustado: number
  saldo_pendiente: number
  ciclo: number
  lote_id: string
  cuenta_cobro_id: string | null
  cuenta_cobro_externa_id: string | null
  lotes: LoteCrudo
}

const CAMPOS_CUOTA =
  'id, numero, fecha_vencimiento, monto_ajustado, saldo_pendiente, ciclo, lote_id, cuenta_cobro_id, cuenta_cobro_externa_id, ' +
  'lotes!inner(identificador, moneda, cliente_id, ciclo_actual, cuenta_cobro_id, cuenta_cobro_externa_id)'

export async function obtenerMesAMesDelAcreedor(
  supabase: SupabaseClient,
  profileId: string,
  desde: string, // 'YYYY-MM-DD'
  hasta: string // 'YYYY-MM-DD'
): Promise<MesAMesDelAcreedor> {
  const meses = mesesEntre(desde, hasta)
  const mesesValidos = new Set(meses)

  // --- 1. Lo que le CORRESPONDE: su parte de cada cuota ------------------
  //
  // `refinanciada = false` va acá y en las dos consultas de abajo: una
  // cuota refinanciada sigue existiendo con saldo 0 y con su distribución
  // intacta (ver refinanciarLote), así que contarla sería sumar dos veces
  // la misma plata -- una por la cuota vieja y otra por la nueva que la
  // reemplazó.
  const { data: distribucionesData } = await supabase
    .from('cuota_distribuciones')
    .select(`monto, cuotas!inner(${CAMPOS_CUOTA})`)
    .eq('profile_id', profileId)
    .eq('cuotas.refinanciada', false)
    .gte('cuotas.fecha_vencimiento', desde)
    .lte('cuotas.fecha_vencimiento', hasta)

  const distribuciones = (distribucionesData ?? []) as unknown as Array<{
    monto: number
    cuotas: CuotaCruda
  }>

  // --- 2. Lo ASIGNADO: las cuotas que cobra él --------------------------
  //
  // El destino puede estar en la cuota o, si la cuota no tiene ninguno,
  // heredarse del lote (ver resolverDestinoDeCobro: es la misma regla con
  // la que el portal del cliente le muestra a quién transferir). Por eso
  // son dos consultas y no una: las suyas explícitas, y las de "sus" lotes
  // que no tienen destino propio.
  const { data: cuotasPropiasData } = await supabase
    .from('cuotas')
    .select(CAMPOS_CUOTA)
    .eq('cuenta_cobro_id', profileId)
    .eq('refinanciada', false)
    .gte('fecha_vencimiento', desde)
    .lte('fecha_vencimiento', hasta)

  const { data: lotesSuyos } = await supabase
    .from('lotes')
    .select('id')
    .eq('cuenta_cobro_id', profileId)

  const idsLotesSuyos = (lotesSuyos ?? []).map((lote) => lote.id as string)

  const { data: cuotasHeredadasData } = idsLotesSuyos.length
    ? await supabase
        .from('cuotas')
        .select(CAMPOS_CUOTA)
        .in('lote_id', idsLotesSuyos)
        .is('cuenta_cobro_id', null)
        .is('cuenta_cobro_externa_id', null)
        .eq('refinanciada', false)
        .gte('fecha_vencimiento', desde)
        .lte('fecha_vencimiento', hasta)
    : { data: [] }

  const cuotasQueCobra = [
    ...((cuotasPropiasData ?? []) as unknown as CuotaCruda[]),
    ...((cuotasHeredadasData ?? []) as unknown as CuotaCruda[]),
  ]

  // --- 3. Unión: una fila por cuota -------------------------------------
  const porCuota = new Map<string, FilaCuotaMesAMes>()

  function filaDe(cuota: CuotaCruda): FilaCuotaMesAMes | null {
    // Cuotas de un ciclo viejo (el lote se rescindió y se volvió a vender):
    // existen en la base pero ya no las va a pagar nadie.
    if (cuota.ciclo !== cuota.lotes.ciclo_actual) return null
    const mes = cuota.fecha_vencimiento.slice(0, 7)
    if (!mesesValidos.has(mes)) return null

    let fila = porCuota.get(cuota.id)
    if (!fila) {
      fila = {
        cuotaId: cuota.id,
        loteId: cuota.lote_id,
        loteIdentificador: cuota.lotes.identificador,
        compradorNombre: null,
        numero: cuota.numero,
        fechaVencimiento: cuota.fecha_vencimiento,
        mes,
        moneda: cuota.lotes.moneda,
        montoCuota: cuota.monto_ajustado,
        asignado: 0,
        leCorresponde: 0,
        cobraEl: false,
        pagada: cuota.saldo_pendiente <= 0,
      }
      porCuota.set(cuota.id, fila)
    }
    return fila
  }

  for (const distribucion of distribuciones) {
    const fila = filaDe(distribucion.cuotas)
    if (fila) fila.leCorresponde += distribucion.monto
  }

  for (const cuota of cuotasQueCobra) {
    const fila = filaDe(cuota)
    if (!fila) continue
    // Se vuelve a resolver el destino con la misma función que usa el
    // portal del cliente en vez de confiar solo en el filtro de la
    // consulta: si mañana cambia la regla de herencia, cambia en un lugar.
    const destino = resolverDestinoDeCobro(cuota, cuota.lotes)
    if (destino.perfilId !== profileId) continue
    fila.cobraEl = true
    fila.asignado = fila.montoCuota
  }

  // --- 4. El comprador de cada lote -------------------------------------
  const clienteIdPorLote = new Map<string, string>()
  for (const cuota of [...distribuciones.map((d) => d.cuotas), ...cuotasQueCobra]) {
    if (cuota.lotes.cliente_id) clienteIdPorLote.set(cuota.lote_id, cuota.lotes.cliente_id)
  }

  const clienteIds = [...new Set(clienteIdPorLote.values())]
  if (clienteIds.length > 0) {
    const { data: clientes } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', clienteIds)

    const nombrePorClienteId = new Map((clientes ?? []).map((c) => [c.id, c.full_name]))
    for (const fila of porCuota.values()) {
      const clienteId = clienteIdPorLote.get(fila.loteId)
      fila.compradorNombre = clienteId ? (nombrePorClienteId.get(clienteId) ?? null) : null
    }
  }

  const filas = [...porCuota.values()]
    .map((fila) => ({
      ...fila,
      leCorresponde: redondear(fila.leCorresponde),
      asignado: redondear(fila.asignado),
    }))
    .sort(
      (a, b) =>
        a.fechaVencimiento.localeCompare(b.fechaVencimiento) ||
        a.loteIdentificador.localeCompare(b.loteIdentificador) ||
        a.numero - b.numero
    )

  const { porMes, totales, monedas } = resumirPorMes(filas, meses)

  return { meses, filas, porMes, totales, monedas }
}

// Las cuotas agrupadas por mes y moneda. Separado del fetch para poder
// probarlo sin base de datos: es donde vive la resta que Nicolás mira.
export function resumirPorMes(
  filas: FilaCuotaMesAMes[],
  meses: string[]
): {
  porMes: Record<string, Record<string, CeldaMesAMes>>
  totales: Record<string, CeldaMesAMes>
  monedas: string[]
} {
  const porMes: Record<string, Record<string, CeldaMesAMes>> = {}
  const totales: Record<string, CeldaMesAMes> = {}

  for (const mes of meses) porMes[mes] = {}

  for (const fila of filas) {
    porMes[fila.mes] ??= {}

    const celda = (porMes[fila.mes][fila.moneda] ??= {
      leCorresponde: 0,
      asignado: 0,
      diferencia: 0,
    })
    celda.leCorresponde += fila.leCorresponde
    celda.asignado += fila.asignado

    const total = (totales[fila.moneda] ??= { leCorresponde: 0, asignado: 0, diferencia: 0 })
    total.leCorresponde += fila.leCorresponde
    total.asignado += fila.asignado
  }

  // El redondeo va al final y sobre el acumulado, no cuota por cuota:
  // redondear cada suma parcial arrastra centavos cuando hay muchas.
  for (const celdasDelMes of Object.values(porMes)) {
    for (const celda of Object.values(celdasDelMes)) {
      celda.leCorresponde = redondear(celda.leCorresponde)
      celda.asignado = redondear(celda.asignado)
      celda.diferencia = redondear(celda.asignado - celda.leCorresponde)
    }
  }
  for (const total of Object.values(totales)) {
    total.leCorresponde = redondear(total.leCorresponde)
    total.asignado = redondear(total.asignado)
    total.diferencia = redondear(total.asignado - total.leCorresponde)
  }

  return { porMes, totales, monedas: Object.keys(totales).sort() }
}

// La misma lista de cuotas, pivoteada como el Excel que ya usaba Nico: una
// fila por lote, una columna por mes. Es la proyección de siempre -- mismo
// tipo de dato que devuelve obtenerProyeccionCobranza -- pero calculada
// sobre las filas que ya se trajeron, para que la tabla de arriba y esta no
// puedan mostrar totales distintos.
export function pivotarPorLote(filas: FilaCuotaMesAMes[], meses: string[]): ProyeccionCobranza {
  const porLote = new Map<string, FilaProyeccion>()

  for (const fila of filas) {
    // Un lote donde solo cobra (sin distribución suya) no es parte de la
    // proyección: no le corresponde nada de ahí, solo pasa por su cuenta.
    if (fila.leCorresponde === 0) continue

    let filaLote = porLote.get(fila.loteId)
    if (!filaLote) {
      filaLote = {
        loteId: fila.loteId,
        loteIdentificador: fila.loteIdentificador,
        compradorNombre: fila.compradorNombre,
        moneda: fila.moneda,
        porMes: {},
        total: 0,
      }
      porLote.set(fila.loteId, filaLote)
    }

    filaLote.porMes[fila.mes] = (filaLote.porMes[fila.mes] ?? 0) + fila.leCorresponde
    filaLote.total += fila.leCorresponde
  }

  const filasPivoteadas = [...porLote.values()]
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
    for (const fila of filasPivoteadas) {
      const monto = fila.porMes[mes]
      if (!monto) continue
      totalesPorMes[mes][fila.moneda] = redondear((totalesPorMes[mes][fila.moneda] ?? 0) + monto)
      totalGeneral[fila.moneda] = redondear((totalGeneral[fila.moneda] ?? 0) + monto)
    }
  }

  return { meses, filas: filasPivoteadas, totalesPorMes, totalGeneral }
}

// Qué hacer con la diferencia, en castellano -- mismo criterio que
// describirSituacion en situacion.ts: el signo solo es ambiguo, y acá más
// todavía, porque "de más" y "de menos" se leen distinto según si sos el
// que gira o el que cobra.
export function describirDiferencia(diferencia: number, moneda: string): string {
  const monto = Math.abs(diferencia).toLocaleString('es-AR', { maximumFractionDigits: 2 })

  if (diferencia > 0) return `Va a cobrar ${monto} ${moneda} de más`
  if (diferencia < 0) return `Le falta cobrar ${monto} ${moneda}`

  return 'Justo'
}
