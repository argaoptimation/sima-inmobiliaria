// Seña cobrada en una moneda distinta a la del lote (06/09, pedido de
// Gabriel).
//
// Caso real que lo motivó: un lote en ARS cuya seña se cobró en USD. Antes
// la plataforma avisaba "está en otra moneda, queda registrada como pago
// pero no se descuenta de las cuotas" -- y el cliente terminaba financiando
// un total que ya había empezado a pagar. La seña se cobró: tiene que
// descontarse igual.
//
// La conversión usa la cotización del día en que se cobró la seña, no la de
// hoy. Es una operación que ya pasó: convertirla a valor de hoy le cambiaría
// el precio al cliente cada vez que se abre la pantalla.

// `cotizaciones_dolar.valor` son pesos por dólar.
export function convertirSenaAMonedaDelLote({
  montoSena,
  monedaSena,
  monedaLote,
  cotizacion,
}: {
  montoSena: number
  monedaSena: string
  monedaLote: string
  cotizacion: number | null
}): number | null {
  if (montoSena <= 0) return 0

  if (monedaSena === monedaLote) return montoSena

  // Sin cotización no se inventa un número: el que llama decide qué hacer
  // (mostrar el aviso y no descontar nada).
  if (!cotizacion || cotizacion <= 0) return null

  const convertido =
    monedaSena === 'USD' && monedaLote === 'ARS'
      ? montoSena * cotizacion
      : monedaSena === 'ARS' && monedaLote === 'USD'
        ? montoSena / cotizacion
        : null

  if (convertido === null) return null

  return Math.round(convertido * 100) / 100
}

export interface SenaADescontar {
  // Ya en la moneda del lote, listo para restar del precio.
  monto: number
  // Hubo conversión de moneda (la seña se cobró en otra).
  convertida: boolean
  // Cotización usada y de qué día es, para poder mostrarlo en pantalla.
  cotizacion: number | null
  fechaCotizacion: string | null
  // La seña está en otra moneda y no hay ninguna cotización cargada: no se
  // puede convertir, así que no se descuenta.
  sinCotizacion: boolean
}
