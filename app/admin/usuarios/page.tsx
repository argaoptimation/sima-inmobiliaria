import { createClient } from '@/lib/supabase/server'
import { crearUsuarioStaff, actualizarUsuarioStaff } from './actions'

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; editar?: string }>
}) {
  const { error, editar } = await searchParams
  const supabase = await createClient()
  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name, role, datos_transferencia')
    .in('role', ['administrador', 'acreedor', 'vendedor', 'cobrador'])
    .order('role')

  return (
    <main className="max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">Usuarios de staff</h1>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      <form action={crearUsuarioStaff} className="mb-8 flex flex-col gap-3">
        <input
          name="fullName"
          placeholder="Nombre completo"
          required
          className="rounded border px-3 py-2"
        />
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="rounded border px-3 py-2"
        />
        <select name="role" required className="rounded border px-3 py-2">
          <option value="acreedor">Acreedor</option>
          <option value="vendedor">Vendedor</option>
          <option value="cobrador">Cobrador</option>
        </select>
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Invitar
        </button>
      </form>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Nombre</th>
            <th>Rol</th>
            <th>Datos de transferencia</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {staff?.map((persona) => {
            const actualizarConId = actualizarUsuarioStaff.bind(null, persona.id)

            if (editar === persona.id) {
              return (
                <tr key={persona.id} className="border-b">
                  <td colSpan={4} className="py-3">
                    <form action={actualizarConId} className="flex flex-col gap-2">
                      <input
                        name="fullName"
                        defaultValue={persona.full_name}
                        required
                        className="rounded border px-3 py-2"
                      />
                      <textarea
                        name="datosTransferencia"
                        defaultValue={persona.datos_transferencia ?? ''}
                        placeholder="Alias, CBU, banco..."
                        rows={2}
                        className="rounded border px-3 py-2"
                      />
                      <button
                        type="submit"
                        className="self-start rounded bg-black px-3 py-2 text-white"
                      >
                        Guardar
                      </button>
                    </form>
                  </td>
                </tr>
              )
            }

            return (
              <tr key={persona.id} className="border-b">
                <td className="py-2">{persona.full_name}</td>
                <td>{persona.role}</td>
                <td>
                  {persona.datos_transferencia?.trim() ? (
                    persona.datos_transferencia
                  ) : (
                    <span className="text-amber-700">Sin datos de transferencia</span>
                  )}
                </td>
                <td>
                  <a href={`/admin/usuarios?editar=${persona.id}`} className="underline">
                    Editar
                  </a>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </main>
  )
}
