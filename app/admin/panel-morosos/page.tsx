import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { hoyArgentina } from '@/lib/fecha/hoy-argentina'
import { marcarPrejudicial } from '../lotes/[id]/actions'
import { BotonMarcarPrejudicial } from '../lotes/[id]/BotonPrejudicial'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import {
  ENLACE_TABLA,
  TITULO_H1,
  BANNER_ERROR,
  BANNER_OK,
  TABLA_CONTENEDOR,
  TABLA_HEADER_FILA,
  TABLA_HEADER_CELDA,
  TABLA_FILA,
  TABLA_CELDA,
} from '@/lib/ui/clases'

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
      return <p className="mb-8 text-sm text-slate-600">No hay lotes en este grupo.</p>
    }
    return (
      <div className={`mb-8 ${TABLA_CONTENEDOR}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className={TABLA_HEADER_FILA}>
            <th className={TABLA_HEADER_CELDA}>Cliente</th>
            <th className={TABLA_HEADER_CELDA}>Lote</th>
            <th className={TABLA_HEADER_CELDA}>Cuotas vencidas</th>
            <th className={TABLA_HEADER_CELDA}>Saldo pendiente</th>
            <th className={TABLA_HEADER_CELDA}></th>
            {conBotonMarcar && <th className={TABLA_HEADER_CELDA}></th>}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => {
            const marcarPrejudicialConId = marcarPrejudicial.bind(null, fila.loteId, '/admin/panel-morosos')
            return (
              <tr key={fila.loteId} className={TABLA_FILA}>
                <td className={TABLA_CELDA}>
                  <EnlaceBoton href={`/admin/clientes/${fila.clienteId}`} className={ENLACE_TABLA}>
                    {fila.clienteNombre}
                  </EnlaceBoton>
                </td>
                <td className={TABLA_CELDA}>{fila.identificador}</td>
                <td className={TABLA_CELDA}>{fila.cuotasVencidas}</td>
                <td className={TABLA_CELDA}>
                  {fila.saldoPendiente} {fila.moneda}
                </td>
                <td className={TABLA_CELDA}>
                  <EnlaceBoton href={`/admin/lotes/${fila.loteId}`} className={ENLACE_TABLA}>
                    Ver lote
                  </EnlaceBoton>
                </td>
                {conBotonMarcar && (
                  <td className={TABLA_CELDA}>
                    <BotonMarcarPrejudicial marcarPrejudicialAction={marcarPrejudicialConId} />
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
    )
  }

  return (
    <main>
      <h1 className={`mb-6 ${TITULO_H1}`}>Panel de Morosos</h1>

      {error && <p className={BANNER_ERROR}>{error}</p>}
      {ok && <p className={BANNER_OK}>{ok}</p>}

      <h2 className="mb-2 text-lg font-bold text-blue-900">Deben 1 cuota ({debe1.length})</h2>
      {tabla(debe1, false)}

      <h2 className="mb-2 text-lg font-bold text-blue-900">Deben 2 cuotas ({debe2.length})</h2>
      {tabla(debe2, false)}

      <h2 className="mb-2 text-lg font-bold text-orange-700">
        Posible prejudicial — 3 o más cuotas ({posiblePrejudicial.length})
      </h2>
      {tabla(posiblePrejudicial, true)}

      <h2 className="mb-2 text-lg font-bold text-red-800">
        Prejudicial (ya marcado) ({prejudicialOficial.length})
      </h2>
      {tabla(prejudicialOficial, false)}
    </main>
  )
}
