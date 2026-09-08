import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cambiarMiContrasena } from './actions'
import { CampoPassword } from '@/components/CampoPassword'
import { Obligatorio } from '@/components/Obligatorio'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import {
  BOTON_PRIMARIO,
  ENLACE,
  TITULO_H1,
  BANNER_ERROR,
  BANNER_OK,
  TARJETA,
} from '@/lib/ui/clases'

// Única pantalla de "cuenta" que tiene el cliente. No es "Mi perfil": sus
// datos personales los sigue manteniendo la inmobiliaria (06/09). Acá solo
// cambia la contraseña, que es lo que necesita quien entró con una que le
// dictaron por teléfono.
export default async function ContrasenaClientePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>
}) {
  const { error, ok } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .maybeSingle()

  if (perfil?.role !== 'cliente') redirect('/')

  return (
    <main className="mx-auto max-w-md px-6 py-8">
      <EnlaceBoton href="/portal-cliente" className={`mb-4 inline-block ${ENLACE}`}>
        ← Volver a mis lotes
      </EnlaceBoton>
      <h1 className={`mb-2 ${TITULO_H1}`}>Cambiar mi contraseña</h1>
      <p className="mb-6 text-sm text-slate-600">
        Si entraste con una contraseña que te pasaron, conviene que la cambies por una tuya.
      </p>

      {ok && <p className={BANNER_OK}>{ok}</p>}
      {error && <p className={BANNER_ERROR}>{error}</p>}

      <form action={cambiarMiContrasena} className={`flex flex-col gap-4 ${TARJETA}`}>
        <label className="text-sm text-slate-600">
          Nueva contraseña
          <Obligatorio />
          <CampoPassword name="nuevaContrasena" placeholder="Tu contraseña nueva" autoComplete="new-password" required />
          <span className="mt-1 block text-xs text-slate-500">
            Al menos 8 caracteres, incluyendo un signo (ej. ! ? . # -).
          </span>
        </label>
        <label className="text-sm text-slate-600">
          Repetila
          <Obligatorio />
          <CampoPassword name="repetirContrasena" placeholder="Repetila" autoComplete="new-password" required />
        </label>
        <BotonEnvio className={`cursor-pointer self-start ${BOTON_PRIMARIO}`}>
          Guardar contraseña
        </BotonEnvio>
      </form>
    </main>
  )
}
