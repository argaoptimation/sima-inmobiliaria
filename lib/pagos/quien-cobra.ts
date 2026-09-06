// Quién cobra una cuota: el alias que ve el cliente en su portal, y por lo
// tanto la persona a la que efectivamente le llega la plata.
//
// Una sola función para las tres cosas que TIENEN que coincidir:
//   1. el alias que el portal del cliente le muestra para transferir,
//   2. quién confirma ese pago cuando llega,
//   3. a quién se le postea el Haber en la cuenta corriente.
// Si estos tres criterios se calcularan por separado, cualquier divergencia
// entre ellos sería un error de plata, no de pantalla.

export interface CuentaDeCobro {
  cuenta_cobro_id: string | null
  cuenta_cobro_externa_id: string | null
}

export interface DestinoDeCobro {
  perfilId: string | null
  cuentaExternaId: string | null
}

// Manda la cuota; si no tiene destino propio, cae al del lote.
//
// Desde el 05/09 cada cuota puede tener su propio destino (Nicolás reparte
// cuota por cuota: la 1 al vendedor 1, la 2 al vendedor 2). Las cuotas
// viejas no tienen ninguno y siguen cobrándose donde siempre.
export function resolverDestinoDeCobro(
  cuota: CuentaDeCobro | null,
  lote: CuentaDeCobro | null
): DestinoDeCobro {
  if (cuota?.cuenta_cobro_id) {
    return { perfilId: cuota.cuenta_cobro_id, cuentaExternaId: null }
  }

  if (cuota?.cuenta_cobro_externa_id) {
    return { perfilId: null, cuentaExternaId: cuota.cuenta_cobro_externa_id }
  }

  if (lote?.cuenta_cobro_id) {
    return { perfilId: lote.cuenta_cobro_id, cuentaExternaId: null }
  }

  if (lote?.cuenta_cobro_externa_id) {
    return { perfilId: null, cuentaExternaId: lote.cuenta_cobro_externa_id }
  }

  return { perfilId: null, cuentaExternaId: null }
}
