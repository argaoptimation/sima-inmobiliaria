import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { actualizarNombreCliente } from './actions'

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
    .select('full_name, role')
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

      <h2 className="mb-2 text-lg font-semibold">Nombre completo</h2>
      <form action={actualizarNombreCliente} className="mb-8 flex gap-3">
        <input
          name="fullName"
          defaultValue={perfil!.full_name}
          required
          className="flex-1 rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-black px-3 py-2 text-sm text-white">
          Guardar
        </button>
      </form>

      <h2 className="mb-2 text-lg font-semibold">Contraseña</h2>
      <a href="/set-password" className="text-sm underline">
        Cambiar contraseña
      </a>
    </main>
  )
}
