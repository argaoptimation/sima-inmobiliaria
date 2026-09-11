import { etiquetaMesCorta } from '@/lib/fecha/meses'
import { nombreDelPlan, type PosicionEnElPlan } from '@/lib/cuotas/plan-de-cuotas'

// LAS MISMAS COLUMNAS EN TODOS LOS EXCEL (11/09, pedido de Gabriel: "debe
// usar la misma estructura de columnas en todos, para no tener que estar
// entendiendo todos los excels").
//
// Hasta aca cada Excel nombraba el lote a su manera. La cuenta corriente ya
// usaba la planilla de Nicolas (Loteo | Mza | Lote | Cliente), pero la
// proyeccion, las ordenes de pago y el cierre de caja traian una sola
// columna "Lote" con el identificador interno del sistema ("DEMO Lote
// Contrato Quintana (revisar)"), y dos de ellas decian "Comprador" en vez de
// "Cliente". Para cruzar dos Excel habia que adivinar que eran el mismo lote.
//
// La regla desde ahora: toda fila que habla de un lote lo identifica con
// estas cuatro columnas, con estos nombres y en este orden; y si habla de
// una cuota, le siguen "Mes de" y "Nro cuota". Todo lo que arma esas celdas
// vive aca, asi que un Excel no puede escribir el lote distinto que otro.

export const COLUMNAS_DEL_LOTE = ['Loteo', 'Mza', 'Lote', 'Cliente'] as const
export const COLUMNAS_DE_LA_CUOTA = ['Mes de', 'Nro cuota'] as const

export interface DatosDeLote {
  loteo: string | null
  manzana: string | null
  numeroLote: string | null
  identificador: string
  clienteNombre: string | null
}

export interface DatosDeCuota {
  // La que manda para "Mes de". Si la fila cubre varias cuotas, la mas
  // vieja: es el mes que el cliente estaba saldando cuando pago.
  fechaVencimiento: string
  // Casi siempre una sola. Son varias cuando la fila es un PAGO (cuentas
  // externas, cierre de caja) y el FIFO lo imputo a mas de una cuota.
  cuotas: PosicionEnElPlan[]
}

export function celdasDelLote(
  lote: DatosDeLote | undefined,
  clienteSinLote: string | null = null
): [string, string, string, string] {
  // Sin lote las cuatro quedan VACIAS, no con guiones: en una planilla una
  // celda vacia se filtra y se suma, y un "—" rompe cualquier formula que le
  // apliquen encima.
  return [
    lote?.loteo ?? '',
    lote?.manzana ?? '',
    // Sin numero de lote cargado cae al identificador, que es el nombre con
    // el que el lote se conoce en el resto del sistema.
    lote ? (lote.numeroLote ?? lote.identificador) : '',
    lote?.clienteNombre ?? clienteSinLote ?? '',
  ]
}

export function celdasDeLaCuota(cuota: DatosDeCuota | undefined): [string, string] {
  if (!cuota) return ['', '']
  return [etiquetaMesCorta(cuota.fechaVencimiento.slice(0, 7)), nroDeCuota(cuota.cuotas)]
}

function rango(numeros: number[]): string {
  const ordenados = [...numeros].sort((a, b) => a - b)
  if (ordenados.length === 1) return `${ordenados[0]}`
  return `${ordenados[0]}-${ordenados[ordenados.length - 1]}`
}

// "3/24" como en la planilla de Nicolas, "3-4/24" si un pago cubrio dos.
//
// Despues de refinanciar va el numero de la plataforma Y la posicion en el
// plan que se esta pagando: "25 (1/20 del plan refinanciado)". El 25 es el
// que coincide con Pagos y con el detalle del lote; el "1 de 20" es lo que
// entiende el cliente (mismo criterio que la pantalla y el recibo, ver
// lib/cuotas/plan-de-cuotas.ts). Antes salia "25/44", contando juntas las
// cuotas del plan viejo y del nuevo, que no es ninguna de las dos cosas.
export function nroDeCuota(cuotas: PosicionEnElPlan[]): string {
  if (cuotas.length === 0) return ''

  const numeros = rango(cuotas.map((cuota) => cuota.numero))
  const [primera] = cuotas

  // Cuotas de dos planes en la misma fila no deberia pasar (al refinanciar
  // las viejas quedan en cero y no reciben mas pagos), y un plan sin total
  // tampoco. En los dos casos va el numero solo: mejor que falte el "de
  // cuantas" a que diga uno que no cierra.
  if (new Set(cuotas.map((cuota) => cuota.plan)).size > 1) return numeros
  if (primera.totalDelPlan === 0) return numeros

  if (!primera.esDeUnPlanRefinanciado) return `${numeros}/${primera.totalDelPlan}`

  const posiciones = rango(cuotas.map((cuota) => cuota.posicion))
  return `${numeros} (${posiciones}/${primera.totalDelPlan} ${nombreDelPlan(primera.plan)})`
}

const ORDEN_NATURAL = new Intl.Collator('es', { numeric: true, sensitivity: 'base' })

// El orden de las filas, por las mismas columnas que se ven: loteo, manzana
// y lote, con los numeros como numeros ("2" antes que "10", como el listado
// de Lotes desde la migracion 0060).
export function compararLotes(a: DatosDeLote | undefined, b: DatosDeLote | undefined): number {
  const [loteoA, manzanaA, loteA] = celdasDelLote(a)
  const [loteoB, manzanaB, loteB] = celdasDelLote(b)
  return (
    ORDEN_NATURAL.compare(loteoA, loteoB) ||
    ORDEN_NATURAL.compare(manzanaA, manzanaB) ||
    ORDEN_NATURAL.compare(loteA, loteB)
  )
}

// "3/24" entra en cualquier columna; "25 (1/20 del plan refinanciado)" no, y
// con la columna de al lado ocupada Excel lo corta. La columna "Nro cuota" se
// abre lo justo para lo mas largo que tenga esa planilla.
export function anchoDeNroCuota(nros: string[]): number {
  return Math.min(
    40,
    nros.reduce((ancho, nro) => Math.max(ancho, nro.length + 2), 12)
  )
}
