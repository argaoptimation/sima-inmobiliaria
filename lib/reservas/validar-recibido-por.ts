export interface RecibidoPor {
  recibidoPor: string | null
  recibidoPorOtro: string | null
}

export function tieneRecibidoPorValido(datos: RecibidoPor): boolean {
  return Boolean(datos.recibidoPor) || Boolean(datos.recibidoPorOtro?.trim())
}
