import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function LotesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: perfilPropio } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  if (!perfilPropio) {
    redirect('/login')
  }

  let queryLotes = supabase
    .from('lotes')
    .select('id, identificador, moneda, estado, cantidad_cuotas')
    .order('created_at', { ascending: false })

  if (perfilPropio!.role === 'acreedor') {
    queryLotes = queryLotes.eq('acreedor_id', user!.id)
  }

  const { data: lotes } = await queryLotes

  return (
    <main>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Lotes</h1>
        <a href="/admin/lotes/nuevo" className="rounded bg-black px-3 py-2 text-sm text-white">
          + Nuevo lote
        </a>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Identificador</th>
            <th>Moneda</th>
            <th>Estado</th>
            <th>Cuotas</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lotes?.map((lote) => (
            <tr key={lote.id} className="border-b">
              <td className="py-2">{lote.identificador}</td>
              <td>{lote.moneda}</td>
              <td>{lote.estado}</td>
              <td>{lote.cantidad_cuotas}</td>
              <td>
                <a href={`/admin/lotes/${lote.id}`} className="text-sm underline">
                  Ver detalle
                </a>
                {lote.estado !== 'vendido' && (
                  <a href={`/admin/lotes/${lote.id}/vender`} className="ml-3 text-sm underline">
                    Vender / asignar cliente
                  </a>
                )}
                {lote.moneda === 'ARS' && (
                  <a href={`/admin/lotes/${lote.id}/indexar`} className="ml-3 text-sm underline">
                    Indexar
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
