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
export function NavAdmin({
  role,
  pagosPendientes,
  userId,
  nombreUsuario,
}: {
  role: string
  pagosPendientes: number
  userId: string
  nombreUsuario: string
}) {
  const pathname = usePathname()

  const puedeVerPagosYUsuarios = role === 'administrador' || role === 'acreedor'
  const esAdministrador = role === 'administrador'
  const tieneCuentaPropia = role === 'acreedor' || role === 'vendedor' || role === 'cobrador'
  const puedeVerIndices = role === 'administrador' || role === 'cobrador'
  const puedeVerEfectivoYCaja = role === 'administrador' || role === 'cobrador'

  const inicioHref = esAdministrador ? '/admin/inicio' : '/admin/lotes'

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
        ...(puedeVerPagosYUsuarios
          ? [{ href: '/admin/pagos', etiqueta: 'Pagos', icono: Banknote, badge: pagosPendientes }]
          : []),
        ...(esAdministrador
          ? [{ href: '/admin/panel-morosos', etiqueta: 'Panel de morosos', icono: TriangleAlert }]
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
        ...(puedeVerPagosYUsuarios ? [{ href: '/admin/usuarios', etiqueta: 'Usuarios', icono: UserCog }] : []),
        ...(puedeVerIndices ? [{ href: '/admin/historial-lotes', etiqueta: 'Historial', icono: FileClock }] : []),
      ],
    },
  ]

  function esActivo(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <nav className="flex h-full w-[248px] shrink-0 flex-col bg-[var(--sima-sidebar)]">
      <div className="flex items-center gap-[11px] px-5 pt-[22px] pb-5">
        <div className={SIDEBAR_LOGO}>
          {/* eslint-disable-next-line @next/next/no-img-element -- mismo patrón que app/portal-cliente/layout.tsx: sin width/height fijo no se puede usar next/image sin arriesgar estirar el logo */}
          <img src="/logo.png" alt="SIMA" className="block h-6 w-auto" />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pt-1.5 pb-3">
        <div className="flex flex-col gap-0.5">
          <EnlaceBoton
            href={inicioHref}
            className={esActivo(inicioHref) ? SIDEBAR_ITEM_ACTIVO : SIDEBAR_ITEM}
            claseInterna="flex w-full items-center gap-[11px]"
          >
            {esActivo(inicioHref) && (
              <span className="absolute top-[9px] bottom-[9px] left-0 w-[3px] rounded-r-[3px] bg-[#60a5fa]" />
            )}
            <LayoutDashboard className="h-[17px] w-[17px] shrink-0" />
            Inicio
          </EnlaceBoton>
        </div>

        {grupos
          .filter((grupo) => grupo.items.length > 0)
          .map((grupo) => (
            <div key={grupo.titulo} className="flex flex-col gap-0.5">
              <div className={SIDEBAR_GRUPO_TITULO}>{grupo.titulo}</div>
              {grupo.items.map((item) => {
                const activo = esActivo(item.href)
                return (
                  <EnlaceBoton
                    key={item.href}
                    href={item.href}
                    className={activo ? SIDEBAR_ITEM_ACTIVO : SIDEBAR_ITEM}
                    claseInterna="flex w-full items-center gap-[11px]"
                  >
                    {activo && (
                      <span className="absolute top-[9px] bottom-[9px] left-0 w-[3px] rounded-r-[3px] bg-[#60a5fa]" />
                    )}
                    <item.icono className="h-[17px] w-[17px] shrink-0" />
                    {item.etiqueta}
                    {!!item.badge && item.badge > 0 && <span className={SIDEBAR_BADGE}>{item.badge}</span>}
                  </EnlaceBoton>
                )
              })}
            </div>
          ))}
      </div>

      <div className={SIDEBAR_USUARIO}>
        <div className={SIDEBAR_AVATAR}>{inicialesDeNombre(nombreUsuario)}</div>
        <div className="flex min-w-0 flex-col gap-px">
          <span className="truncate text-[13px] font-semibold text-white">{nombreUsuario}</span>
          <span className="text-[11.5px] text-white/[0.72]">{NOMBRE_ROL[role] ?? role}</span>
        </div>
        <form action={logout} className="ml-auto shrink-0">
          <BotonEnvio className="cursor-pointer text-white/[0.45] transition-colors hover:text-white" cargandoTexto="…">
            <LogOut className="h-4 w-4" />
          </BotonEnvio>
        </form>
      </div>
    </nav>
  )
}
