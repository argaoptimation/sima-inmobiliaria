// Cambiar el monto de una cuota SIN refinanciar (10/09, pedido de Gabriel:
// "poder modificar sin necesidad de refinanciar, para darle flexibilidad a
// Nico").
//
// La refinanciación es la herramienta para renegociar una deuda: toma todo
// lo que se debe y lo vuelve a armar. Para "esta cuota de septiembre iba a
// ser de 1.000 y quedamos en 1.200" es un mazazo -- deja las viejas
// marcadas, arranca una numeración nueva y le cambia el plan al cliente por
// un ajuste de un renglón.
//
// Pero un monto se puede tocar solo mientras no haya pasado NADA con esa
// cuota. En cuanto entró un peso, o venció, o se le aplicó un índice, el
// monto dejó de ser un número editable y pasó a ser parte de una cuenta que
// ya está hecha. De ahí la lista de condiciones de abajo: no son trabas
// defensivas, cada una tapa una forma concreta de romper la contabilidad.

export interface CuotaEditable {
  numero: number
  montoBase: number
  montoAjustado: number
  saldoPendiente: number
  fechaVencimiento: string
  refinanciada: boolean
  migrada: boolean
  // Hay un ajuste de índice aplicado al mes de esta cuota.
  tieneAjustePorIndice: boolean
  // Tiene plata imputada (un pago, o mora cobrada).
  tienePlataImputada: boolean
  // Hay un pago del cliente apuntando a esta cuota esperando confirmación.
  tieneComprobantePendiente: boolean
}

export type MotivoNoEditable =
  | 'refinanciada'
  | 'migrada'
  | 'vencida'
  | 'cobrada'
  | 'comprobante'
  | 'indexada'

const EXPLICACIONES: Record<MotivoNoEditable, string> = {
  refinanciada:
    'Se refinanció: su deuda ya pasó a las cuotas del plan nuevo. Cambiarle el monto no cambiaría lo que el cliente debe.',
  migrada:
    'Está marcada como cobrada antes de usar la plataforma. Su monto es un dato histórico de lo que ya se pagó.',
  vencida:
    'Ya venció. El cliente pudo haberla visto en su portal con este monto, y si está en mora el interés se viene calculando sobre él.',
  cobrada:
    'Ya tiene plata imputada. Cambiarle el monto dejaría el pago apuntando a una cuota que nunca existió con ese número.',
  comprobante:
    'El cliente subió un comprobante para esta cuota y está esperando confirmación. Primero resolvé ese pago.',
  indexada:
    'Tiene un ajuste por índice aplicado. Los ajustes se encadenan (cada mes se calcula sobre el anterior), así que cambiarle el monto a una desalinearía todas las que siguen. Deshacé la indexación de ese mes y después cambiala.',
}

export function explicacionDeNoEditable(motivo: MotivoNoEditable): string {
  return EXPLICACIONES[motivo]
}

// Devuelve por qué NO se puede editar, o null si sí se puede. El orden
// importa: se devuelve el motivo más de fondo primero, que es el que le
// sirve a la persona. A una cuota refinanciada Y vencida no tiene sentido
// contestarle "está vencida".
export function porQueNoSePuedeEditarElMonto(
  cuota: CuotaEditable,
  hoy: string
): MotivoNoEditable | null {
  if (cuota.refinanciada) return 'refinanciada'
  if (cuota.migrada) return 'migrada'
  if (cuota.tienePlataImputada) return 'cobrada'
  // Un saldo distinto del monto es plata que entró por algún lado. La
  // comprobación de imputaciones de arriba tendría que alcanzar; esta es el
  // cinturón además de los tirantes, porque el saldo también se toca desde
  // "saldar lote" y desde correcciones de pagos.
  if (cuota.saldoPendiente !== cuota.montoAjustado) return 'cobrada'
  if (cuota.tieneComprobantePendiente) return 'comprobante'
  if (cuota.tieneAjustePorIndice || cuota.montoAjustado !== cuota.montoBase) return 'indexada'
  if (cuota.fechaVencimiento < hoy) return 'vencida'
  return null
}

export function sePuedeEditarElMonto(cuota: CuotaEditable, hoy: string): boolean {
  return porQueNoSePuedeEditarElMonto(cuota, hoy) === null
}

export interface MontoNuevoInvalido {
  numero: number
  motivo: string
}

// Valida los montos que llegaron del formulario. Devuelve los cambios que
// hay que aplicar y los que están mal, por separado: se corta antes de
// escribir nada si hay alguno mal, para no dejar media tanda aplicada.
export function leerMontosNuevos(
  entradas: { numero: number; montoTexto: string }[],
  cuotasEditables: Map<number, CuotaEditable>
): { cambios: { numero: number; montoNuevo: number }[]; errores: MontoNuevoInvalido[] } {
  const cambios: { numero: number; montoNuevo: number }[] = []
  const errores: MontoNuevoInvalido[] = []

  for (const entrada of entradas) {
    const texto = entrada.montoTexto.trim()
    // Vacío = "esta no la toco". Es lo que permite mandar la lista entera
    // habiendo cambiado una sola.
    if (texto === '') continue

    const cuota = cuotasEditables.get(entrada.numero)
    if (!cuota) {
      errores.push({ numero: entrada.numero, motivo: 'ya no se puede editar' })
      continue
    }

    const monto = Number(texto)
    if (!Number.isFinite(monto)) {
      errores.push({ numero: entrada.numero, motivo: 'no es un número' })
      continue
    }
    if (monto <= 0) {
      errores.push({ numero: entrada.numero, motivo: 'tiene que ser mayor que cero' })
      continue
    }
    // Dos decimales: son pesos y dólares, no hay medio centavo.
    const redondeado = Math.round(monto * 100) / 100
    if (redondeado !== monto) {
      errores.push({ numero: entrada.numero, motivo: 'como mucho dos decimales' })
      continue
    }
    if (redondeado === cuota.montoAjustado) continue

    cambios.push({ numero: entrada.numero, montoNuevo: redondeado })
  }

  return { cambios, errores }
}
