export function NavAdmin() {
  return (
    <nav className="flex gap-4 border-b p-4 text-sm">
      <a href="/admin/lotes">Lotes</a>
      <a href="/admin/pagos">Pagos</a>
      <a href="/admin/usuarios">Usuarios</a>
      <a href="/mi-perfil">Mi perfil</a>
    </nav>
  )
}
