import { fechaDePlanilla } from '@/lib/planillas/fechas'
import {
  anchoDeNroCuota,
  celdasDelLote,
  celdasDeLaCuota,
  COLUMNAS_DEL_LOTE,
  COLUMNAS_DE_LA_CUOTA,
  type DatosDeLote,
  type DatosDeCuota,
} from '@/lib/planillas/columnas-del-lote'

export type { DatosDeLote, DatosDeCuota }

// El formato de planilla que ya usaba Nicolás, replicado tal cual de la
// captura que pasó Gabriel el 08/09:
//
//   fecha | tipo de movimiento | concepto | loteo | mza | lote | cliente |
//   mes de | nro cuota | monto
//
// Vive acá y no adentro del route de export porque la pantalla tiene que
// mostrar EXACTAMENTE lo mismo que se descarga (regla de Gabriel, 09/09:
// "todas estas tablas que podríamos exportar deberían estar también
// visibles"). Si el armado viviera en el export, las dos vistas se
// separarían a la primera corrección.
//
// Desde el 11/09 las columnas del lote y de la cuota salen de
// lib/planillas/columnas-del-lote.ts, que es de donde las sacan también los
// otros Excel: esta planilla es el modelo que siguen todos.
export interface FilaMovimientoPlanilla {
  id: string
  fecha: string
  // "crédito" es plata que le quedó a favor (los Debe: su parte de una cuota
  // que se cobró). "débito" es plata que ya le llegó (los Haber: una
  // transferencia, o un cobro que entró directo a su cuenta). El monto lleva
  // el signo, que es como lo tenía Nicolás en su Excel.
  tipoMovimiento: 'crédito' | 'débito'
  concepto: string
  loteo: string
  manzana: string
  lote: string
  cliente: string
  mesDe: string
  nroCuota: string
  monto: number
  moneda: string
  cotizacionDia: number | null
  detalle: string
  loteId: string | null
}

// Versión corta del origen, para la columna "concepto". El mapa largo
// (ETIQUETA_ORIGEN) sigue existiendo para el filtro, donde sí hace falta la
// aclaración entre paréntesis.
const CONCEPTO_ORIGEN: Record<string, string> = {
  cobro_cuota: 'cobro de cuota',
  transferencia_empresa: 'transferencia',
  pago_directo_cliente: 'pago directo del cliente',
  reversion_cobro_cuota: 'reversión de cobro',
  ajuste_distribucion: 'ajuste de distribución',
  debe_manual: 'ajuste manual',
}

export interface MovimientoCrudo {
  id: string
  tipo: 'debe' | 'haber'
  monto: number
  moneda: string
  cotizacion_dia: number | null
  origen: string
  fecha_evento: string
  de_parte_de: string | null
  detalle: string | null
  lote_id: string | null
  cuota_id: string | null
}

export function armarFilasDeMovimiento(
  movimientos: MovimientoCrudo[],
  lotePorId: Map<string, DatosDeLote>,
  cuotaPorId: Map<string, DatosDeCuota>
): FilaMovimientoPlanilla[] {
  return movimientos.map((movimiento) => {
    const lote = movimiento.lote_id ? lotePorId.get(movimiento.lote_id) : undefined
    const cuota = movimiento.cuota_id ? cuotaPorId.get(movimiento.cuota_id) : undefined

    // Una transferencia suelta no tiene lote ni cuota: esas columnas quedan
    // vacías y la fila igual vale (es el caso "pepe | -80" de la captura).
    // Sin lote, "de parte de" es lo más parecido a un cliente que hay.
    const [loteo, manzana, numeroDeLote, cliente] = celdasDelLote(lote, movimiento.de_parte_de)
    const [mesDe, nroCuota] = celdasDeLaCuota(cuota)

    return {
      id: movimiento.id,
      fecha: movimiento.fecha_evento,
      tipoMovimiento: movimiento.tipo === 'debe' ? 'crédito' : 'débito',
      concepto: CONCEPTO_ORIGEN[movimiento.origen] ?? movimiento.origen,
      loteo,
      manzana,
      lote: numeroDeLote,
      cliente,
      mesDe,
      nroCuota,
      // El signo hace legible la columna sin tener que mirar la de al lado:
      // lo que suma es lo que le queda a favor, lo que resta es lo que ya
      // cobró. La suma de la columna ES el saldo.
      monto: movimiento.tipo === 'debe' ? movimiento.monto : -movimiento.monto,
      moneda: movimiento.moneda,
      cotizacionDia: movimiento.cotizacion_dia,
      detalle: [movimiento.detalle, movimiento.de_parte_de ? `de: ${movimiento.de_parte_de}` : null]
        .filter(Boolean)
        .join(' — '),
      loteId: movimiento.lote_id,
    }
  })
}

// Los encabezados, en el orden de la captura. Compartidos entre la tabla de
// la pantalla y la hoja de cálculo para que no se puedan desalinear.
export const COLUMNAS_PLANILLA = [
  'Fecha',
  'Tipo de movimiento',
  'Concepto',
  ...COLUMNAS_DEL_LOTE,
  ...COLUMNAS_DE_LA_CUOTA,
  'Monto',
  'Moneda',
  'Cotización del día',
  // El texto que escribió el administrador ("Adelanto entregado en mano",
  // "de: Cliente 1"). No estaba en la captura de Nicolás, pero sacarlo
  // perdía la unica explicacion en castellano de por que existe esa fila:
  // el concepto de al lado es una etiqueta fija del sistema, esto es lo que
  // penso una persona.
  'Detalle',
] as const

export function celdasDeFila(fila: FilaMovimientoPlanilla): (string | number | Date)[] {
  return [
    // Una fecha de verdad y no el texto de la base: se ve DD/MM/AA y se
    // puede ordenar (ver lib/planillas/fechas.ts).
    fechaDePlanilla(fila.fecha),
    fila.tipoMovimiento,
    fila.concepto,
    fila.loteo,
    fila.manzana,
    fila.lote,
    fila.cliente,
    fila.mesDe,
    fila.nroCuota,
    fila.monto,
    fila.moneda,
    fila.cotizacionDia ?? '',
    fila.detalle,
  ]
}

// Los anchos de las columnas, en el mismo orden que COLUMNAS_PLANILLA. Van
// acá, al lado de los encabezados, por lo mismo: los tres Excel que usan
// esta planilla tenían cada uno su copia de la lista.
export function anchosDeLaPlanilla(filas: FilaMovimientoPlanilla[]): { width: number }[] {
  return [
    { width: 11 }, // Fecha
    { width: 18 }, // Tipo de movimiento
    { width: 24 }, // Concepto
    { width: 20 }, // Loteo
    { width: 8 }, // Mza
    { width: 12 }, // Lote
    { width: 24 }, // Cliente
    { width: 10 }, // Mes de
    { width: anchoDeNroCuota(filas.map((fila) => fila.nroCuota)) }, // Nro cuota
    { width: 14 }, // Monto
    { width: 10 }, // Moneda
    { width: 16 }, // Cotización del día
    { width: 34 }, // Detalle
  ]
}
