import { describe, it, expect } from 'vitest'
import {
  posicionEnElPlan,
  posicionesDelPlan,
  textoDelPlanEnUnRecibo,
  type CuotaConPlan,
} from './plan-de-cuotas'

// Un plan original de `cantidad` cuotas, numeradas desde 1.
function planOriginal(cantidad: number): CuotaConPlan[] {
  return Array.from({ length: cantidad }, (_, i) => ({ numero: i + 1, plan: 1 }))
}

// Cuotas de una refinanciacion: continuan la numeracion desde `desde`.
function planRefinanciado(desde: number, cantidad: number, plan: number): CuotaConPlan[] {
  return Array.from({ length: cantidad }, (_, i) => ({ numero: desde + i, plan }))
}

describe('un lote que nunca se refinanció', () => {
  const cuotas = planOriginal(24)

  it('dice el número de cuota y cuántas son en total', () => {
    expect(posicionEnElPlan(3, cuotas)).toMatchObject({
      posicion: 3,
      totalDelPlan: 24,
      esDeUnPlanRefinanciado: false,
      textoCorto: '3 de 24',
      textoLargo: 'Cuota 3 de 24',
    })
  })

  it('no nombra ningún plan: no hay más que uno', () => {
    expect(posicionEnElPlan(24, cuotas)!.textoLargo).toBe('Cuota 24 de 24')
  })
})

describe('el caso que preguntó Gabriel: pagó hasta la 10 de 24 y refinanció', () => {
  // Las 24 originales quedan (las 11 a 24 marcadas "refinanció", con saldo
  // 0) y entran 20 cuotas nuevas numeradas de la 25 a la 44.
  const cuotas = [...planOriginal(24), ...planRefinanciado(25, 20, 2)]

  it('la primera cuota del plan nuevo es la 25, y es la 1 de 20', () => {
    expect(posicionEnElPlan(25, cuotas)).toMatchObject({
      numero: 25,
      posicion: 1,
      totalDelPlan: 20,
      esDeUnPlanRefinanciado: true,
      textoLargo: 'Cuota 25 — 1 de 20 del plan refinanciado',
    })
  })

  it('la segunda dice exactamente "2 de 20 del plan refinanciado"', () => {
    expect(posicionEnElPlan(26, cuotas)!.textoCorto).toBe('2 de 20 del plan refinanciado')
  })

  it('las cuotas que el cliente ya pagó siguen diciendo lo de siempre', () => {
    // Esto es lo que hace que el historial no se rompa: un recibo viejo
    // reimpreso hoy tiene que decir lo mismo que decía el día que se emitió.
    expect(posicionEnElPlan(10, cuotas)!.textoLargo).toBe('Cuota 10 de 24')
  })

  it('la última del plan nuevo es la 44 y cierra en 20 de 20', () => {
    expect(posicionEnElPlan(44, cuotas)!.textoLargo).toBe(
      'Cuota 44 — 20 de 20 del plan refinanciado'
    )
  })
})

describe('dos refinanciaciones seguidas', () => {
  const cuotas = [
    ...planOriginal(12),
    ...planRefinanciado(13, 6, 2),
    ...planRefinanciado(19, 4, 3),
  ]

  it('el tercer plan se numera para poder distinguirlo del segundo', () => {
    expect(posicionEnElPlan(20, cuotas)!.textoLargo).toBe(
      'Cuota 20 — 2 de 4 del plan refinanciado N° 2'
    )
  })

  it('el segundo plan sigue diciendo lo mismo que decía antes', () => {
    expect(posicionEnElPlan(14, cuotas)!.textoCorto).toBe('2 de 6 del plan refinanciado')
  })
})

describe('casos de borde', () => {
  it('una cuota que no está en la lista no inventa una posición', () => {
    // Pasa de verdad: una cuota de otro ciclo (lote rescindido y vuelto a
    // vender). Mejor no decir nada que decir "3 de 24" de memoria.
    expect(posicionEnElPlan(99, planOriginal(24))).toBeNull()
  })

  it('sin cuotas devuelve un mapa vacío en vez de romperse', () => {
    expect(posicionesDelPlan([]).size).toBe(0)
  })

  it('la posición sale del orden por número, no del orden en que vinieron', () => {
    // La consulta puede devolverlas en cualquier orden.
    const desordenadas: CuotaConPlan[] = [
      { numero: 27, plan: 2 },
      { numero: 25, plan: 2 },
      { numero: 26, plan: 2 },
    ]
    expect(posicionEnElPlan(25, desordenadas)!.posicion).toBe(1)
    expect(posicionEnElPlan(27, desordenadas)!.posicion).toBe(3)
  })

  it('un plan de una sola cuota dice "1 de 1"', () => {
    const cuotas = [...planOriginal(6), ...planRefinanciado(7, 1, 2)]
    expect(posicionEnElPlan(7, cuotas)!.textoLargo).toBe('Cuota 7 — 1 de 1 del plan refinanciado')
  })
})

describe('lo que se aclara en un recibo', () => {
  const cuotas = [...planOriginal(24), ...planRefinanciado(25, 20, 2)]
  const posicion = (numero: number) => posicionEnElPlan(numero, cuotas)

  it('un pago de una sola cuota del plan refinanciado', () => {
    expect(textoDelPlanEnUnRecibo([posicion(26)])).toBe('2 de 20 del plan refinanciado')
  })

  it('un pago que cubre dos cuotas las lista con "y"', () => {
    expect(textoDelPlanEnUnRecibo([posicion(26), posicion(27)])).toBe(
      '2 y 3 de 20 del plan refinanciado'
    )
  })

  it('tres o más se separan con comas y la última con "y"', () => {
    expect(textoDelPlanEnUnRecibo([posicion(25), posicion(26), posicion(27)])).toBe(
      '1, 2 y 3 de 20 del plan refinanciado'
    )
  })

  it('el orden lo pone la posición, no el orden en que vinieron las imputaciones', () => {
    expect(textoDelPlanEnUnRecibo([posicion(27), posicion(25), posicion(26)])).toBe(
      '1, 2 y 3 de 20 del plan refinanciado'
    )
  })

  it('en un lote sin refinanciar no aclara nada: el número ya es la posición', () => {
    expect(textoDelPlanEnUnRecibo([posicion(3)])).toBeNull()
  })

  it('un pago que mezclara planes no dice nada, en vez de decir algo que no cierra', () => {
    // No debería pasar (las viejas quedan en cero al refinanciar), pero un
    // recibo es un papel que el cliente guarda.
    expect(textoDelPlanEnUnRecibo([posicion(10), posicion(26)])).toBeNull()
  })

  it('si alguna cuota no se pudo ubicar, no inventa', () => {
    expect(textoDelPlanEnUnRecibo([posicion(26), null])).toBeNull()
  })

  it('un pago sin cuotas imputadas (una seña) no aclara nada', () => {
    expect(textoDelPlanEnUnRecibo([])).toBeNull()
  })
})
