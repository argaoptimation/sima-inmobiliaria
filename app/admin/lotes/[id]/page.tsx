import { createClient } from '@/lib/supabase/server'
import { calcularEstadoCobranza } from '@/lib/cobranza/estado-cliente'
import { notFound } from 'next/navigation'
import { actualizarIdentificador, actualizarCobro } from './actions'

export default async function LoteDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; editarUsuario?: string }>
}) {
  const { id } = await params
  const { error, editarUsuario } = await searchParams

  const supabase = await createClient()

  const { data: lote } = await supabase
    .from('lotes')
    .select(
      'id, identificador, moneda, estado, cliente_id, admin_id, acreedor_id, vendedor_id, cuenta_cobro_id'
    )
    .eq('id', id)
    .single()

  if (!lote) {
    notFound()
  }

  const { data: cuotas } = await supabase
    .from('cuotas')
    .select('id, numero, monto_base, saldo_pendiente, fecha_vencimiento')
    .eq('lote_id', id)
    .order('numero', { ascending: true })

  const hoy = new Date().toISOString().slice(0, 10)
  const estado =
    lote!.estado === 'vendido'
      ? calcularEstadoCobranza(
          (cuotas ?? []).map((cuota) => ({
            saldoPendiente: cuota.saldo_pendiente,
            fechaVencimiento: cuota.fecha_vencimiento,
          })),
          hoy
        )
      : null

  const { data: cliente } = lote!.cliente_id
    ? await supabase.from('profiles').select('full_name').eq('id', lote!.cliente_id).single()
    : { data: null }

  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name, role, datos_transferencia')
    .in('role', ['administrador', 'acreedor', 'vendedor'])
    .order('full_name')

  const administradores = (staff ?? []).filter((persona) => persona.role === 'administrador')
  const acreedores = (staff ?? []).filter((persona) => persona.role === 'acreedor')
  const vendedores = (staff ?? []).filter((persona) => persona.role === 'vendedor')
  const conDatos = (staff ?? []).filter((persona) => persona.datos_transferencia?.trim())

  const actualizarIdentificadorConId = actualizarIdentificador.bind(null, id)
  const actualizarCobroConId = actualizarCobro.bind(null, id)

  return (
    <main className="max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">{lote!.identificador}</h1>

      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}

      <p className="mb-1 text-sm">Moneda: {lote!.moneda}</p>
      <p className="mb-1 text-sm">Estado: {lote!.estado}</p>
      {cliente && <p className="mb-1 text-sm">Cliente: {cliente.full_name}</p>}
      {estado && (
        <p className="mb-4 text-sm">
          Estado de cobranza:{' '}
          <span
            className={
              estado === 'normal'
                ? 'text-green-700'
                : estado === 'moroso'
                  ? 'text-amber-700'
                  : 'text-red-700'
            }
          >
            {estado === 'normal' ? 'Normal' : estado === 'moroso' ? 'Moroso' : 'Candidato a prejudicial'}
          </span>
        </p>
      )}

      <h2 className="mb-2 mt-6 text-lg font-semibold">Cuotas</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Cuota</th>
            <th>Vencimiento</th>
            <th>Monto base</th>
            <th>Saldo pendiente</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {cuotas?.map((cuota) => {
            const vencida = cuota.saldo_pendiente > 0 && cuota.fecha_vencimiento < hoy
            return (
              <tr key={cuota.id} className="border-b">
                <td className="py-2">{cuota.numero}</td>
                <td>{cuota.fecha_vencimiento}</td>
                <td>
                  {cuota.monto_base} {lote!.moneda}
                </td>
                <td>
                  {cuota.saldo_pendiente} {lote!.moneda}
                </td>
                <td>{vencida && <span className="text-red-700">Vencida</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Identificador</h2>
      <form action={actualizarIdentificadorConId} className="mb-8 flex gap-3">
        <input
          name="identificador"
          defaultValue={lote!.identificador}
          required
          className="flex-1 rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-black px-3 py-2 text-sm text-white">
          Guardar
        </button>
      </form>

      <h2 className="mb-2 text-lg font-semibold">Cobro</h2>
      <p className="mb-3 text-sm text-gray-600">
        Asigná quiénes son el admin, el acreedor y el vendedor de este lote, y cuál de ellos recibe
        las transferencias actualmente. Solo se puede elegir como cuenta de cobro a alguien que ya
        tenga datos de transferencia cargados
        {editarUsuario && (
          <>
            {' '}
            —{' '}
            <a href={`/admin/usuarios?editar=${editarUsuario}`} className="underline">
              cargarlos ahora
            </a>
          </>
        )}
        .
      </p>
      <form action={actualizarCobroConId} className="flex flex-col gap-3">
        <label className="text-sm">
          Admin
          <select
            name="adminId"
            defaultValue={lote!.admin_id ?? ''}
            className="mt-1 block w-full rounded border px-3 py-2"
          >
            <option value="">— sin asignar —</option>
            {administradores.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.full_name}
                {!persona.datos_transferencia?.trim() && ' — sin datos de transferencia'}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Acreedor
          <select
            name="acreedorId"
            defaultValue={lote!.acreedor_id ?? ''}
            className="mt-1 block w-full rounded border px-3 py-2"
          >
            <option value="">— sin asignar —</option>
            {acreedores.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.full_name}
                {!persona.datos_transferencia?.trim() && ' — sin datos de transferencia'}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Vendedor
          <select
            name="vendedorId"
            defaultValue={lote!.vendedor_id ?? ''}
            className="mt-1 block w-full rounded border px-3 py-2"
          >
            <option value="">— sin asignar —</option>
            {vendedores.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.full_name}
                {!persona.datos_transferencia?.trim() && ' — sin datos de transferencia'}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Cuenta de cobro actual
          <select
            name="cuentaCobroId"
            defaultValue={lote!.cuenta_cobro_id ?? ''}
            className="mt-1 block w-full rounded border px-3 py-2"
          >
            <option value="">— sin asignar —</option>
            {conDatos.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.full_name} ({persona.role})
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
          Guardar cobro
        </button>
      </form>
    </main>
  )
}
