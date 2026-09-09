import { etiquetaMesCorta } from '@/lib/fecha/meses'

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

export interface DatosDeLote {
  loteo: string | null
  manzana: string | null
  numeroLote: string | null
  identificador: string
  clienteNombre: string | null
}

export interface DatosDeCuota {
  // Casi siempre una sola. Son varias en las cuentas externas, donde el
  // movimiento cuelga de un PAGO y un pago puede haberse imputado por FIFO
  // a más de una cuota: ahí la fila dice "3-4/24" y no miente diciendo "3".
  numeros: number[]
  fechaVencimiento: string
  // Cuántas cuotas tiene el plan, para poder escribir "3/24" y no "3".
  totalDelPlan: number
}

function etiquetaNumeroDeCuota(cuota: DatosDeCuota): string {
  const ordenados = [...cuota.numeros].sort((a, b) => a - b)
  if (ordenados.length === 0) return ''
  const nombre =
    ordenados.length === 1
      ? `${ordenados[0]}`
      : `${ordenados[0]}-${ordenados[ordenados.length - 1]}`
  return `${nombre}/${cuota.totalDelPlan}`
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
    // No se rellenan con guiones: en una planilla, una celda vacía se filtra
    // y se suma; un "—" rompe cualquier fórmula que le apliquen encima.
    return {
      id: movimiento.id,
      fecha: movimiento.fecha_evento,
      tipoMovimiento: movimiento.tipo === 'debe' ? 'crédito' : 'débito',
      concepto: CONCEPTO_ORIGEN[movimiento.origen] ?? movimiento.origen,
      loteo: lote?.loteo ?? '',
      manzana: lote?.manzana ?? '',
      // Sin número de lote cargado cae al identificador, que es el nombre
      // con el que el lote se conoce en el resto del sistema.
      lote: lote ? (lote.numeroLote ?? lote.identificador) : '',
      cliente: lote?.clienteNombre ?? movimiento.de_parte_de ?? '',
      mesDe: cuota ? etiquetaMesCorta(cuota.fechaVencimiento.slice(0, 7)) : '',
      nroCuota: cuota ? etiquetaNumeroDeCuota(cuota) : '',
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
  'Loteo',
  'Mza',
  'Lote',
  'Cliente',
  'Mes de',
  'Nro cuota',
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

export function celdasDeFila(fila: FilaMovimientoPlanilla): (string | number)[] {
  return [
    fila.fecha,
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
