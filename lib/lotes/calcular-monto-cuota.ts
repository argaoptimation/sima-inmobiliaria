export function calcularMontoCuota(precioTotal: number, cantidadCuotas: number): number {
  return Math.round((precioTotal / cantidadCuotas) * 100) / 100
}
