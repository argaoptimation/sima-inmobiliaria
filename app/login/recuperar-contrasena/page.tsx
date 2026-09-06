import { solicitarRecuperacion } from './actions'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import CampoCaptcha from '@/components/CampoCaptcha'
import { obtenerSiteKeyTurnstile } from '@/lib/seguridad/turnstile'
import { ENTRADA, BOTON_PRIMARIO, ENLACE, BANNER_ERROR, BANNER_OK } from '@/lib/ui/clases'

export default async function RecuperarContrasenaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>
}) {
  const { error, ok } = await searchParams
  const siteKeyCaptcha = obtenerSiteKeyTurnstile()

  return (
    <main className="flex min-h-[100dvh] w-full">
      {/* Lado Izquierdo: Video / Banner */}
      <div className="relative hidden w-1/2 flex-col bg-blue-950 md:flex">
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
            {/* <img> plano, no next/image -- el optimizador de next/image
                (sharp) achata la transparencia de este logo a blanco sólido
                al reescalarlo (bug reproducido 03/09, mismo archivo se ve
                perfecto servido directo). El resto de la app ya usa <img>
                para este logo (NavAdmin, portal cliente) sin problema. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="SIMACOR" className="h-[42px] w-auto brightness-0 invert" />
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
                {/* eslint-disable-next-line @next/next/no-img-element -- ver comentario arriba */}
                <img src="/logo.png" alt="SIMACOR" className="h-9 w-auto" />
              </div>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-blue-950">Recuperar contraseña</h1>
            <p className="text-sm font-medium text-slate-500">Te enviaremos un link para restablecerla</p>
          </div>

          {error && <p className={`mb-6 ${BANNER_ERROR}`}>{error}</p>}

          {ok ? (
            <div className="flex flex-col gap-4">
              <p className={BANNER_OK}>
                Si ese email tiene una cuenta en SIMACOR, te va a llegar un mail con un link para elegir
                una contraseña nueva.
              </p>
              <EnlaceBoton
                href="/login"
                className={`block text-center lg:text-left mt-2 ${ENLACE}`}
              >
                ← Volver a ingresar
              </EnlaceBoton>
            </div>
          ) : (
            <form action={solicitarRecuperacion} className="flex flex-col gap-4">
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

              <CampoCaptcha siteKey={siteKeyCaptcha} />

              <BotonEnvio className={`mt-2 w-full cursor-pointer justify-center !py-3 text-base ${BOTON_PRIMARIO}`}>
                Enviar link de recuperación
              </BotonEnvio>
            </form>
          )}

          {!ok && (
            <div className="mt-6 border-t border-slate-200 pt-6 text-center lg:text-left">
              <EnlaceBoton
                href="/login"
                className={ENLACE}
              >
                ← Volver a ingresar
              </EnlaceBoton>
            </div>
          )}
        </div>
        
        <p className="mt-12 text-center text-xs font-medium text-slate-400">
          SIMACOR Inmobiliaria · Sistema de Gestión
        </p>
      </div>
    </main>
  )
}
