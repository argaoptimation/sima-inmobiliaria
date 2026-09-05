import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { calcularSaldoCuentaCorrientePorMoneda } from '@/lib/cuenta-corriente/calcular-saldo'
import { obtenerCuotasSinDistribucion } from '@/lib/cuenta-corriente/cuotas-sin-distribucion'
import { FiltroEnVivo } from '@/components/FiltroEnVivo'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { EncabezadoPagina } from '@/components/EncabezadoPagina'
import {
  ENTRADA,
  BOTON_SECUNDARIO,
  ENLACE,
  ENLACE_TABLA,
  TABLA_CONTENEDOR,
  TABLA_HEADER_FILA,
  TABLA_HEADER_CELDA,
  TABLA_FILA,
  TABLA_CELDA,
  TABLA_CELDA_PRINCIPAL,
} from '@/lib/ui/clases'

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
    <main>
      <EncabezadoPagina titulo="Cuentas corrientes" migas={['Cuentas corrientes']} />

      {cuotasSinDistribucion.length > 0 && (
        <div className="mb-6 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <p className="mb-1 font-semibold">
            {cuotasSinDistribucion.length} cuota{cuotasSinDistribucion.length > 1 ? 's' : ''} cobrada
            {cuotasSinDistribucion.length > 1 ? 's' : ''} sin distribución cargada:
          </p>
          <ul className="list-inside list-disc">
            {cuotasSinDistribucion.map((cuota) => (
              <li key={cuota.cuotaId}>
                <EnlaceBoton href={`/admin/lotes/${cuota.loteId}/distribucion`} className={ENLACE}>
                  {cuota.loteIdentificador} — cuota {cuota.numero}
                </EnlaceBoton>
              </li>
            ))}
          </ul>
        </div>
      )}

      <FiltroEnVivo className="mb-4 flex items-end gap-3">
        <label className="text-sm text-slate-600">
          Buscar
          <input type="text" name="q" placeholder="Nombre" defaultValue={filtroTexto ?? ''} className={ENTRADA} />
        </label>
        <button type="submit" className={`cursor-pointer ${BOTON_SECUNDARIO}`}>
          Filtrar
        </button>
        {filtroTexto && (
          <EnlaceBoton href="/admin/cuentas-corrientes" className={ENLACE}>
            Limpiar
          </EnlaceBoton>
        )}
      </FiltroEnVivo>

      {(personas ?? []).length === 0 && filtroTexto ? (
        <p className="text-sm text-slate-600">Nadie coincide con la búsqueda.</p>
      ) : (
        <div className={TABLA_CONTENEDOR}>
          <table className="w-full text-sm">
            <thead>
              <tr className={TABLA_HEADER_FILA}>
                <th className={TABLA_HEADER_CELDA}>Nombre</th>
                <th className={TABLA_HEADER_CELDA}>Rol</th>
                <th className={TABLA_HEADER_CELDA}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {(personas ?? []).map((persona) => {
                const saldos = calcularSaldoCuentaCorrientePorMoneda(movimientosPorPersona.get(persona.id) ?? [])
                const entradasSaldo = Object.entries(saldos).filter(([, monto]) => monto !== 0)

                return (
                  <tr key={persona.id} className={TABLA_FILA}>
                    <td className={TABLA_CELDA_PRINCIPAL}>
                      <EnlaceBoton href={`/admin/cuentas-corrientes/${persona.id}`} className={ENLACE_TABLA}>
                        {persona.full_name}
                      </EnlaceBoton>
                    </td>
                    <td className={TABLA_CELDA}>{persona.role}</td>
                    <td className={TABLA_CELDA}>
                      {entradasSaldo.length === 0
                        ? 'Sin movimientos'
                        : entradasSaldo.map(([moneda, monto]) => `${monto} ${moneda}`).join(' / ')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
