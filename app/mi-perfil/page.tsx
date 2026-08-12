import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { actualizarNombre, actualizarDatosTransferencia } from './actions'
import { NavAdmin } from '@/components/NavAdmin'

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
    .select('full_name, role, alias, banco, cbu, titular')
    .eq('id', user!.id)
    .single()

  if (!perfil) {
    redirect('/login')
  }

  if (perfil!.role === 'cliente') {
    redirect('/portal-cliente')
  }

  return (
    <>
      {['administrador', 'acreedor', 'vendedor', 'cobrador'].includes(perfil!.role) && (
        <NavAdmin role={perfil!.role} />
      )}
      <main className="mx-auto mt-12 max-w-md p-6">
      <h1 className="mb-6 text-xl font-semibold">Mi perfil</h1>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      {ok && <p className="mb-4 rounded bg-green-100 p-2 text-sm text-green-700">Guardado.</p>}

      <h2 className="mb-2 text-lg font-semibold">Nombre completo</h2>
      <form action={actualizarNombre} className="mb-8 flex gap-3">
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

      <h2 className="mb-2 text-lg font-semibold">Datos de transferencia</h2>
      <p className="mb-3 text-sm text-gray-600">
        Así los va a ver el cliente para corroborar antes de transferir. El titular tiene que ser
        el nombre tal cual figura en la cuenta bancaria de destino (puede no coincidir con tu
        nombre de arriba).
      </p>
      <form action={actualizarDatosTransferencia} className="flex flex-col gap-3">
        <label className="text-sm">
          Titular de la cuenta
          <input
            name="titular"
            defaultValue={perfil!.titular ?? ''}
            required
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Alias
          <input
            name="alias"
            defaultValue={perfil!.alias ?? ''}
            required
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Banco
          <input
            name="banco"
            defaultValue={perfil!.banco ?? ''}
            required
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          CBU (opcional)
          <input
            name="cbu"
            defaultValue={perfil!.cbu ?? ''}
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
          Guardar
        </button>
      </form>
      </main>
    </>
  )
}
