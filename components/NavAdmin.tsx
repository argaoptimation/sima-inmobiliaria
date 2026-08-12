import { logout } from '@/app/login/actions'

export function NavAdmin({ role }: { role: string }) {
  const puedeVerPagosYUsuarios = role === 'administrador' || role === 'acreedor'

  return (
    <nav className="flex items-center justify-between border-b p-4 text-sm">
      <div className="flex gap-4">
        <a href="/admin/lotes">Lotes</a>
        {puedeVerPagosYUsuarios && <a href="/admin/pagos">Pagos</a>}
        {puedeVerPagosYUsuarios && <a href="/admin/usuarios">Usuarios</a>}
        <a href="/mi-perfil">Mi perfil</a>
      </div>
      <form action={logout}>
        <button type="submit" className="underline">
          Cerrar sesión
        </button>
      </form>
    </nav>
  )
}
