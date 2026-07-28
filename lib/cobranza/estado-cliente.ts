export type EstadoCobranza = 'normal' | 'moroso' | 'prejudicial'

export interface CuotaEstado {
  saldoPendiente: number
  fechaVencimiento: string
}

export function calcularEstadoCobranza(cuotas: CuotaEstado[], hoy: string): EstadoCobranza {
  const vencidas = cuotas.filter(
    (cuota) => cuota.saldoPendiente > 0 && cuota.fechaVencimiento < hoy
  ).length

  if (vencidas === 0) return 'normal'
  if (vencidas <= 2) return 'moroso'
  return 'prejudicial'
}
