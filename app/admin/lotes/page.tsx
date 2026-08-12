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

  const esVendedorOCobrador = perfilPropio!.role === 'vendedor' || perfilPropio!.role === 'cobrador'

  let queryLotes = supabase
    .from('lotes')
    .select('id, identificador, moneda, estado, cantidad_cuotas, ubicacion, precio_total, acreedor_id')
    .order('created_at', { ascending: false })

  if (perfilPropio!.role === 'acreedor') {
    queryLotes = queryLotes.eq('acreedor_id', user!.id)
  }

  if (esVendedorOCobrador) {
    queryLotes = queryLotes.eq('estado', 'disponible')
  }

  const { data: lotes } = await queryLotes

  const acreedorIds = [...new Set((lotes ?? []).map((lote) => lote.acreedor_id).filter(Boolean))]

  const { data: acreedores } =
    acreedorIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', acreedorIds)
      : { data: [] }

  const nombreAcreedorPorId = new Map((acreedores ?? []).map((persona) => [persona.id, persona.full_name]))

  let reservasPropias: { lote_id: string }[] = []

  if (esVendedorOCobrador) {
    const { data } = await supabase
      .from('reservas')
      .select('lote_id')
      .eq('created_by', user!.id)

    reservasPropias = data ?? []
  }

  const idsLotesReservadosPorMi = [...new Set(reservasPropias.map((reserva) => reserva.lote_id))]

  const { data: misLotesReservados } =
    idsLotesReservadosPorMi.length > 0
      ? await supabase
          .from('lotes')
          .select('id, identificador, moneda, estado, ubicacion, precio_total')
          .in('id', idsLotesReservadosPorMi)
          .order('created_at', { ascending: false })
      : { data: [] }

  return (
    <main>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Lotes</h1>
        {!esVendedorOCobrador && (
          <a href="/admin/lotes/nuevo" className="rounded bg-black px-3 py-2 text-sm text-white">
            + Nuevo lote
          </a>
        )}
      </div>

      {esVendedorOCobrador && (
        <>
          <h2 className="mb-2 text-lg font-semibold">Lotes que reservaste</h2>
          {(misLotesReservados ?? []).length === 0 ? (
            <p className="mb-8 text-sm text-gray-600">Todavía no reservaste ningún lote.</p>
          ) : (
            <table className="mb-8 w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2">Identificador</th>
                  <th>Ubicación</th>
                  <th>Precio total</th>
                  <th>Moneda</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {misLotesReservados!.map((lote) => (
                  <tr key={lote.id} className="border-b">
                    <td className="py-2">{lote.identificador}</td>
                    <td>{lote.ubicacion ?? '—'}</td>
                    <td>
                      {lote.precio_total ? `${lote.precio_total} ${lote.moneda}` : '—'}
                    </td>
                    <td>{lote.moneda}</td>
                    <td>{lote.estado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h2 className="mb-2 text-lg font-semibold">Lotes disponibles</h2>
        </>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Identificador</th>
            <th>Ubicación</th>
            <th>Precio total</th>
            <th>Moneda</th>
            <th>Estado</th>
            <th>Acreedor</th>
            {!esVendedorOCobrador && <th>Cuotas</th>}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lotes?.map((lote) => (
            <tr key={lote.id} className="border-b">
              <td className="py-2">{lote.identificador}</td>
              <td>{lote.ubicacion ?? '—'}</td>
              <td>{lote.precio_total ? `${lote.precio_total} ${lote.moneda}` : '—'}</td>
              <td>{lote.moneda}</td>
              <td>{lote.estado}</td>
              <td>
                {lote.acreedor_id ? nombreAcreedorPorId.get(lote.acreedor_id) ?? '—' : '— sin asignar —'}
              </td>
              {!esVendedorOCobrador && <td>{lote.cantidad_cuotas}</td>}
              <td>
                {esVendedorOCobrador ? (
                  <a href={`/admin/lotes/${lote.id}/reservar`} className="text-sm underline">
                    Reservar
                  </a>
                ) : (
                  <>
                    <a href={`/admin/lotes/${lote.id}`} className="text-sm underline">
                      Ver detalle
                    </a>
                    {lote.estado === 'disponible' && (
                      <a
                        href={`/admin/lotes/${lote.id}/reservar`}
                        className="ml-3 text-sm underline"
                      >
                        Reservar
                      </a>
                    )}
                    {lote.estado !== 'vendido' && (
                      <a href={`/admin/lotes/${lote.id}/vender`} className="ml-3 text-sm underline">
                        Vender / asignar cliente
                      </a>
                    )}
                    {lote.moneda === 'ARS' && (
                      <a
                        href={`/admin/lotes/${lote.id}/indexar`}
                        className="ml-3 text-sm underline"
                      >
                        Indexar
                      </a>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
