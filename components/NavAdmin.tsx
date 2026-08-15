import { logout } from '@/app/login/actions'

export function NavAdmin({ role, pagosPendientes }: { role: string; pagosPendientes: number }) {
  const puedeVerPagosYUsuarios = role === 'administrador' || role === 'acreedor'
  const esAdministrador = role === 'administrador'

  return (
    <nav className="flex items-center justify-between border-b p-4 text-sm">
      <div className="flex gap-4">
        <a href="/admin/lotes">Lotes</a>
        {puedeVerPagosYUsuarios && (
          <a href="/admin/pagos">Pagos{pagosPendientes > 0 ? ` (${pagosPendientes})` : ''}</a>
        )}
        {puedeVerPagosYUsuarios && <a href="/admin/usuarios">Usuarios</a>}
        {esAdministrador && <a href="/admin/clientes">Clientes</a>}
        {esAdministrador && <a href="/admin/cuentas-externas">Cuentas externas</a>}
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
