import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { notFound } from 'next/navigation'
import { calcularSaldoPorMoneda } from '@/lib/cuentas-externas/calcular-saldo'
import { actualizarCuentaExterna, agregarMovimiento, eliminarCuentaExterna } from '../actions'
import { BotonEliminarCuentaExterna } from '../BotonEliminarCuentaExterna'

export default async function CuentaExternaDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; ok?: string }>
}) {
  await requireAdministrador()

  const { id } = await params
  const { error, ok } = await searchParams

  const supabase = await createClient()

  const actualizarCuentaExternaConId = actualizarCuentaExterna.bind(null, id)
  const agregarMovimientoConId = agregarMovimiento.bind(null, id)
  const eliminarCuentaExternaConId = eliminarCuentaExterna.bind(null, id)

  const { data: cuentaExterna } = await supabase
    .from('cuentas_externas')
    .select('id, nombre, titular, alias, banco, cbu')
    .eq('id', id)
    .maybeSingle()

  if (!cuentaExterna) {
    notFound()
  }

  const { data: movimientos } = await supabase
    .from('cuentas_externas_movimientos')
    .select('id, tipo, monto, moneda, concepto, created_at')
    .eq('cuenta_externa_id', id)
    .order('created_at', { ascending: false })

  const saldos = calcularSaldoPorMoneda(
    (movimientos ?? []).map((m) => ({
      tipo: m.tipo as 'debito' | 'credito',
      monto: m.monto,
      moneda: m.moneda,
    }))
  )


  return (
    <main className="max-w-2xl">
      <a href="/admin/cuentas-externas" className="mb-4 inline-block text-sm underline">
        ← Volver a Cuentas externas
      </a>
      <h1 className="mb-6 text-xl font-semibold">{cuentaExterna!.nombre}</h1>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      {ok && <p className="mb-4 rounded bg-green-100 p-2 text-sm text-green-700">Guardado.</p>}

      <h2 className="mb-2 text-lg font-semibold">Saldo</h2>
      {Object.keys(saldos).length === 0 ? (
        <p className="mb-6 text-sm text-gray-600">Sin movimientos todavía.</p>
      ) : (
        <p className="mb-6 text-sm">
          {Object.entries(saldos)
            .map(([moneda, monto]) => `${monto} ${moneda}`)
            .join(' / ')}
        </p>
      )}

      <h2 className="mb-2 text-lg font-semibold">Datos de transferencia</h2>
      <form action={actualizarCuentaExternaConId} className="mb-8 flex flex-col gap-3">
        <label className="text-sm">
          Nombre del destinatario
          <input
            name="nombre"
            defaultValue={cuentaExterna!.nombre}
            required
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Titular
          <input
            name="titular"
            defaultValue={cuentaExterna!.titular}
            required
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Alias
          <input
            name="alias"
            defaultValue={cuentaExterna!.alias}
            required
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Banco
          <input
            name="banco"
            defaultValue={cuentaExterna!.banco}
            required
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          CBU (opcional)
          <input
            name="cbu"
            defaultValue={cuentaExterna!.cbu ?? ''}
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
          Guardar
        </button>
      </form>

      <h2 className="mb-2 text-lg font-semibold">Agregar movimiento</h2>
      <form action={agregarMovimientoConId} className="mb-8 flex flex-col gap-3 max-w-sm">
        <label className="text-sm">
          Tipo
          <select name="tipo" defaultValue="debito" className="mt-1 block w-full rounded border px-3 py-2">
            <option value="debito">Débito — le debemos nosotros a esta cuenta</option>
            <option value="credito">Crédito — esta cuenta nos debe a nosotros</option>
          </select>
        </label>
        <label className="text-sm">
          Monto
          <input
            name="monto"
            type="number"
            step="0.01"
            min="0"
            required
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Moneda
          <select name="moneda" defaultValue="USD" className="mt-1 block w-full rounded border px-3 py-2">
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>
        </label>
        <label className="text-sm">
          Concepto
          <input
            name="concepto"
            required
            placeholder="Ej: Materiales de construcción, agosto 2026"
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
          Agregar movimiento
        </button>
      </form>

      <h2 className="mb-2 text-lg font-semibold">Movimientos</h2>
      {(movimientos ?? []).length === 0 ? (
        <p className="mb-8 text-sm text-gray-600">Sin movimientos todavía.</p>
      ) : (
        <table className="mb-8 w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Fecha</th>
              <th>Tipo</th>
              <th>Concepto</th>
              <th>Monto</th>
            </tr>
          </thead>
          <tbody>
            {movimientos!.map((movimiento) => (
              <tr key={movimiento.id} className="border-b">
                <td className="py-2">{new Date(movimiento.created_at).toLocaleDateString('es-AR')}</td>
                <td>{movimiento.tipo === 'debito' ? 'Débito (le debemos)' : 'Crédito (nos debe / le pagamos)'}</td>
                <td>{movimiento.concepto}</td>
                <td>
                  {movimiento.monto} {movimiento.moneda}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="mb-2 text-lg font-semibold">Eliminar</h2>
      <BotonEliminarCuentaExterna eliminarCuentaExternaAction={eliminarCuentaExternaConId} />
    </main>
  )
}
