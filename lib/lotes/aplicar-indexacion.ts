export interface CuotaIndexable {
  id: string
  saldoPendiente: number
  fechaVencimiento: string
}

export interface AjusteResultado {
  cuotaId: string
  saldoPendienteNuevo: number
}

export function calcularAjusteIndexacion(
  porcentaje: number,
  fechaDesde: string,
  cuotas: CuotaIndexable[]
): AjusteResultado[] {
  return cuotas
    .filter((cuota) => cuota.saldoPendiente > 0 && cuota.fechaVencimiento >= fechaDesde)
    .map((cuota) => ({
      cuotaId: cuota.id,
      saldoPendienteNuevo: Math.round(cuota.saldoPendiente * (1 + porcentaje / 100) * 100) / 100,
    }))
}
