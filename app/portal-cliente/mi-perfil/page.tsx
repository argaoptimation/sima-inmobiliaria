import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { actualizarMisDatosCliente } from './actions'
import { CampoTelefono, AyudaTelefono } from '@/components/CampoTelefono'

export default async function MiPerfilClientePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>
}) {
  const { error, ok } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: perfil } = await supabase
    .from('profiles')
    .select('full_name, role, dni, domicilio, telefono_prefijo, telefono_numero')
    .eq('id', user!.id)
    .single()

  if (!perfil || perfil.role !== 'cliente') {
    redirect('/mi-perfil')
  }

  return (
    <div className="mx-auto max-w-md px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-blue-900">Mi perfil</h1>
        <a
          href="/portal-cliente"
          className="text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
        >
          ← Volver a tus lotes
        </a>
      </div>
      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {ok && <p className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">Guardado.</p>}

      <div className="mb-6 rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-blue-900">Mis datos</h2>
        <form action={actualizarMisDatosCliente} className="flex flex-col gap-4">
          <label className="text-sm font-medium text-slate-700">
            Nombre completo
            <input
              name="fullName"
              defaultValue={perfil!.full_name}
              required
              className="mt-1 block w-full rounded-lg border border-blue-100 px-3 py-2 text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            DNI
            <input
              name="dni"
              defaultValue={perfil!.dni ?? ''}
              className="mt-1 block w-full rounded-lg border border-blue-100 px-3 py-2 text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Domicilio
            <input
              name="domicilio"
              defaultValue={perfil!.domicilio ?? ''}
              className="mt-1 block w-full rounded-lg border border-blue-100 px-3 py-2 text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Teléfono (para WhatsApp)
            <CampoTelefono
              prefijoGuardado={perfil!.telefono_prefijo}
              numeroGuardado={perfil!.telefono_numero}
            />
            <AyudaTelefono />
          </label>
          <button
            type="submit"
            className="self-start rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-900 cursor-pointer"
          >
            Guardar datos
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
        <h2 className="mb-2 text-lg font-bold text-blue-900">Contraseña</h2>
        <a
          href="/set-password"
          className="text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
        >
          Cambiar contraseña
        </a>
      </div>
    </div>
  )
}
