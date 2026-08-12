export function vendedorIdAlReservar(rolQuienReserva: string, userId: string): string | null {
  return rolQuienReserva === 'vendedor' ? userId : null
}
