'use client'

import { usePathname } from 'next/navigation'
import { logout } from '@/app/login/actions'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'

function BotonCerrarSesion() {
  return (
    <form action={logout}>
      <BotonEnvio
        className="text-sm font-medium text-blue-900/70 underline-offset-4 hover:text-blue-900 hover:underline cursor-pointer"
        cargandoTexto="Cerrando sesión…"
      >
        Cerrar sesión
      </BotonEnvio>
    </form>
  )
}

// PR3 del rediseño (ver design-system/rediseno/PLAN.md, MOCKUP 2): la
// pantalla raíz (/portal-cliente) ahora trae su propia barra de logo+nav+
// logout metida DENTRO de la banda verde del saludo -- no tiene sentido
// arriba de eso esta barra blanca vieja también. El resto de las pantallas
// del portal (detalle de lote, pagar, mi perfil, subir comprobante) no
// entraron en el alcance de este PR y siguen exactamente como antes.
export default function PortalClienteLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname === '/portal-cliente') {
    return <div className="min-h-full">{children}</div>
  }

  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-blue-100 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <EnlaceBoton href="/portal-cliente" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="SIMACOR" className="h-9 w-auto" />
          </EnlaceBoton>
          {/* Sin "Mi perfil" (06/09, pedido de Gabriel): el cliente no
              edita sus propios datos -- nombre, teléfono y domicilio los
              mantiene la inmobiliaria. El staff sí tiene su /mi-perfil. */}
          <nav className="flex items-center gap-4">
            <BotonCerrarSesion />
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
