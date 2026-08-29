import Image from 'next/image'
import { login } from './actions'
import { CampoPassword } from '@/components/CampoPassword'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import { ENTRADA, BOTON_PRIMARIO, ENLACE, BANNER_ERROR } from '@/lib/ui/clases'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="flex min-h-[100dvh] w-full">
      {/* Lado Izquierdo: Video / Banner */}
      <div className="relative hidden w-1/2 flex-col bg-blue-950 md:flex">
        {/* Video de fondo en loop (si existe en public/, se cargará; sino queda el fondo azul) */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover opacity-60"
        >
          <source src="/video_login.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-blue-900/40 mix-blend-multiply" />
        
        <div className="relative z-10 flex h-full flex-col justify-between p-12 text-white">
          <div>
            <Image src="/logo.png" alt="SIMA" width={120} height={42} className="brightness-0 invert object-contain" priority />
          </div>
          <div className="max-w-md">
            <h2 className="mb-4 text-4xl font-extrabold tracking-tight">Gestión inmobiliaria inteligente.</h2>
            <p className="text-lg font-medium text-blue-100/70">
              Administrá tus loteos, hacé seguimiento de cobranzas y controlá el estado de cuenta de tus clientes en un solo lugar.
            </p>
          </div>
        </div>
      </div>

      {/* Lado Derecho: Formulario */}
      <div className="flex w-full flex-col items-center justify-center bg-slate-50 p-4 sm:p-6 lg:w-1/2">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex flex-col gap-1 text-center lg:text-left">
            <div className="mb-2 flex justify-center lg:hidden">
              <div className="flex items-center justify-center rounded-xl bg-white p-2.5 shadow-sm border border-slate-100">
                <Image src="/logo.png" alt="SIMA" width={110} height={38} className="h-9 w-auto object-contain" priority />
              </div>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-blue-950">Ingresar a SIMA</h1>
            <p className="text-sm font-medium text-slate-500">Completá tus datos para acceder a tu cuenta.</p>
          </div>

          {error && <p className={`mb-6 ${BANNER_ERROR}`}>{error}</p>}

          <form action={login} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              Correo electrónico
              <input
                name="email"
                type="email"
                placeholder="tu@email.com"
                required
                autoComplete="email"
                className={ENTRADA}
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              Contraseña
              <CampoPassword name="password" placeholder="••••••••" required autoComplete="current-password" />
            </label>

            <BotonEnvio className={`mt-2 w-full cursor-pointer justify-center !py-3 text-base ${BOTON_PRIMARIO}`}>
              Ingresar
            </BotonEnvio>
          </form>

          <div className="mt-6 border-t border-slate-200 pt-6 text-center lg:text-left">
            <EnlaceBoton
              href="/login/recuperar-contrasena"
              className={ENLACE}
            >
              ¿Olvidaste tu contraseña?
            </EnlaceBoton>
          </div>
        </div>
        
        <p className="mt-12 text-center text-xs font-medium text-slate-400">
          SIMA Inmobiliaria · Sistema de Gestión
        </p>
      </div>
    </main>
  )
}
