// "Cuota 3 de 24", y despues de refinanciar, "Cuota 25 — 2 de 20 del plan
// refinanciado" (10/09, pedido de Gabriel; opcion A de las dos que le pase).
//
// De donde sale el problema: al refinanciar, las cuotas nuevas continuan la
// numeracion en vez de arrancar de cero. Un lote de 24 cuotas donde el
// cliente pago hasta la 10 y refinancio el resto en 20 pasa a tener las
// cuotas 25 a 44 -- y el recibo siguiente dice "Cuota N° 25", que al lado
// de la 10 que acaba de pagar no significa nada.
//
// Las cuotas viejas NO se borran: quedan marcadas "Refinanció" con saldo 0
// porque son la historia de lo que el cliente debia y de lo que pago. Por
// eso los numeros no se pueden reusar, y por eso hace falta esto.
//
// La regla: se muestran las dos cosas. El numero de la plataforma, para que
// coincida con Pagos, con la cuenta corriente y con el Excel del acreedor;
// y la posicion dentro del plan que el cliente esta pagando hoy, que es lo
// que el cliente entiende. En un lote que nunca se refinancio son lo mismo
// y solo se muestra "3 de 24".

export interface CuotaConPlan {
  numero: number
  plan: number
}

export interface PosicionEnElPlan {
  // El numero corrido de la plataforma: 25.
  numero: number
  plan: number
  // Que lugar ocupa adentro de su plan: 2.
  posicion: number
  // Cuantas cuotas tiene ese plan: 20.
  totalDelPlan: number
  esDeUnPlanRefinanciado: boolean
  // "3 de 24" | "2 de 20 del plan refinanciado"
  textoCorto: string
  // "Cuota 3 de 24" | "Cuota 25 — 2 de 20 del plan refinanciado"
  textoLargo: string
}

// El plan 2 es "el plan refinanciado" a secas porque es, de lejos, el caso
// normal: una refinanciacion y listo. Del tercero en adelante hay que
// numerarlos o no se distinguen entre si.
export function nombreDelPlan(plan: number): string {
  return plan === 2 ? 'del plan refinanciado' : `del plan refinanciado N° ${plan - 1}`
}

// Todas las cuotas de un lote (de un mismo ciclo), resueltas de una.
// Devuelve un mapa por numero de cuota: las pantallas dibujan tablas de
// cuotas y necesitan la etiqueta de cada fila sin recorrer la lista entera
// una vez por fila.
export function posicionesDelPlan(
  cuotasDelCiclo: CuotaConPlan[]
): Map<number, PosicionEnElPlan> {
  const porPlan = new Map<number, CuotaConPlan[]>()
  for (const cuota of cuotasDelCiclo) {
    const lista = porPlan.get(cuota.plan) ?? []
    lista.push(cuota)
    porPlan.set(cuota.plan, lista)
  }

  const resultado = new Map<number, PosicionEnElPlan>()

  for (const [plan, cuotasDelPlan] of porPlan) {
    const ordenadas = [...cuotasDelPlan].sort((a, b) => a.numero - b.numero)
    const totalDelPlan = ordenadas.length
    const esDeUnPlanRefinanciado = plan > 1

    ordenadas.forEach((cuota, indice) => {
      const posicion = indice + 1
      const textoCorto = esDeUnPlanRefinanciado
        ? `${posicion} de ${totalDelPlan} ${nombreDelPlan(plan)}`
        : `${posicion} de ${totalDelPlan}`
      const textoLargo = esDeUnPlanRefinanciado
        ? `Cuota ${cuota.numero} — ${textoCorto}`
        : `Cuota ${textoCorto}`

      resultado.set(cuota.numero, {
        numero: cuota.numero,
        plan,
        posicion,
        totalDelPlan,
        esDeUnPlanRefinanciado,
        textoCorto,
        textoLargo,
      })
    })
  }

  return resultado
}

// Una sola cuota, para los lugares que muestran una (el recibo de un pago
// que imputa a una cuota, por ejemplo). Devuelve null si esa cuota no esta
// en la lista: es mejor no decir nada que decir "3 de 24" de memoria.
export function posicionEnElPlan(
  numero: number,
  cuotasDelCiclo: CuotaConPlan[]
): PosicionEnElPlan | null {
  return posicionesDelPlan(cuotasDelCiclo).get(numero) ?? null
}

// Lo que hay que aclarar en un recibo que cubre una o varias cuotas:
// "2 de 20 del plan refinanciado", o "2 y 3 de 20 del plan refinanciado".
//
// Devuelve null cuando no hay nada que aclarar -- en un lote que nunca se
// refinancio el numero de cuota del recibo YA es la posicion en el plan --
// y tambien cuando el pago tocaria cuotas de dos planes distintos, que no
// deberia pasar (las viejas quedan en cero al refinanciar). Un recibo es un
// papel que el cliente guarda: preferimos que falte un dato a que diga uno
// que no cierra.
export function textoDelPlanEnUnRecibo(
  posiciones: (PosicionEnElPlan | null)[]
): string | null {
  if (posiciones.length === 0) return null
  if (posiciones.some((posicion) => posicion === null)) return null

  const reales = posiciones as PosicionEnElPlan[]
  if (!reales.every((posicion) => posicion.esDeUnPlanRefinanciado)) return null
  if (new Set(reales.map((posicion) => posicion.plan)).size > 1) return null

  const primera = reales[0]
  if (reales.length === 1) return primera.textoCorto

  const numeros = [...reales].sort((a, b) => a.posicion - b.posicion).map((p) => p.posicion)
  const listado = `${numeros.slice(0, -1).join(', ')} y ${numeros[numeros.length - 1]}`
  return `${listado} de ${primera.totalDelPlan} ${nombreDelPlan(primera.plan)}`
}
