// Cómo se lee cada `origen` de un movimiento, en castellano.
//
// Compartido entre la cuenta corriente de una persona y la de una cuenta
// externa (06/09): las dos manejan los mismos movimientos y no tiene sentido
// que la misma fila se lea distinto según en qué pantalla estés.
//
// Una cuenta externa solo usa los dos de en medio: no participa de
// distribuciones, así que nunca tiene un cobro de cuota ni un debe manual.
export const ETIQUETA_ORIGEN: Record<string, string> = {
  cobro_cuota: 'Cobro de cuota (automático)',
  transferencia_empresa: 'Transferencia de la empresa',
  pago_directo_cliente: 'Pago directo del cliente',
  reversion_cobro_cuota: 'Reversión (corrección de pago)',
  ajuste_distribucion: 'Ajuste de distribución',
  debe_manual: 'Debe manual (gasto/adelanto/descuento)',
}
