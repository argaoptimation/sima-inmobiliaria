import { etiquetaMes } from '@/lib/fecha/meses'

// En qué mes termina de pagar: "36 cuotas desde octubre de 2024" → "Septiembre 2027".
//
// Se cuenta DESDE la primera, no después: la cuota 1 es octubre, así que la
// 36 cae 35 meses más adelante y no 36. Errar por uno acá es la clase de
// cosa que nadie revisa y que después aparece en un contrato.
//
// No usa `new Date`: sumar meses con Date arrastra el día (31 de enero + 1
// mes cae en marzo) y acá solo importan el año y el mes.
export function mesDeFinalizacion(
  fechaPrimeraCuota: string,
  cantidadCuotas: number
): string | null {
  if (!fechaPrimeraCuota || !Number.isFinite(cantidadCuotas) || cantidadCuotas < 1) return null

  const [anio, mes] = fechaPrimeraCuota.slice(0, 7).split('-').map(Number)
  if (!anio || !mes || mes < 1 || mes > 12) return null

  const indice = mes - 1 + (cantidadCuotas - 1)
  const anioFinal = anio + Math.floor(indice / 12)
  const mesFinal = (indice % 12) + 1

  return etiquetaMes(`${anioFinal}-${String(mesFinal).padStart(2, '0')}`)
}
