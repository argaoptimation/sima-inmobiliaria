import type { SituacionCuenta } from './situacion'

// El resumen global de "cuánto tengo que girar hoy", que es la pregunta con
// la que Nico abre la pantalla todos los meses antes de ir al banco.
//
// LA DECISIÓN QUE IMPORTA: los saldos NO se netean entre personas. Si a
// Fulano hay que darle 800 y Mengano tiene 300 de más, el total a girar es
// 800, no 500. La plata de más de Mengano no paga a Fulano: son dos cuentas
// distintas con dos personas distintas, y una se arregla girando y la otra
// descontando de lo próximo que le toque. Un neto de 500 haría creer que
// alcanza con eso, y no alcanza.
//
// Por eso se devuelven las dos cifras por separado, no una sola.
export interface TotalesATransferir {
  // Suma de los saldos positivos: plata que hay que girar.
  aGirar: number
  // Suma de los saldos negativos, en positivo: plata cobrada de más que hay
  // que descontar de lo próximo.
  deMas: number
  // Cuánta gente compone cada lado, para poder decir "3 personas".
  cuantosEsperan: number
  cuantosTienenDeMas: number
}

export interface PersonaConSituacion {
  porMoneda: Record<string, SituacionCuenta>
}

export function totalesATransferirPorMoneda(
  personas: PersonaConSituacion[]
): Record<string, TotalesATransferir> {
  const porMoneda: Record<string, TotalesATransferir> = {}

  for (const persona of personas) {
    for (const [moneda, situacion] of Object.entries(persona.porMoneda)) {
      const actual = (porMoneda[moneda] ??= {
        aGirar: 0,
        deMas: 0,
        cuantosEsperan: 0,
        cuantosTienenDeMas: 0,
      })

      if (situacion.saldo > 0) {
        actual.aGirar += situacion.saldo
        actual.cuantosEsperan += 1
      } else if (situacion.saldo < 0) {
        actual.deMas += Math.abs(situacion.saldo)
        actual.cuantosTienenDeMas += 1
      }
      // saldo 0 no suma a ninguno de los dos lados, pero la moneda igual
      // aparece en el resultado: que exista con ceros dice "acá no hay nada
      // pendiente", que es distinto de que la moneda no figure.
    }
  }

  for (const totales of Object.values(porMoneda)) {
    totales.aGirar = Math.round(totales.aGirar * 100) / 100
    totales.deMas = Math.round(totales.deMas * 100) / 100
  }

  return porMoneda
}

// Las monedas que hay que mostrar, siempre en el mismo orden: primero USD y
// ARS (las dos del sistema) y después cualquier otra, alfabética. Sin esto
// el orden lo decide el orden de inserción del Record y cambia entre cargas.
export function monedasOrdenadas(porMoneda: Record<string, unknown>): string[] {
  const PRIORIDAD = ['USD', 'ARS']
  return Object.keys(porMoneda).sort((a, b) => {
    const pa = PRIORIDAD.indexOf(a)
    const pb = PRIORIDAD.indexOf(b)
    if (pa !== -1 || pb !== -1) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb)
    return a.localeCompare(b)
  })
}
