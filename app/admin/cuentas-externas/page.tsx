import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { calcularSaldoPorMoneda } from '@/lib/cuentas-externas/calcular-saldo'

export default async function CuentasExternasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  await requireAdministrador()

  const { q: filtroTexto } = await searchParams

  const supabase = await createClient()

  let queryCuentas = supabase.from('cuentas_externas').select('id, nombre').order('nombre')

  if (filtroTexto) {
    const textoSaneado = filtroTexto.replace(/[,()]/g, '')
    queryCuentas = queryCuentas.ilike('nombre', `%${textoSaneado}%`)
  }

  const { data: cuentasExternas } = await queryCuentas

  const { data: movimientos } = await supabase
    .from('cuentas_externas_movimientos')
    .select('cuenta_externa_id, tipo, monto, moneda')

  const movimientosPorCuenta = new Map<string, { tipo: string; monto: number; moneda: string }[]>()
  for (const movimiento of movimientos ?? []) {
    const lista = movimientosPorCuenta.get(movimiento.cuenta_externa_id) ?? []
    lista.push(movimiento as { tipo: string; monto: number; moneda: string })
    movimientosPorCuenta.set(movimiento.cuenta_externa_id, lista)
  }

  function formatearSaldo(cuentaExternaId: string) {
    const propios = movimientosPorCuenta.get(cuentaExternaId) ?? []
    const saldos = calcularSaldoPorMoneda(
      propios.map((m) => ({ tipo: m.tipo as 'debito' | 'credito', monto: m.monto, moneda: m.moneda }))
    )
    const entradas = Object.entries(saldos)
    if (entradas.length === 0) return '—'
    return entradas.map(([moneda, monto]) => `${monto} ${moneda}`).join(' / ')
  }

  return (
    <main className="max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cuentas externas</h1>
        <a href="/admin/cuentas-externas/nuevo" className="rounded bg-black px-3 py-2 text-sm text-white">
          + Nueva cuenta externa
        </a>
      </div>

      <form method="get" className="mb-4 flex items-end gap-3">
        <label className="text-sm">
          Buscar
          <input
            type="text"
            name="q"
            placeholder="Nombre"
            defaultValue={filtroTexto ?? ''}
            className="mt-1 block rounded border px-3 py-2"
          />
        </label>
        <button type="submit" className="rounded border px-3 py-2 text-sm">
          Filtrar
        </button>
        {filtroTexto && (
          <a href="/admin/cuentas-externas" className="text-sm underline">
            Limpiar
          </a>
        )}
      </form>

      {(cuentasExternas ?? []).length === 0 ? (
        <p className="text-sm text-gray-600">
          {filtroTexto ? 'Ninguna cuenta externa coincide con la búsqueda.' : 'Todavía no hay ninguna cuenta externa cargada.'}
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Nombre</th>
              <th>Saldo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cuentasExternas!.map((cuentaExterna) => (
              <tr key={cuentaExterna.id} className="border-b">
                <td className="py-2">{cuentaExterna.nombre}</td>
                <td>{formatearSaldo(cuentaExterna.id)}</td>
                <td>
                  <a href={`/admin/cuentas-externas/${cuentaExterna.id}`} className="underline">
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
