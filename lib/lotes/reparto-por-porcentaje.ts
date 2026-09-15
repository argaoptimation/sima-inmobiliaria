// Cuánto le toca a cada integrante de un lote, en porcentaje (15/09, pedido
// de Gabriel: "el acreedor debería cobrar un 85%, admin un 10 y vendedor/es
// el restante [...] esa comisión es la que también se debe distribuir en la
// vida del lote").
//
// El porcentaje no reparte nada por sí solo: sirve para llenar de una vez el
// reparto de las cuotas que todavía no se cobraron, y ese reparto (en plata,
// cuota por cuota) es lo que se guarda y lo que genera el Debe en la cuenta
// corriente. Después se puede retocar una cuota a mano como siempre.

export interface PorcentajeDeIntegrante {
  participanteKey: string
  porcentaje: number
}

const redondear = (valor: number) => Math.round(valor * 100) / 100

// Lo que se tipeó en el campo, si es un porcentaje usable (0 a 100). Vacío o
// inválido: null, que es "sin porcentaje", no un cero.
export function leerPorcentaje(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.')
  if (limpio === '') return null
  const valor = Number(limpio)
  if (!Number.isFinite(valor) || valor < 0 || valor > 100) return null
  return redondear(valor)
}

export function sumaDePorcentajes(porcentajes: PorcentajeDeIntegrante[]): number {
  return redondear(porcentajes.reduce((acumulado, fila) => acumulado + fila.porcentaje, 0))
}

export type EstadoDeLaSuma = 'sin_porcentajes' | 'completa' | 'falta' | 'sobra'

export function estadoDeLaSuma(suma: number): EstadoDeLaSuma {
  if (suma === 0) return 'sin_porcentajes'
  if (suma === 100) return 'completa'
  return suma < 100 ? 'falta' : 'sobra'
}

export function leToca(total: number, porcentaje: number): number {
  return redondear((total * porcentaje) / 100)
}

// Reparte una cuota según los porcentajes, al centavo. Redondear cada parte
// por separado puede dejar la suma un centavo arriba o abajo del monto (tres
// partes de 33,33% de 100 dan 99,99): los centavos que sobran van a las
// partes con el decimal más grande, así la cuota queda "Repartida completa"
// cuando los porcentajes suman 100.
export function repartirCuota(
  monto: number,
  porcentajes: PorcentajeDeIntegrante[]
): { participanteKey: string; monto: string }[] {
  const conPorcentaje = porcentajes.filter((fila) => fila.porcentaje > 0)
  if (conPorcentaje.length === 0) return []

  const centavosDeLaCuota = Math.round(monto * 100)
  const exactos = conPorcentaje.map((fila) => (centavosDeLaCuota * fila.porcentaje) / 100)
  const partes = exactos.map((exacto) => Math.floor(exacto + 1e-9))
  const objetivo = Math.round((centavosDeLaCuota * sumaDePorcentajes(conPorcentaje)) / 100)
  let sobrantes = objetivo - partes.reduce((acumulado, parte) => acumulado + parte, 0)

  const porDecimal = exactos
    .map((exacto, indice) => ({ indice, decimal: exacto - partes[indice] }))
    .sort((a, b) => b.decimal - a.decimal || a.indice - b.indice)

  for (const { indice } of porDecimal) {
    if (sobrantes <= 0) break
    partes[indice] += 1
    sobrantes -= 1
  }

  return conPorcentaje.map((fila, indice) => ({
    participanteKey: fila.participanteKey,
    monto: String(partes[indice] / 100),
  }))
}

// Si el reparto que ya tiene una cuota es el mismo que le darían los
// porcentajes. Sirve para avisar qué cuotas cargadas a mano se van a pisar.
export function repartoCoincide(
  filas: { participanteKey: string; monto: string }[],
  esperado: { participanteKey: string; monto: string }[]
): boolean {
  const centavosPorClave = (lista: { participanteKey: string; monto: string }[]) => {
    const mapa = new Map<string, number>()
    for (const fila of lista) {
      const monto = Number(fila.monto)
      if (!fila.participanteKey || fila.monto.trim() === '' || !Number.isFinite(monto)) continue
      const centavos = Math.round(monto * 100)
      mapa.set(fila.participanteKey, (mapa.get(fila.participanteKey) ?? 0) + centavos)
    }
    for (const [clave, centavos] of mapa) if (centavos === 0) mapa.delete(clave)
    return mapa
  }

  const actual = centavosPorClave(filas)
  const buscado = centavosPorClave(esperado)
  if (actual.size !== buscado.size) return false
  for (const [clave, centavos] of buscado) {
    if (actual.get(clave) !== centavos) return false
  }
  return true
}
