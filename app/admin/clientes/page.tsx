import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'

export default async function ClientesPage() {
  await requireAdministrador()

  const supabase = await createClient()

  const { data: clientes } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'cliente')
    .order('full_name')

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
      {(clientes ?? []).length === 0 ? (
        <p className="text-sm text-gray-600">Todavía no hay ningún cliente cargado.</p>
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
