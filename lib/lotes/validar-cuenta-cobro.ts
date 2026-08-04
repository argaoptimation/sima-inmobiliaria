export interface DatosTransferencia {
  alias: string | null
  banco: string | null
  titular: string | null
}

export function tieneDatosTransferencia(datos: DatosTransferencia): boolean {
  return Boolean(datos.alias?.trim() && datos.banco?.trim() && datos.titular?.trim())
}
