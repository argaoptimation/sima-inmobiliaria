export const MAX_ARCHIVO_MB = 15
export const MAX_ARCHIVO_BYTES = MAX_ARCHIVO_MB * 1024 * 1024

export function excedeTamanioMaximo(archivo: File): boolean {
  return archivo.size > MAX_ARCHIVO_BYTES
}
