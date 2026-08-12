export interface LoteAImportar {
  identificador: string
  ubicacion: string
  precioTotal: number
  moneda: 'USD' | 'ARS'
  cantidadCuotas: number
  montoCuotaBase: number
  fechaPrimeraCuota: string
}

export function parsearLoteImportado(fila: string[], numeroFila: number): LoteAImportar | string {
  const [
    identificador,
    ubicacion,
    precioTotalTexto,
    moneda,
    cantidadCuotasTexto,
    montoCuotaBaseTexto,
    fechaPrimeraCuota,
  ] = fila.map((celda) => celda?.trim() ?? '')

  if (!identificador) return `Fila ${numeroFila}: falta el identificador`
  if (!ubicacion) return `Fila ${numeroFila}: falta la ubicación`

  const precioTotal = Number(precioTotalTexto)
  if (!precioTotalTexto || !Number.isFinite(precioTotal) || precioTotal <= 0) {
    return `Fila ${numeroFila}: precio total inválido ("${precioTotalTexto}")`
  }

  if (moneda !== 'USD' && moneda !== 'ARS') {
    return `Fila ${numeroFila}: la moneda tiene que ser USD o ARS ("${moneda}")`
  }

  const cantidadCuotas = Number(cantidadCuotasTexto)
  if (!cantidadCuotasTexto || !Number.isInteger(cantidadCuotas) || cantidadCuotas <= 0) {
    return `Fila ${numeroFila}: cantidad de cuotas inválida ("${cantidadCuotasTexto}")`
  }

  const montoCuotaBase = Number(montoCuotaBaseTexto)
  if (!montoCuotaBaseTexto || !Number.isFinite(montoCuotaBase) || montoCuotaBase <= 0) {
    return `Fila ${numeroFila}: monto de cuota inválido ("${montoCuotaBaseTexto}")`
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaPrimeraCuota)) {
    return `Fila ${numeroFila}: fecha inválida, tiene que ser AAAA-MM-DD ("${fechaPrimeraCuota}")`
  }

  return {
    identificador,
    ubicacion,
    precioTotal,
    moneda,
    cantidadCuotas,
    montoCuotaBase,
    fechaPrimeraCuota,
  }
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
