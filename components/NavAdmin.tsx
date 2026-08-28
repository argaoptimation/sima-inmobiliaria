import { logout } from '@/app/login/actions'
import { EnlaceBoton } from './EnlaceBoton'
import { BotonEnvio } from './BotonEnvio'

const ENLACE_CLASE =
  'whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-medium text-blue-100/80 transition-all duration-150 hover:-translate-y-px hover:bg-white/10 hover:text-white'

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
    <nav className="bg-gradient-to-r from-blue-950 via-blue-900 to-blue-950 shadow-lg shadow-blue-900/30">
      <div className="flex items-center justify-between gap-4 px-6 py-3">
        <div className="flex flex-wrap items-center gap-1">
          <EnlaceBoton href="/admin/lotes" className={ENLACE_CLASE}>
            Lotes
          </EnlaceBoton>
          {esAdministrador && (
            <EnlaceBoton href="/admin/loteos" className={ENLACE_CLASE}>
              Loteos
            </EnlaceBoton>
          )}
          {puedeVerPagosYUsuarios && (
            <EnlaceBoton href="/admin/pagos" className={ENLACE_CLASE}>
              Pagos
              {pagosPendientes > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-xs font-bold text-amber-950 shadow-sm">
                  {pagosPendientes}
                </span>
              )}
            </EnlaceBoton>
          )}
          {puedeVerPagosYUsuarios && (
            <EnlaceBoton href="/admin/usuarios" className={ENLACE_CLASE}>
              Usuarios
            </EnlaceBoton>
          )}
          {esAdministrador && (
            <EnlaceBoton href="/admin/clientes" className={ENLACE_CLASE}>
              Clientes
            </EnlaceBoton>
          )}
          {esAdministrador && (
            <EnlaceBoton href="/admin/panel-morosos" className={ENLACE_CLASE}>
              Panel de Morosos
            </EnlaceBoton>
          )}
          {esAdministrador && (
            <EnlaceBoton href="/admin/cuentas-externas" className={ENLACE_CLASE}>
              Cuentas externas
            </EnlaceBoton>
          )}
          {esAdministrador && (
            <EnlaceBoton href="/admin/cuentas-corrientes" className={ENLACE_CLASE}>
              Cuentas corrientes
            </EnlaceBoton>
          )}
          {tieneCuentaPropia && (
            <EnlaceBoton href={`/admin/cuentas-corrientes/${userId}`} className={ENLACE_CLASE}>
              Mi cuenta corriente
            </EnlaceBoton>
          )}
          {puedeVerIndices && (
            <EnlaceBoton href="/admin/historial-lotes" className={ENLACE_CLASE}>
              Historial
            </EnlaceBoton>
          )}
          {puedeVerIndices && (
            <EnlaceBoton href="/admin/indices" className={ENLACE_CLASE}>
              Índices
            </EnlaceBoton>
          )}
          {puedeVerEfectivoYCaja && (
            <EnlaceBoton href="/admin/efectivo" className={ENLACE_CLASE}>
              Efectivo
            </EnlaceBoton>
          )}
          {puedeVerEfectivoYCaja && (
            <EnlaceBoton href="/admin/cierre-caja" className={ENLACE_CLASE}>
              Cierre de caja
            </EnlaceBoton>
          )}
          <EnlaceBoton href="/mi-perfil" className={ENLACE_CLASE}>
            Mi perfil
          </EnlaceBoton>
        </div>
        <form action={logout} className="shrink-0">
          <BotonEnvio
            className="cursor-pointer whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-medium text-blue-100/80 transition-all duration-150 hover:-translate-y-px hover:bg-white/10 hover:text-white"
            cargandoTexto="Cerrando sesión…"
          >
            Cerrar sesión
          </BotonEnvio>
        </form>
      </div>
    </nav>
  )
}
