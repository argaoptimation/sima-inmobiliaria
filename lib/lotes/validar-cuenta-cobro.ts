export function tieneDatosTransferencia(datosTransferencia: string | null): boolean {
  return Boolean(datosTransferencia && datosTransferencia.trim().length > 0)
}
