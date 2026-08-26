import { logout } from '@/app/login/actions'

export function NavAdmin({
  role,
  pagosPendientes,
  userId,
}: {
  role: string
  pagosPendientes: number
  userId: string
}) {
  const puedeVerPagosYUsuarios = role === 'administrador' || role === 'acreedor'
  const esAdministrador = role === 'administrador'
  // Acreedor/vendedor/cobrador ahora pueden ver su propia cuenta corriente
  // en modo lectura (26/08) -- antes esa pantalla era admin-only y no
  // tenían ninguna forma de consultar sus propias liquidaciones.
  const tieneCuentaPropia = role === 'acreedor' || role === 'vendedor' || role === 'cobrador'
  // Índices: según Nicolás, además del admin puede cargarlos/corregirlos
  // un cobrador (ej. el contador) -- ver lib/auth/require-admin.ts.
  const puedeVerIndices = role === 'administrador' || role === 'cobrador'
  // Efectivo/caja: el cobrador (ej. Belén) carga los pagos en efectivo e
  // imprime la caja, según Nicolás -- ver Notas_Decisiones_SIMA.txt punto
  // 14/22.
  const puedeVerEfectivoYCaja = role === 'administrador' || role === 'cobrador'

  return (
    <nav className="flex items-center justify-between border-b p-4 text-sm">
      <div className="flex gap-4">
        <a href="/admin/lotes">Lotes</a>
        {esAdministrador && <a href="/admin/loteos">Loteos</a>}
        {puedeVerPagosYUsuarios && (
          <a href="/admin/pagos">Pagos{pagosPendientes > 0 ? ` (${pagosPendientes})` : ''}</a>
        )}
        {puedeVerPagosYUsuarios && <a href="/admin/usuarios">Usuarios</a>}
        {esAdministrador && <a href="/admin/clientes">Clientes</a>}
        {esAdministrador && <a href="/admin/cuentas-externas">Cuentas externas</a>}
        {esAdministrador && <a href="/admin/cuentas-corrientes">Cuentas corrientes</a>}
        {tieneCuentaPropia && <a href={`/admin/cuentas-corrientes/${userId}`}>Mi cuenta corriente</a>}
        {puedeVerIndices && <a href="/admin/historial-lotes">Historial</a>}
        {puedeVerIndices && <a href="/admin/indices">Índices</a>}
        {puedeVerEfectivoYCaja && <a href="/admin/efectivo">Efectivo</a>}
        {puedeVerEfectivoYCaja && <a href="/admin/cierre-caja">Cierre de caja</a>}
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
