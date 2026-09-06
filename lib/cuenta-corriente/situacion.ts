import type { MovimientoParaSaldo } from './calcular-saldo'

// Las tres cifras que resumen a una persona del staff, por moneda.
//
// El saldo solo (positivo/negativo) no alcanza para leer de un vistazo qué
// pasó: dos personas con saldo 0 pueden ser "nunca movió nada" y "cobró
// 5.000 y le correspondían 5.000". Separar las dos mitades muestra el
// volumen además del neto.
export interface SituacionCuenta {
  // Su parte de la distribución, de cuotas que YA se cobraron (los Debe).
  leCorresponde: number
  // Plata que le entró directo porque la cuota se cobró en su cuenta (los
  // Haber: transferencias de la empresa y cobros directos del cliente).
  cobroDirecto: number
  // leCorresponde − cobroDirecto.
  saldo: number
}

export function resumirCuentaCorrientePorMoneda(
  movimientos: MovimientoParaSaldo[]
): Record<string, SituacionCuenta> {
  const porMoneda: Record<string, SituacionCuenta> = {}

  for (const movimiento of movimientos) {
    const actual = (porMoneda[movimiento.moneda] ??= {
      leCorresponde: 0,
      cobroDirecto: 0,
      saldo: 0,
    })

    if (movimiento.tipo === 'debe') {
      actual.leCorresponde += movimiento.monto
    } else {
      actual.cobroDirecto += movimiento.monto
    }
  }

  for (const situacion of Object.values(porMoneda)) {
    // Redondeo al final, no en cada suma: acumular decimales redondeados
    // arrastra error cuando hay muchos movimientos.
    situacion.leCorresponde = Math.round(situacion.leCorresponde * 100) / 100
    situacion.cobroDirecto = Math.round(situacion.cobroDirecto * 100) / 100
    situacion.saldo = Math.round((situacion.leCorresponde - situacion.cobroDirecto) * 100) / 100
  }

  return porMoneda
}

// Qué hacer con esta persona, en castellano.
//
// El signo solo es ambiguo (06/09: Gabriel lo leyó al revés, y él es quien
// más entiende el negocio). Peor todavía porque la pantalla tiene dos
// lectores: Nicolás mirando a todos, y cada vendedor/acreedor mirando la
// suya. Un "−800" significa cosas opuestas según quién lo lea, así que la
// columna dice la acción en vez de pedir que alguien interprete un número.
export function describirSituacion(saldo: number, moneda: string): string {
  if (saldo > 0) return `Hay que darle ${saldo} ${moneda}`
  if (saldo < 0) return `Tiene ${Math.abs(saldo)} ${moneda} de más`

  return 'Al día'
}
