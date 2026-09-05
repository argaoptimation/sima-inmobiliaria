// Quién queda como "Admin" de un lote cuando nadie lo eligió a mano.
//
// Pedido de Gabriel (05/09): "admin siempre debería colocarse Nicolás.
// Podría dejarse libre, pero siempre debería quedar como predeterminado
// Nicolás". No se hardcodea el nombre: en la práctica hay un solo perfil
// con rol administrador (el de Nicolás), así que ese es el default. Si
// algún día hay más de uno, se cae al que está operando -- que es quien
// está creando el lote o editando el cobro -- y si ese no es admin, no se
// preselecciona nada y hay que elegirlo a mano.
export function resolverAdminPorDefecto({
  adminIdActual,
  administradores,
  usuarioActualId,
  usuarioActualEsAdministrador,
}: {
  adminIdActual: string | null
  administradores: { id: string }[]
  usuarioActualId: string | null
  usuarioActualEsAdministrador: boolean
}): string | null {
  if (adminIdActual) return adminIdActual
  if (administradores.length === 1) return administradores[0].id
  if (usuarioActualEsAdministrador && usuarioActualId) return usuarioActualId
  return null
}
