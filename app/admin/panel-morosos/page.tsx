import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { hoyArgentina } from '@/lib/fecha/hoy-argentina'
import { marcarPrejudicial } from '../lotes/[id]/actions'
import { BotonMarcarPrejudicial } from '../lotes/[id]/BotonPrejudicial'

interface FilaMoroso {
  loteId: string
  identificador: string
  clienteId: string
  clienteNombre: string
  cuotasVencidas: number
  saldoPendiente: number
  moneda: string
}

// Panel de Morosos (propuesto por Gabriel/Nicolás 26/08): antes de esto, para
// saber quién debe una, dos o tres+ cuotas había que entrar lote por lote.
// Agrupa a todos los clientes vendidos con cuotas vencidas en 4 tramos --
// deben 1, deben 2, posible prejudicial (3+, señal automática) y prejudicial
// oficial (marca manual) -- con el botón de marcar prejudicial disponible acá
// mismo para el tramo de posible prejudicial, sin tener que entrar al lote.
export default async function PanelMorososPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  await requireAdministrador()

  const { ok, error } = await searchParams

  const supabase = await createClient()
  const hoy = hoyArgentina()

  const { data: lotesVendidos } = await supabase
    .from('lotes')
    .select('id, identificador, moneda, cliente_id, ciclo_actual, marcado_prejudicial')
    .eq('estado', 'vendido')
    .not('cliente_id', 'is', null)

  const loteIds = (lotesVendidos ?? []).map((lote) => lote.id)
  const clienteIds = [...new Set((lotesVendidos ?? []).map((lote) => lote.cliente_id as string))]

  const { data: clientes } =
    clienteIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', clienteIds)
      : { data: [] }
  const nombreClientePorId = new Map((clientes ?? []).map((cliente) => [cliente.id, cliente.full_name]))

  const { data: cuotasSinFiltrar } =
    loteIds.length > 0
      ? await supabase.from('cuotas').select('lote_id, ciclo, saldo_pendiente, fecha_vencimiento').in('lote_id', loteIds)
      : { data: [] }

  const cicloActualPorLoteId = new Map((lotesVendidos ?? []).map((lote) => [lote.id, lote.ciclo_actual]))
  const cuotas = (cuotasSinFiltrar ?? []).filter((cuota) => cuota.ciclo === cicloActualPorLoteId.get(cuota.lote_id))

  const cuotasPorLote = new Map<string, { saldo_pendiente: number; fecha_vencimiento: string }[]>()
  for (const cuota of cuotas) {
    const lista = cuotasPorLote.get(cuota.lote_id) ?? []
    lista.push(cuota)
    cuotasPorLote.set(cuota.lote_id, lista)
  }

  const debe1: FilaMoroso[] = []
  const debe2: FilaMoroso[] = []
  const posiblePrejudicial: FilaMoroso[] = []
  const prejudicialOficial: FilaMoroso[] = []

  for (const lote of lotesVendidos ?? []) {
    const cuotasDelLote = cuotasPorLote.get(lote.id) ?? []
    const cuotasVencidas = cuotasDelLote.filter(
      (cuota) => cuota.saldo_pendiente > 0 && cuota.fecha_vencimiento < hoy
    ).length
    const saldoPendiente = cuotasDelLote.reduce((acum, cuota) => acum + cuota.saldo_pendiente, 0)

    if (saldoPendiente === 0 && !lote.marcado_prejudicial) continue

    const fila: FilaMoroso = {
      loteId: lote.id,
      identificador: lote.identificador,
      clienteId: lote.cliente_id as string,
      clienteNombre: nombreClientePorId.get(lote.cliente_id as string) ?? '—',
      cuotasVencidas,
      saldoPendiente,
      moneda: lote.moneda,
    }

    if (lote.marcado_prejudicial) {
      prejudicialOficial.push(fila)
    } else if (cuotasVencidas === 1) {
      debe1.push(fila)
    } else if (cuotasVencidas === 2) {
      debe2.push(fila)
    } else if (cuotasVencidas >= 3) {
      posiblePrejudicial.push(fila)
    }
  }

  function tabla(filas: FilaMoroso[], conBotonMarcar: boolean) {
    if (filas.length === 0) {
      return <p className="mb-8 text-sm text-gray-600">No hay lotes en este grupo.</p>
    }
    return (
      <table className="mb-8 w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Cliente</th>
            <th>Lote</th>
            <th>Cuotas vencidas</th>
            <th>Saldo pendiente</th>
            <th></th>
            {conBotonMarcar && <th></th>}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => {
            const marcarPrejudicialConId = marcarPrejudicial.bind(null, fila.loteId, '/admin/panel-morosos')
            return (
              <tr key={fila.loteId} className="border-b">
                <td className="py-2">
                  <a href={`/admin/clientes/${fila.clienteId}`} className="underline">
                    {fila.clienteNombre}
                  </a>
                </td>
                <td>{fila.identificador}</td>
                <td>{fila.cuotasVencidas}</td>
                <td>
                  {fila.saldoPendiente} {fila.moneda}
                </td>
                <td>
                  <a href={`/admin/lotes/${fila.loteId}`} className="underline">
                    Ver lote
                  </a>
                </td>
                {conBotonMarcar && (
                  <td>
                    <BotonMarcarPrejudicial marcarPrejudicialAction={marcarPrejudicialConId} />
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    )
  }

  return (
    <main>
      <h1 className="mb-6 text-xl font-semibold">Panel de Morosos</h1>

      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      {ok && <p className="mb-4 rounded bg-green-100 p-2 text-sm text-green-700">{ok}</p>}

      <h2 className="mb-2 text-lg font-semibold">Deben 1 cuota ({debe1.length})</h2>
      {tabla(debe1, false)}

      <h2 className="mb-2 text-lg font-semibold">Deben 2 cuotas ({debe2.length})</h2>
      {tabla(debe2, false)}

      <h2 className="mb-2 text-lg font-semibold text-orange-700">
        Posible prejudicial — 3 o más cuotas ({posiblePrejudicial.length})
      </h2>
      {tabla(posiblePrejudicial, true)}

      <h2 className="mb-2 text-lg font-semibold text-red-800">
        Prejudicial (ya marcado) ({prejudicialOficial.length})
      </h2>
      {tabla(prejudicialOficial, false)}
    </main>
  )
}
