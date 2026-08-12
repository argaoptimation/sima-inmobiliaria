export function NavAdmin({ role }: { role: string }) {
  const puedeVerPagosYUsuarios = role === 'administrador' || role === 'acreedor'

  return (
    <nav className="flex gap-4 border-b p-4 text-sm">
      <a href="/admin/lotes">Lotes</a>
      {puedeVerPagosYUsuarios && <a href="/admin/pagos">Pagos</a>}
      {puedeVerPagosYUsuarios && <a href="/admin/usuarios">Usuarios</a>}
      <a href="/mi-perfil">Mi perfil</a>
    </nav>
  )
}
