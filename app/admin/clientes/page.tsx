import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  await requireAdministrador()

  const { q: filtroTexto } = await searchParams

  const supabase = await createClient()

  let queryClientes = supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'cliente')
    .order('full_name')

  if (filtroTexto) {
    // .or() arma un filtro PostgREST crudo -- ",()" tienen significado
    // especial ahí (separan condiciones), así que se sacan del texto
    // buscado antes de interpolarlo para no romper ni alterar el filtro.
    const textoSaneado = filtroTexto.replace(/[,()]/g, '')
    queryClientes = queryClientes.or(`full_name.ilike.%${textoSaneado}%,email.ilike.%${textoSaneado}%`)
  }

  const { data: clientes } = await queryClientes

  const clienteIds = (clientes ?? []).map((cliente) => cliente.id)

  const { data: lotes } =
    clienteIds.length > 0
      ? await supabase.from('lotes').select('cliente_id').in('cliente_id', clienteIds)
      : { data: [] }

  const cantidadLotesPorCliente = new Map<string, number>()
  for (const lote of lotes ?? []) {
    const actual = cantidadLotesPorCliente.get(lote.cliente_id as string) ?? 0
    cantidadLotesPorCliente.set(lote.cliente_id as string, actual + 1)
  }

  return (
    <main className="max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">Clientes</h1>

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
          <a href="/admin/clientes" className="text-sm underline">
            Limpiar
          </a>
        )}
      </form>

      {(clientes ?? []).length === 0 ? (
        <p className="text-sm text-gray-600">
          {filtroTexto ? 'Ningún cliente coincide con la búsqueda.' : 'Todavía no hay ningún cliente cargado.'}
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Nombre</th>
              <th>Email</th>
              <th>Cantidad de lotes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clientes!.map((cliente) => (
              <tr key={cliente.id} className="border-b">
                <td className="py-2">{cliente.full_name}</td>
                <td>{cliente.email ?? '—'}</td>
                <td>{cantidadLotesPorCliente.get(cliente.id) ?? 0}</td>
                <td>
                  <a href={`/admin/clientes/${cliente.id}`} className="underline">
                    Ver detalle
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
