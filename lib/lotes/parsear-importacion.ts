export interface LoteAImportar {
  identificador: string
  ubicacion: string
  precioTotal: number
  moneda: 'USD' | 'ARS'
  acreedorEmail: string
}

const REGEX_EMAIL = /^\S+@\S+\.\S+$/

export function parsearLoteImportado(fila: string[], numeroFila: number): LoteAImportar | string {
  const [identificador, ubicacion, precioTotalTexto, moneda, acreedorEmail] = fila.map(
    (celda) => celda?.trim() ?? ''
  )

  if (!identificador) return `Fila ${numeroFila}: falta el identificador`
  if (!ubicacion) return `Fila ${numeroFila}: falta la ubicación`

  const precioTotal = Number(precioTotalTexto)
  if (!precioTotalTexto || !Number.isFinite(precioTotal) || precioTotal <= 0) {
    return `Fila ${numeroFila}: precio total inválido ("${precioTotalTexto}")`
  }

  if (moneda !== 'USD' && moneda !== 'ARS') {
    return `Fila ${numeroFila}: la moneda tiene que ser USD o ARS ("${moneda}")`
  }

  if (!acreedorEmail || !REGEX_EMAIL.test(acreedorEmail)) {
    return `Fila ${numeroFila}: email de acreedor inválido ("${acreedorEmail}")`
  }

  return { identificador, ubicacion, precioTotal, moneda, acreedorEmail }
}

export function parsearTextoImportacion(
  texto: string
): { lotes: LoteAImportar[] } | { errores: string[] } {
  const lineas = texto
    .split(/\r?\n/)
    .map((linea) => linea.trim())
    .filter((linea) => linea.length > 0)

  if (lineas.length === 0) {
    return { errores: ['No pegaste ninguna fila'] }
  }

  const resultados = lineas.map((linea, indice) =>
    parsearLoteImportado(linea.split('\t'), indice + 1)
  )
  const errores = resultados.filter((resultado): resultado is string => typeof resultado === 'string')

  if (errores.length > 0) {
    return { errores }
  }

  return { lotes: resultados as LoteAImportar[] }
}
