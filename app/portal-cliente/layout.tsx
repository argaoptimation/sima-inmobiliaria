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

export default function PortalClienteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-blue-100 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <EnlaceBoton href="/portal-cliente" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="SIMA" className="h-9 w-auto" />
          </EnlaceBoton>
          <nav className="flex items-center gap-4">
            <EnlaceBoton
              href="/portal-cliente/mi-perfil"
              className="text-sm font-medium text-blue-900/70 underline-offset-4 hover:text-blue-900 hover:underline"
            >
              Mi perfil
            </EnlaceBoton>
            <BotonCerrarSesion />
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
