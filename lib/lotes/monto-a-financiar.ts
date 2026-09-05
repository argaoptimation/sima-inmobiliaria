// Cuánto queda realmente para financiar en cuotas al vender un lote.
//
// Antes (bug reportado por Gabriel el 05/09 con el lote "DEMO Prueba de 1ra
// entrega y resta FIFO"): las cuotas automáticas se calculaban sobre el
// precio de lista completo y la entrega no se descontaba de ningún lado --
// la pantalla incluso decía "no se descuenta de ninguna cuota". Con un lote
// de 10.000, seña 500 y entrega 5.000 mostraba 10 cuotas de 1.000 cuando lo
// que queda por financiar son 4.500.
//
// La regla es la que describió Gabriel: lo que se divide en cuotas es el
// precio de lista MENOS lo que el comprador ya puso al firmar (la seña de la
// reserva y la entrega). Por eso ni la seña ni la entrega se imputan después
// contra las cuotas: ya están descontadas del total financiado, imputarlas
// sería contar la misma plata dos veces.
export function calcularMontoAFinanciar({
  precioTotal,
  montoSena,
  entrega,
}: {
  precioTotal: number
  montoSena: number
  entrega: number
}): number {
  return Math.round((precioTotal - montoSena - entrega) * 100) / 100
}
