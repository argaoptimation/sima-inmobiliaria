import { createClient } from '@/lib/supabase/server'
import { setPassword } from './actions'
import { CampoPassword } from '@/components/CampoPassword'
import { CampoTelefono, AyudaTelefono } from '@/components/CampoTelefono'
import { Obligatorio } from '@/components/Obligatorio'
import { BotonEnvio } from '@/components/BotonEnvio'
import { ENTRADA } from '@/lib/ui/clases'

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  // En este punto el usuario YA está autenticado (verifyOtp del link de
  // invitación creó la sesión, ver app/auth/confirm/route.ts), así que se
  // puede saber su rol y pedirle de una los datos que la plataforma
  // necesita sí o sí para funcionar.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: perfil } = user
    ? await supabase
        .from('profiles')
        .select('role, titular, alias, banco, cbu, telefono_prefijo, telefono_numero')
        .eq('id', user.id)
        .maybeSingle()
    : { data: null }

  // Staff = todos menos el cliente. Al cliente no se le piden datos
  // bancarios: él paga, no cobra (04/09, aclaración de Gabriel -- lo de
  // "no puedan modificar sus datos" era solo para el portal del cliente).
  const esStaff = Boolean(perfil) && perfil!.role !== 'cliente'

  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-6">
      <div className={`w-full rounded-xl border border-blue-100 bg-white p-8 shadow-sm ${esStaff ? 'max-w-md' : 'max-w-sm'}`}>
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          {/* <img> plano, no next/image -- el optimizador (sharp) achata la
              transparencia de este logo a blanco sólido al reescalarlo
              (bug reproducido 03/09). Además, forzar 64x64 en un logo
              horizontal (~3.5:1) lo deformaba -- h-16 w-auto lo respeta. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="SIMA" className="h-16 w-auto" />
          <h1 className="text-xl font-extrabold text-blue-900">
            {esStaff ? 'Completá tu cuenta' : 'Elegí tu contraseña'}
          </h1>
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}

        <form action={setPassword} className="flex flex-col gap-3">
          <label className="text-sm text-slate-600">
            Contraseña
            <Obligatorio />
            <span className="mt-1 mb-1 block text-xs text-slate-500">
              Mínimo 8 caracteres, incluyendo un signo (ej. ! ? . # -)
            </span>
            <CampoPassword
              name="password"
              placeholder="Nueva contraseña"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>

          {esStaff && (
            <>
              {/* Datos mínimos para que la plataforma funcione (04/09,
                  pedido de Gabriel). El alias es el caso crítico: si a
                  esta persona le toca cobrar una cuota y no tiene alias
                  cargado, el cliente que va a pagar no tiene a dónde
                  transferir. Pedirlos acá evita que queden vacíos para
                  siempre porque nadie se acordó de completarlos. */}
              <p className="mt-2 border-t border-slate-100 pt-4 text-sm text-slate-600">
                Estos datos son los que va a ver un cliente cuando le toque transferirte a vos, así
                que no pueden quedar vacíos.
              </p>

              <label className="text-sm text-slate-600">
                Teléfono
                <Obligatorio />
                <CampoTelefono
                  prefijoGuardado={perfil!.telefono_prefijo}
                  numeroGuardado={perfil!.telefono_numero}
                  requerido
                />
                <AyudaTelefono />
              </label>

              <label className="text-sm text-slate-600">
                Titular de la cuenta
                <Obligatorio />
                <input
                  name="titular"
                  defaultValue={perfil!.titular ?? ''}
                  required
                  className={`w-full ${ENTRADA}`}
                />
              </label>
              <label className="text-sm text-slate-600">
                Alias
                <Obligatorio />
                <input
                  name="alias"
                  defaultValue={perfil!.alias ?? ''}
                  required
                  className={`w-full ${ENTRADA}`}
                />
              </label>
              <label className="text-sm text-slate-600">
                Banco
                <Obligatorio />
                <input
                  name="banco"
                  defaultValue={perfil!.banco ?? ''}
                  required
                  className={`w-full ${ENTRADA}`}
                />
              </label>
              <label className="text-sm text-slate-600">
                CBU (opcional)
                <input name="cbu" defaultValue={perfil!.cbu ?? ''} className={`w-full ${ENTRADA}`} />
              </label>
            </>
          )}

          <BotonEnvio className="mt-1 cursor-pointer rounded-lg bg-blue-800 px-3 py-2 font-semibold text-white transition-colors hover:bg-blue-900">
            Guardar
          </BotonEnvio>
        </form>
      </div>
    </main>
  )
}
