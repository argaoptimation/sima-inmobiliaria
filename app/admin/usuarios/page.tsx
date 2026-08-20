import { createClient } from '@/lib/supabase/server'
import { requireAdminOAcreedor } from '@/lib/auth/require-admin'
import {
  crearUsuarioStaff,
  actualizarNombreStaff,
  actualizarDatosTransferenciaStaff,
  eliminarUsuarioStaff,
} from './actions'
import { BotonEliminarUsuario } from './BotonEliminarUsuario'
import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; editar?: string; q?: string }>
}) {
  const { error, editar, q: filtroTexto } = await searchParams

  // Mismo criterio que /admin/pagos: vendedor y cobrador tienen acceso
  // acotado a /admin (solo lotes disponibles + reservar + su propio perfil).
  // La nav ya no les muestra el link "Usuarios", pero la URL escrita a mano
  // tiene que rebotar igual, no renderizar la pantalla.
  await requireAdminOAcreedor()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: perfilPropio } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  if (perfilPropio!.role !== 'administrador') {
    const { data: misLotes } = await supabase
      .from('lotes')
      .select('vendedor_id')
      .eq('acreedor_id', user!.id)
      .not('vendedor_id', 'is', null)

    const vendedorIds = [...new Set((misLotes ?? []).map((lote) => lote.vendedor_id as string))]

    const { data: vendedores } =
      vendedorIds.length > 0
        ? await supabase
            .from('profiles')
            .select('id, full_name, alias, banco, cbu, titular')
            .in('id', vendedorIds)
            .order('full_name')
        : { data: [] }

    return (
      <main className="max-w-2xl">
        <h1 className="mb-6 text-xl font-semibold">Usuarios de staff</h1>
        {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}

        <h2 className="mb-2 text-lg font-semibold">Vendedores de tus lotes</h2>
        {(vendedores ?? []).length === 0 ? (
          <p className="text-sm text-gray-600">
            Todavía no tenés ningún vendedor asociado a tus lotes.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Nombre</th>
                <th>Datos de transferencia</th>
              </tr>
            </thead>
            <tbody>
              {vendedores!.map((persona) => (
                <tr key={persona.id} className="border-b">
                  <td className="py-2">{persona.full_name}</td>
                  <td>
                    {tieneDatosTransferencia({
                      alias: persona.alias,
                      banco: persona.banco,
                      titular: persona.titular,
                    }) ? (
                      `${persona.titular} · ${persona.alias} · ${persona.banco}`
                    ) : (
                      <span className="text-amber-700">Sin datos de transferencia</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    )
  }

  let queryStaff = supabase
    .from('profiles')
    .select('id, full_name, role, email, alias, banco, cbu, titular')
    .in('role', ['administrador', 'acreedor', 'vendedor', 'cobrador'])
    .order('role')

  if (filtroTexto) {
    const textoSaneado = filtroTexto.replace(/[,()]/g, '')
    queryStaff = queryStaff.or(`full_name.ilike.%${textoSaneado}%,email.ilike.%${textoSaneado}%`)
  }

  const { data: staff } = await queryStaff

  return (
    <main className="max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">Usuarios de staff</h1>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}

      <form method="get" className="mb-4 flex items-end gap-3">
        <label className="text-sm">
          Buscar
          <input
            type="text"
            name="q"
            placeholder="Nombre o email"
            defaultValue={filtroTexto ?? ''}
            className="mt-1 block rounded border px-3 py-2"
          />
        </label>
        <button type="submit" className="rounded border px-3 py-2 text-sm">
          Filtrar
        </button>
        {filtroTexto && (
          <a href="/admin/usuarios" className="text-sm underline">
            Limpiar
          </a>
        )}
      </form>

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
      {(staff ?? []).length === 0 && filtroTexto ? (
        <p className="text-sm text-gray-600">Ningún usuario coincide con la búsqueda.</p>
      ) : (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Nombre</th>
            <th>Rol</th>
            <th>Email</th>
            <th>Datos de transferencia</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {staff?.map((persona) => {
            const actualizarNombreConId = actualizarNombreStaff.bind(null, persona.id)
            const actualizarDatosConId = actualizarDatosTransferenciaStaff.bind(null, persona.id)
            const eliminarUsuarioConId = eliminarUsuarioStaff.bind(null, persona.id)
            const tieneDatos = tieneDatosTransferencia({
              alias: persona.alias,
              banco: persona.banco,
              titular: persona.titular,
            })

            if (editar === persona.id) {
              return (
                <tr key={persona.id} className="border-b">
                  <td colSpan={5} className="py-3">
                    <form action={actualizarNombreConId} className="mb-3 flex gap-2">
                      <input
                        name="fullName"
                        defaultValue={persona.full_name}
                        required
                        className="flex-1 rounded border px-3 py-2"
                      />
                      <button
                        type="submit"
                        className="rounded bg-black px-3 py-2 text-sm text-white"
                      >
                        Guardar nombre
                      </button>
                    </form>
                    <form action={actualizarDatosConId} className="flex flex-col gap-2">
                      <input
                        name="titular"
                        defaultValue={persona.titular ?? ''}
                        placeholder="Titular de la cuenta"
                        required
                        className="rounded border px-3 py-2"
                      />
                      <input
                        name="alias"
                        defaultValue={persona.alias ?? ''}
                        placeholder="Alias"
                        required
                        className="rounded border px-3 py-2"
                      />
                      <input
                        name="banco"
                        defaultValue={persona.banco ?? ''}
                        placeholder="Banco"
                        required
                        className="rounded border px-3 py-2"
                      />
                      <input
                        name="cbu"
                        defaultValue={persona.cbu ?? ''}
                        placeholder="CBU (opcional)"
                        className="rounded border px-3 py-2"
                      />
                      <button
                        type="submit"
                        className="self-start rounded bg-black px-3 py-2 text-sm text-white"
                      >
                        Guardar datos de transferencia
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
                <td>{persona.email ?? '—'}</td>
                <td>
                  {tieneDatos ? (
                    `${persona.titular} · ${persona.alias} · ${persona.banco}`
                  ) : (
                    <span className="text-amber-700">Sin datos de transferencia</span>
                  )}
                </td>
                <td>
                  <div className="flex items-center gap-3">
                    <a href={`/admin/usuarios?editar=${persona.id}`} className="underline">
                      Editar
                    </a>
                    {persona.id !== user!.id && (
                      <BotonEliminarUsuario eliminarUsuarioAction={eliminarUsuarioConId} />
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      )}
    </main>
  )
}
