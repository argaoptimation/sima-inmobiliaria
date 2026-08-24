export interface CuotaIndexable {
  id: string
  montoAjustado: number
  saldoPendiente: number
  fechaVencimiento: string
}

export interface AjusteResultado {
  cuotaId: string
  montoAjustadoNuevo: number
  saldoPendienteNuevo: number
}

export interface ValorIndiceDisponible {
  periodo: string
  valor: number
}

// Dado un período "YYYY-MM-01" (el mes cuyo índice se acaba de cargar),
// devuelve el rango del mes SIGUIENTE -- "a mes vencido": el índice de
// mayo se aplica a las cuotas que vencen en junio.
export function calcularRangoMesSiguiente(periodo: string): { desde: string; hastaExclusive: string } {
  const [anio, mes] = periodo.split('-').map(Number)
  const mesSiguiente = mes === 12 ? 1 : mes + 1
  const anioMesSiguiente = mes === 12 ? anio + 1 : anio
  const mesDespues = mesSiguiente === 12 ? 1 : mesSiguiente + 1
  const anioMesDespues = mesSiguiente === 12 ? anioMesSiguiente + 1 : anioMesSiguiente

  const dosDigitos = (n: number) => String(n).padStart(2, '0')

  return {
    desde: `${anioMesSiguiente}-${dosDigitos(mesSiguiente)}-01`,
    hastaExclusive: `${anioMesDespues}-${dosDigitos(mesDespues)}-01`,
  }
}

// Inversa de calcularRangoMesSiguiente: dado el vencimiento de una cuota,
// qué período de índice le correspondería IDEALMENTE ("a mes vencido" — una
// cuota de enero necesita el índice de diciembre). Con el fallback de
// buscarValorIndiceAplicable, si ESE período puntual no está cargado se usa
// el más reciente disponible antes de él -- este período es el punto de
// partida de esa búsqueda, no una exigencia estricta.
export function calcularPeriodoIndiceNecesario(fechaVencimiento: string): string {
  const [anio, mes] = fechaVencimiento.split('-').map(Number)
  const mesAnterior = mes === 1 ? 12 : mes - 1
  const anioMesAnterior = mes === 1 ? anio - 1 : anio
  return `${anioMesAnterior}-${String(mesAnterior).padStart(2, '0')}-01`
}

// El primer día del mes calendario de una fecha -- usado como clave estable
// para identificar "el mes en que vence esta cuota", sin importar el día
// exacto del mes.
export function mesDeFecha(fecha: string): string {
  return `${fecha.slice(0, 7)}-01`
}

// Busca el valor de índice a usar para un período necesario: el cargado
// para ese período exacto si existe, y si no, el más reciente cargado
// ANTES de ese período (fallback -- confirmado por Gabriel el 23/08: usar
// el último índice cargado aunque sea de 2 o 3 meses atrás, nunca dejar la
// cuota sin ajuste por un mes salteado). null si no hay ningún valor
// cargado todavía para ese período o anterior.
export function buscarValorIndiceAplicable(
  periodoNecesario: string,
  valoresDisponibles: ValorIndiceDisponible[]
): ValorIndiceDisponible | null {
  const candidatos = valoresDisponibles.filter((v) => v.periodo <= periodoNecesario)
  if (candidatos.length === 0) return null

  return candidatos.reduce((masReciente, actual) =>
    actual.periodo > masReciente.periodo ? actual : masReciente
  )
}

// Aplica un ajuste de índice de forma ENCADENADA: el porcentaje se aplica
// sobre `montoAjustadoBase` (el monto ya escalado de la cuota ANTERIOR en
// la cadena, o el monto_base propio si es la primera cuota que se ajusta),
// nunca sobre el monto_base de la propia cuota -- ese era el bug real que
// reportó Nicolás (ver conversación del 23/08: cuota $100 -> IPC dic 5% ->
// $105 -> IPC ene 10% tiene que dar $115,5 sobre los $105, no $110 sobre
// los $100 originales).
//
// `saldoPendienteNuevo` resta lo que ya se pagó de ESTA cuota puntual
// (montoAjustado actual menos saldoPendiente actual), para no perder un
// pago parcial ya imputado.
export function calcularAjusteEncadenado(
  porcentaje: number,
  montoAjustadoBase: number,
  cuota: CuotaIndexable
): AjusteResultado {
  const pagado = cuota.montoAjustado - cuota.saldoPendiente
  const montoAjustadoNuevo = Math.round(montoAjustadoBase * (1 + porcentaje / 100) * 100) / 100
  const saldoPendienteNuevo = Math.max(0, Math.round((montoAjustadoNuevo - pagado) * 100) / 100)

  return { cuotaId: cuota.id, montoAjustadoNuevo, saldoPendienteNuevo }
}

// Corrige un ajuste YA aplicado sobre una cuota puntual: reconstruye el
// monto base de ANTES de ese ajuste (revirtiendo el porcentaje viejo) y
// aplica el porcentaje nuevo sobre esa misma base -- no resta/suma los
// porcentajes directamente, porque no son lineales. Devuelve el nuevo
// monto_ajustado de esta cuota, que el llamador tiene que propagar en
// cadena hacia las cuotas SIGUIENTES que ya se hayan calculado a partir del
// valor viejo (ver corregirValorIndice en app/admin/indices/actions.ts).
export function corregirAjusteEncadenado(
  porcentajeViejo: number,
  porcentajeNuevo: number,
  cuota: CuotaIndexable
): AjusteResultado {
  const baseAntesDelAjusteViejo = cuota.montoAjustado / (1 + porcentajeViejo / 100)
  return calcularAjusteEncadenado(porcentajeNuevo, baseAntesDelAjusteViejo, cuota)
}
