'use client'

import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  MapPinned,
  Layers,
  Users,
  Banknote,
  TriangleAlert,
  Wallet,
  Calculator,
  BookOpen,
  Building2,
  TrendingUp,
  UserCog,
  FileClock,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  type LucideIcon,
} from 'lucide-react'
import { logout } from '@/app/login/actions'
import { BotonEnvio } from './BotonEnvio'
import { EnlaceBoton } from './EnlaceBoton'
import { SIDEBAR_ITEM, SIDEBAR_ITEM_ACTIVO, SIDEBAR_GRUPO_TITULO, SIDEBAR_LOGO, SIDEBAR_BADGE, SIDEBAR_USUARIO, SIDEBAR_AVATAR } from '@/lib/ui/clases'
import { inicialesDeNombre } from '@/lib/ui/iniciales'

interface ItemNav {
  href: string
  etiqueta: string
  icono: LucideIcon
  badge?: number
}

interface GrupoNav {
  titulo: string
  items: ItemNav[]
}

const NOMBRE_ROL: Record<string, string> = {
  administrador: 'Administrador',
  acreedor: 'Acreedor',
  vendedor: 'Vendedor',
  cobrador: 'Cobrador',
}

// Reemplaza la fila de 13 links de la vieja NavAdmin por una sidebar
// vertical agrupada (PR2 del rediseño, ver design-system/rediseno/PLAN.md
// y MOCKUP 1). La lógica de permisos por rol es EXACTAMENTE la misma que
// tenía la nav vieja -- lo único que cambia es la agrupación visual.
//
// 02/09 (pedido de Gabriel, "necesito que se pueda contraer la navbar de
// la izquierda, ya que sino en versión mobile no puedo visualizar bien la
// plataforma"): dos comportamientos nuevos, controlados por AdminShell
// (que es quien guarda el estado, para compartirlo con el botón hamburguesa
// de la topbar):
//   - Mobile (< md): la sidebar es un drawer superpuesto, oculto por
//     defecto (arranca cerrada en cada visita) -- antes ocupaba todo el
//     ancho fijo de 248px y tapaba el contenido por completo.
//   - Desktop (>= md): además del drawer, se puede colapsar a un riel
//     angosto de solo íconos (persistido en localStorage vía AdminShell).
export function NavAdmin({
  role,
  pagosPendientes,
  userId,
  nombreUsuario,
  colapsada,
  onToggleColapsar,
  abiertaMobile,
  onCerrarMobile,
}: {
  role: string
  pagosPendientes: number
  userId: string
  nombreUsuario: string
  colapsada: boolean
  onToggleColapsar: () => void
  abiertaMobile: boolean
  onCerrarMobile: () => void
}) {
  const pathname = usePathname()

  const esAdministrador = role === 'administrador'
  const esCobrador = role === 'cobrador'
  // Pagos y Panel de cuotas: cobrador ve todo lo que ve admin acá (confirmado
  // con Nico 03/09) -- Usuarios queda aparte, admin/acreedor solamente, no es
  // parte de "toda la info de lotes/cobranza" que se le confirmó a cobrador.
  const puedeVerPagos = esAdministrador || role === 'acreedor' || esCobrador
  const puedeVerUsuarios = esAdministrador || role === 'acreedor'
  const puedeVerPanelCuotas = esAdministrador || esCobrador
  const tieneCuentaPropia = role === 'acreedor' || role === 'vendedor' || esCobrador
  const puedeVerIndices = esAdministrador || esCobrador
  const puedeVerEfectivoYCaja = esAdministrador || esCobrador

  const inicioHref = esAdministrador ? '/admin/inicio' : '/admin/lotes'

  // Solo se aplica arriba de md (768px) -- en mobile el drawer siempre
  // muestra las etiquetas completas, sin importar si quedó "colapsada" de
  // una sesión de escritorio anterior.
  const claseOcultarEnColapsada = colapsada ? 'md:hidden' : ''

  const grupos: GrupoNav[] = [
    {
      titulo: 'Operación',
      items: [
        { href: '/admin/lotes', etiqueta: 'Lotes', icono: MapPinned },
        ...(esAdministrador ? [{ href: '/admin/loteos', etiqueta: 'Loteos', icono: Layers }] : []),
        ...(esAdministrador ? [{ href: '/admin/clientes', etiqueta: 'Clientes', icono: Users }] : []),
      ],
    },
    {
      titulo: 'Cobranza',
      items: [
        ...(puedeVerPagos
          ? [{ href: '/admin/pagos', etiqueta: 'Pagos', icono: Banknote, badge: pagosPendientes }]
          : []),
        ...(puedeVerPanelCuotas
          ? [{ href: '/admin/panel-morosos', etiqueta: 'Panel de cuotas', icono: TriangleAlert }]
          : []),
        ...(puedeVerEfectivoYCaja ? [{ href: '/admin/efectivo', etiqueta: 'Efectivo', icono: Wallet }] : []),
        ...(puedeVerEfectivoYCaja
          ? [{ href: '/admin/cierre-caja', etiqueta: 'Cierre de caja', icono: Calculator }]
          : []),
      ],
    },
    {
      titulo: 'Finanzas',
      items: [
        ...(esAdministrador
          ? [{ href: '/admin/cuentas-corrientes', etiqueta: 'Cuentas corrientes', icono: BookOpen }]
          : []),
        ...(tieneCuentaPropia
          ? [{ href: `/admin/cuentas-corrientes/${userId}`, etiqueta: 'Mi cuenta corriente', icono: BookOpen }]
          : []),
        ...(esAdministrador
          ? [{ href: '/admin/cuentas-externas', etiqueta: 'Cuentas externas', icono: Building2 }]
          : []),
        ...(puedeVerIndices ? [{ href: '/admin/indices', etiqueta: 'Índices', icono: TrendingUp }] : []),
      ],
    },
    {
      titulo: 'Sistema',
      items: [
        ...(puedeVerUsuarios ? [{ href: '/admin/usuarios', etiqueta: 'Usuarios', icono: UserCog }] : []),
        ...(puedeVerIndices ? [{ href: '/admin/historial-lotes', etiqueta: 'Historial', icono: FileClock }] : []),
      ],
    },
  ]

  function esActivo(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <>
      {abiertaMobile && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/50 md:hidden"
          onClick={onCerrarMobile}
          aria-hidden="true"
        />
      )}

      <nav
        className={`fixed inset-y-0 left-0 z-40 flex h-full w-[248px] shrink-0 flex-col bg-[var(--sima-sidebar)] transition-transform duration-200 md:relative md:z-auto md:translate-x-0 md:transition-[width] ${
          abiertaMobile ? 'translate-x-0' : '-translate-x-full'
        } ${colapsada ? 'md:w-[76px]' : 'md:w-[248px]'}`}
      >
        <div
          className={`flex items-center gap-[11px] px-5 pt-[22px] pb-5 justify-between ${
            colapsada ? 'md:justify-center md:px-3' : ''
          }`}
        >
          <div className={`${SIDEBAR_LOGO} ${claseOcultarEnColapsada}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- mismo patrón que app/portal-cliente/layout.tsx: sin width/height fijo no se puede usar next/image sin arriesgar estirar el logo */}
            <img src="/logo.png" alt="SIMA" className="block h-6 w-auto" />
          </div>
          <button
            type="button"
            onClick={onToggleColapsar}
            className="hidden shrink-0 rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white md:flex"
            title={colapsada ? 'Expandir menú' : 'Contraer menú'}
          >
            {colapsada ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
          </button>
          <button
            type="button"
            onClick={onCerrarMobile}
            className="shrink-0 rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white md:hidden"
            aria-label="Cerrar menú"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pt-1.5 pb-3">
          <div className="flex flex-col gap-0.5">
            <EnlaceBoton
              href={inicioHref}
              onClick={onCerrarMobile}
              className={esActivo(inicioHref) ? SIDEBAR_ITEM_ACTIVO : SIDEBAR_ITEM}
              claseInterna="flex w-full items-center gap-[11px]"
              title={colapsada ? 'Inicio' : undefined}
            >
              {esActivo(inicioHref) && (
                <span className="absolute top-[9px] bottom-[9px] left-0 w-[3px] rounded-r-[3px] bg-[#60a5fa]" />
              )}
              <LayoutDashboard className="h-[17px] w-[17px] shrink-0" />
              <span className={claseOcultarEnColapsada}>Inicio</span>
            </EnlaceBoton>
          </div>

          {grupos
            .filter((grupo) => grupo.items.length > 0)
            .map((grupo) => (
              <div key={grupo.titulo} className="flex flex-col gap-0.5">
                <div className={`${SIDEBAR_GRUPO_TITULO} ${claseOcultarEnColapsada}`}>{grupo.titulo}</div>
                {grupo.items.map((item) => {
                  const activo = esActivo(item.href)
                  return (
                    <EnlaceBoton
                      key={item.href}
                      href={item.href}
                      onClick={onCerrarMobile}
                      className={activo ? SIDEBAR_ITEM_ACTIVO : SIDEBAR_ITEM}
                      claseInterna="flex w-full items-center gap-[11px]"
                      title={colapsada ? item.etiqueta : undefined}
                    >
                      {activo && (
                        <span className="absolute top-[9px] bottom-[9px] left-0 w-[3px] rounded-r-[3px] bg-[#60a5fa]" />
                      )}
                      <item.icono className="h-[17px] w-[17px] shrink-0" />
                      <span className={claseOcultarEnColapsada}>{item.etiqueta}</span>
                      {!!item.badge && item.badge > 0 && (
                        <span className={`${SIDEBAR_BADGE} ${claseOcultarEnColapsada}`}>{item.badge}</span>
                      )}
                    </EnlaceBoton>
                  )
                })}
              </div>
            ))}
        </div>

        <div
          className={`${SIDEBAR_USUARIO} ${colapsada ? 'md:justify-center md:gap-2 md:px-2' : ''}`}
        >
          <div className={SIDEBAR_AVATAR}>{inicialesDeNombre(nombreUsuario)}</div>
          <div className={`flex min-w-0 flex-col gap-px ${claseOcultarEnColapsada}`}>
            <span className="truncate text-[13px] font-semibold text-white">{nombreUsuario}</span>
            <span className="text-[11.5px] text-white/[0.72]">{NOMBRE_ROL[role] ?? role}</span>
          </div>
          <form action={logout} className={`ml-auto shrink-0 ${colapsada ? 'md:ml-0' : ''}`}>
            <BotonEnvio className="cursor-pointer text-white/[0.45] transition-colors hover:text-white" cargandoTexto="…">
              <LogOut className="h-4 w-4" />
            </BotonEnvio>
          </form>
        </div>
      </nav>
    </>
  )
}
