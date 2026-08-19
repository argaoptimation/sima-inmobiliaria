export function convertirUsdAPesos(montoUsd: number, cotizacion: number): number {
  return Math.round(montoUsd * cotizacion * 100) / 100
}
