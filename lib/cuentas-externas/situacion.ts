import {
  resumirCuentaCorrientePorMoneda,
  type SituacionCuenta,
} from '@/lib/cuenta-corriente/situacion'
import type { MovimientoParaSaldo } from './calcular-saldo'

export type { SituacionCuenta }

// Las mismas tres cifras que para una persona, pero para una cuenta externa.
//
// Una cuenta externa y la cuenta corriente de una persona son lo mismo -- una
// cuenta corriente con alguien -- y la única diferencia real es que la externa
// no tiene login (06/09, Gabriel). Los dos vocabularios también son el mismo
// con otro nombre:
//
//   débito  = le debemos nosotros    = debe  = "le corresponde"
//   crédito = le entró plata a ella  = haber = "cobró directo"
//
// Traducir acá y reusar el cálculo de la cuenta corriente evita que las dos
// pantallas se vayan separando con el tiempo, que es lo que ya había pasado.
export function resumirCuentaExternaPorMoneda(
  movimientos: MovimientoParaSaldo[]
): Record<string, SituacionCuenta> {
  return resumirCuentaCorrientePorMoneda(
    movimientos.map((movimiento) => ({
      tipo: movimiento.tipo === 'debito' ? ('debe' as const) : ('haber' as const),
      monto: movimiento.monto,
      moneda: movimiento.moneda,
    }))
  )
}
