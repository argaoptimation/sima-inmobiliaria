import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { calcularSaldoCuentaCorrientePorMoneda } from '@/lib/cuenta-corriente/calcular-saldo'
import { obtenerCuotasSinDistribucion } from '@/lib/cuenta-corriente/cuotas-sin-distribucion'
import { FiltroEnVivo } from '@/components/FiltroEnVivo'

export default async function CuentasCorrientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  await requireAdministrador()

  const { q: filtroTexto } = await searchParams

  const supabase = await createClient()

  let queryPersonas = supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('role', ['administrador', 'acreedor', 'vendedor', 'cobrador'])
    .order('full_name')

  if (filtroTexto) {
    queryPersonas = queryPersonas.ilike('full_name', `%${filtroTexto}%`)
  }

  const { data: personas } = await queryPersonas

  const { data: movimientos } = await supabase
    .from('movimientos_cuenta_corriente')
    .select('profile_id, tipo, monto, moneda')

  const movimientosPorPersona = new Map<string, { tipo: 'debe' | 'haber'; monto: number; moneda: string }[]>()
  for (const movimiento of movimientos ?? []) {
    const lista = movimientosPorPersona.get(movimiento.profile_id) ?? []
    lista.push({ tipo: movimiento.tipo, monto: movimiento.monto, moneda: movimiento.moneda })
    movimientosPorPersona.set(movimiento.profile_id, lista)
  }

  const cuotasSinDistribucion = await obtenerCuotasSinDistribucion(supabase)

  return (
    <main className="max-w-3xl">
      <h1 className="mb-6 text-xl font-semibold">Cuentas corrientes</h1>

      {cuotasSinDistribucion.length > 0 && (
        <div className="mb-6 rounded bg-amber-100 p-3 text-sm text-amber-800">
          <p className="mb-1 font-semibold">
            {cuotasSinDistribucion.length} cuota{cuotasSinDistribucion.length > 1 ? 's' : ''} cobrada
            {cuotasSinDistribucion.length > 1 ? 's' : ''} sin distribución cargada:
          </p>
          <ul className="list-inside list-disc">
            {cuotasSinDistribucion.map((cuota) => (
              <li key={cuota.cuotaId}>
                <a href={`/admin/lotes/${cuota.loteId}/distribucion`} className="underline">
                  {cuota.loteIdentificador} — cuota {cuota.numero}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <FiltroEnVivo className="mb-4 flex items-end gap-3">
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
          <a href="/admin/cuentas-corrientes" className="text-sm underline">
            Limpiar
          </a>
        )}
      </FiltroEnVivo>

      {(personas ?? []).length === 0 && filtroTexto ? (
        <p className="text-sm text-gray-600">Nadie coincide con la búsqueda.</p>
      ) : (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Nombre</th>
            <th>Rol</th>
            <th>Saldo</th>
          </tr>
        </thead>
        <tbody>
          {(personas ?? []).map((persona) => {
            const saldos = calcularSaldoCuentaCorrientePorMoneda(movimientosPorPersona.get(persona.id) ?? [])
            const entradasSaldo = Object.entries(saldos).filter(([, monto]) => monto !== 0)

            return (
              <tr key={persona.id} className="border-b">
                <td className="py-2">
                  <a href={`/admin/cuentas-corrientes/${persona.id}`} className="underline">
                    {persona.full_name}
                  </a>
                </td>
                <td>{persona.role}</td>
                <td>
                  {entradasSaldo.length === 0
                    ? 'Sin movimientos'
                    : entradasSaldo.map(([moneda, monto]) => `${monto} ${moneda}`).join(' / ')}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      )}
    </main>
  )
}
