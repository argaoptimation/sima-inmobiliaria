// "21 a 30" en vez de "21, 22, 23, 24, 25, 26, 27, 28, 29, 30".
//
// Refinanciar se lleva TODA la deuda del lote, así que en un plan largo el
// evento del historial puede nombrar treinta cuotas de una. Enumerarlas
// hace ilegible justo el renglón que hay que leer meses después para
// reconstruir qué pasó con el lote.
//
// Los tramos salteados se mantienen separados ("3, 7 a 9, 15"): un hueco
// significa que esa cuota estaba paga, y eso es información, no ruido.
export function listarNumerosDeCuota(numeros: number[]): string {
  const ordenados = [...new Set(numeros)].sort((a, b) => a - b)
  if (ordenados.length === 0) return '—'

  const tramos: string[] = []
  let desde = ordenados[0]
  let hasta = ordenados[0]

  for (const numero of ordenados.slice(1)) {
    if (numero === hasta + 1) {
      hasta = numero
      continue
    }
    tramos.push(desde === hasta ? `${desde}` : `${desde} a ${hasta}`)
    desde = numero
    hasta = numero
  }
  tramos.push(desde === hasta ? `${desde}` : `${desde} a ${hasta}`)

  return tramos.join(', ')
}
