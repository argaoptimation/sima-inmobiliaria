export type EstadoCobranza = 'normal' | 'atrasado' | 'moroso' | 'prejudicial'

export interface CuotaEstado {
  saldoPendiente: number
  fechaVencimiento: string
}

// 4 niveles por cantidad exacta de cuotas vencidas (0/1/2/3+), alineado con
// las 4 plantillas de WhatsApp que definió Nicolás (28/08) y con los tramos
// que ya usaba /admin/panel-morosos de forma independiente. "prejudicial"
// acá es la señal automática ("posible prejudicial" en la UI) -- la marca
// oficial de Prejudicial sigue siendo 100% manual (lotes.marcado_prejudicial).
export function calcularEstadoCobranza(cuotas: CuotaEstado[], hoy: string): EstadoCobranza {
  const vencidas = cuotasVencidas(cuotas, hoy).length

  if (vencidas === 0) return 'normal'
  if (vencidas === 1) return 'atrasado'
  if (vencidas === 2) return 'moroso'
  return 'prejudicial'
}

// Extraído de calcularEstadoCobranza para que los llamadores (páginas que
// arman el mensaje de WhatsApp) puedan listar los meses adeudados sin
// duplicar el filtro de "vencida" acá.
export function cuotasVencidas(cuotas: CuotaEstado[], hoy: string): CuotaEstado[] {
  return cuotas
    .filter((cuota) => cuota.saldoPendiente > 0 && cuota.fechaVencimiento < hoy)
    .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento))
}
