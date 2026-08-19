import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { notFound } from 'next/navigation'
import { calcularSaldoCuentaCorrientePorMoneda } from '@/lib/cuenta-corriente/calcular-saldo'
import { agregarMovimientoManual } from '../actions'
import { BuscadorLote } from '../BuscadorLote'

const ETIQUETA_ORIGEN: Record<string, string> = {
  cobro_cuota: 'Cobro de cuota (automático)',
  transferencia_empresa: 'Transferencia de la empresa',
  pago_directo_cliente: 'Pago directo del cliente',
  reversion_cobro_cuota: 'Reversión (corrección de pago)',
  ajuste_distribucion: 'Ajuste de distribución',
}

export default async function CuentaCorrienteDetallePage({
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

  const agregarMovimientoManualConId = agregarMovimientoManual.bind(null, id)

  const { data: persona } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', id)
    .maybeSingle()

  if (!persona) {
    notFound()
  }

  const { data: movimientos } = await supabase
    .from('movimientos_cuenta_corriente')
    .select(
      'id, tipo, monto, moneda, cotizacion_dia, origen, fecha_evento, de_parte_de, detalle, lotes(identificador)'
    )
    .eq('profile_id', id)
    .order('fecha_evento', { ascending: false })
    .order('created_at', { ascending: false })

  const { data: lotes } = await supabase.from('lotes').select('id, identificador').order('identificador')

  // Sugerencias de "de quién vino la plata" -- puede ser un cliente (el
  // caso más común de "pago directo") o cualquier otra persona del
  // sistema. El campo sigue siendo texto libre (no hay ninguna FK que
  // resolver), el datalist es solo para no tipear de cero.
  const { data: personasParaSugerir } = await supabase
    .from('profiles')
    .select('full_name')
    .order('full_name')

  // Dos personas distintas pueden compartir nombre (ej. dos clientes
  // llamados "Juan Pérez") -- el datalist solo necesita el texto una vez,
  // no una entrada por persona.
  const nombresUnicosParaSugerir = [...new Set((personasParaSugerir ?? []).map((p) => p.full_name))]

  const saldos = calcularSaldoCuentaCorrientePorMoneda(
    (movimientos ?? []).map((m) => ({ tipo: m.tipo as 'debe' | 'haber', monto: m.monto, moneda: m.moneda }))
  )
  const entradasSaldo = Object.entries(saldos).filter(([, monto]) => monto !== 0)

  return (
    <main className="max-w-3xl">
      <a href="/admin/cuentas-corrientes" className="mb-4 inline-block text-sm underline">
        ← Volver a Cuentas corrientes
      </a>
      <h1 className="mb-1 text-xl font-semibold">{persona!.full_name}</h1>
      <p className="mb-6 text-sm text-gray-600">{persona!.role}</p>

      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      {ok && <p className="mb-4 rounded bg-green-100 p-2 text-sm text-green-700">Guardado.</p>}

      <h2 className="mb-2 text-lg font-semibold">Saldo</h2>
      <p className="mb-2 text-sm">
        {entradasSaldo.length === 0
          ? 'Sin movimientos todavía.'
          : entradasSaldo.map(([moneda, monto]) => `${monto} ${moneda}`).join(' / ')}
      </p>
      <p className="mb-6 text-xs text-gray-600">
        Positivo: la empresa todavía le debe. Negativo: cobró de más y le debe a la empresa.
      </p>

      <h2 className="mb-2 text-lg font-semibold">Registrar plata que le llegó (Haber)</h2>
      <form action={agregarMovimientoManualConId} className="mb-8 flex max-w-sm flex-col gap-3">
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
          Fecha
          <input
            name="fechaEvento"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          De quién vino la plata (obligatorio si es pago directo del cliente)
          <input
            name="deParteDe"
            list="lista-personas-cuenta-corriente"
            placeholder="Buscar o escribir un nombre..."
            className="mt-1 block w-full rounded border px-3 py-2"
          />
          <datalist id="lista-personas-cuenta-corriente">
            {nombresUnicosParaSugerir.map((nombre) => (
              <option key={nombre} value={nombre} />
            ))}
          </datalist>
        </label>
        <label className="text-sm">
          Lote relacionado (opcional)
          <BuscadorLote lotes={lotes ?? []} />
        </label>
        <label className="text-sm">
          Origen (opcional)
          <select name="origen" defaultValue="transferencia_empresa" className="mt-1 block w-full rounded border px-3 py-2">
            <option value="transferencia_empresa">La empresa le transfirió su parte</option>
            <option value="pago_directo_cliente">El cliente le pagó directo, salteando a la empresa</option>
          </select>
        </label>
        <label className="text-sm">
          Detalle (opcional)
          <input name="detalle" className="mt-1 block w-full rounded border px-3 py-2" />
        </label>
        <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
          Agregar movimiento
        </button>
      </form>

      <h2 className="mb-2 text-lg font-semibold">Movimientos</h2>
      {(movimientos ?? []).length === 0 ? (
        <p className="text-sm text-gray-600">Sin movimientos todavía.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Fecha</th>
              <th>Tipo</th>
              <th>Origen</th>
              <th>Detalle</th>
              <th>Monto</th>
            </tr>
          </thead>
          <tbody>
            {movimientos!.map((movimiento) => (
              <tr key={movimiento.id} className="border-b">
                <td className="py-2">{new Date(movimiento.fecha_evento).toLocaleDateString('es-AR')}</td>
                <td>{movimiento.tipo === 'debe' ? 'Debe' : 'Haber'}</td>
                <td>{ETIQUETA_ORIGEN[movimiento.origen] ?? movimiento.origen}</td>
                <td>
                  {movimiento.detalle ?? '—'}
                  {movimiento.de_parte_de ? ` (de: ${movimiento.de_parte_de})` : ''}
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(movimiento.lotes as any)?.identificador
                    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      ` — Lote ${(movimiento.lotes as any).identificador}`
                    : ''}
                </td>
                <td>
                  {movimiento.monto} {movimiento.moneda}
                  {movimiento.cotizacion_dia ? ` (cotización: ${movimiento.cotizacion_dia})` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
