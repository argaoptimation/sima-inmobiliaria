export const MAX_ARCHIVO_BYTES = 15 * 1024 * 1024

export function excedeTamanioMaximo(archivo: File): boolean {
  return archivo.size > MAX_ARCHIVO_BYTES
}
