import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { actualizarMiPerfil } from './actions'

export default async function MiPerfilPage({
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
    .select('full_name, role, datos_transferencia')
    .eq('id', user!.id)
    .single()

  if (!perfil) {
    redirect('/login')
  }

  if (perfil!.role === 'cliente') {
    redirect('/portal-cliente')
  }

  return (
    <main className="mx-auto mt-12 max-w-md p-6">
      <h1 className="mb-6 text-xl font-semibold">Mi perfil</h1>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      {ok && <p className="mb-4 rounded bg-green-100 p-2 text-sm text-green-700">Guardado.</p>}
      <form action={actualizarMiPerfil} className="flex flex-col gap-3">
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
          Datos de transferencia (alias, CBU, banco)
          <textarea
            name="datosTransferencia"
            defaultValue={perfil!.datos_transferencia ?? ''}
            rows={3}
            placeholder="Alias, CBU, banco..."
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
          Guardar
        </button>
      </form>
    </main>
  )
}
