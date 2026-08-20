import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { actualizarMisDatosCliente } from './actions'
import { PREFIJOS_TELEFONO } from '@/lib/telefono/prefijos'

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
    .select('full_name, role, dni, domicilio, telefono')
    .eq('id', user!.id)
    .single()

  if (!perfil || perfil.role !== 'cliente') {
    redirect('/mi-perfil')
  }

  return (
    <main className="mx-auto mt-12 max-w-md p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Mi perfil</h1>
        <a href="/portal-cliente" className="text-sm underline">
          ← Volver a tus lotes
        </a>
      </div>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      {ok && <p className="mb-4 rounded bg-green-100 p-2 text-sm text-green-700">Guardado.</p>}

      <h2 className="mb-2 text-lg font-semibold">Mis datos</h2>
      <form action={actualizarMisDatosCliente} className="mb-8 flex flex-col gap-3">
        <label className="text-sm">
          Nombre completo
          <input
            name="fullName"
            defaultValue={perfil!.full_name}
            required
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          DNI
          <input
            name="dni"
            defaultValue={perfil!.dni ?? ''}
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Domicilio
          <input
            name="domicilio"
            defaultValue={perfil!.domicilio ?? ''}
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Teléfono (para WhatsApp)
          <div className="mt-1 flex gap-2">
            <select
              name="prefijo"
              defaultValue=""
              className="rounded border px-2 py-2 text-sm"
              aria-label="Prefijo de país"
            >
              {PREFIJOS_TELEFONO.map((prefijo) => (
                <option key={`${prefijo.codigo}-${prefijo.nombre}`} value={prefijo.codigo}>
                  {prefijo.bandera} {prefijo.nombre}
                  {prefijo.codigo ? ` (+${prefijo.codigo})` : ''}
                </option>
              ))}
            </select>
            <input
              name="telefonoLocal"
              placeholder="9351234567"
              defaultValue={perfil!.telefono ?? ''}
              className="flex-1 rounded border px-3 py-2 placeholder:text-gray-400"
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Elegí tu país y escribí tu número con el 9 adelante (celular), sin el 0 del código de
            área.
          </p>
        </label>
        <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
          Guardar datos
        </button>
      </form>

      <h2 className="mb-2 text-lg font-semibold">Contraseña</h2>
      <a href="/set-password" className="text-sm underline">
        Cambiar contraseña
      </a>
    </main>
  )
}
