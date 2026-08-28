import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { calcularSaldoPorMoneda } from '@/lib/cuentas-externas/calcular-saldo'
import { FiltroEnVivo } from '@/components/FiltroEnVivo'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import {
  ENTRADA,
  BOTON_PRIMARIO,
  BOTON_SECUNDARIO,
  ENLACE,
  ENLACE_TABLA,
  TITULO_H1,
  TABLA_CONTENEDOR,
  TABLA_HEADER_FILA,
  TABLA_HEADER_CELDA,
  TABLA_FILA,
  TABLA_CELDA,
  TABLA_CELDA_PRINCIPAL,
} from '@/lib/ui/clases'

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
        <h1 className={TITULO_H1}>Cuentas externas</h1>
        <EnlaceBoton href="/admin/cuentas-externas/nuevo" className={`cursor-pointer ${BOTON_PRIMARIO}`}>
          + Nueva cuenta externa
        </EnlaceBoton>
      </div>

      <FiltroEnVivo className="mb-4 flex items-end gap-3">
        <label className="text-sm text-slate-600">
          Buscar
          <input type="text" name="q" placeholder="Nombre" defaultValue={filtroTexto ?? ''} className={ENTRADA} />
        </label>
        <button type="submit" className={`cursor-pointer ${BOTON_SECUNDARIO}`}>
          Filtrar
        </button>
        {filtroTexto && (
          <EnlaceBoton href="/admin/cuentas-externas" className={ENLACE}>
            Limpiar
          </EnlaceBoton>
        )}
      </FiltroEnVivo>

      {(cuentasExternas ?? []).length === 0 ? (
        <p className="text-sm text-slate-600">
          {filtroTexto ? 'Ninguna cuenta externa coincide con la búsqueda.' : 'Todavía no hay ninguna cuenta externa cargada.'}
        </p>
      ) : (
        <div className={TABLA_CONTENEDOR}>
          <table className="w-full text-sm">
            <thead>
              <tr className={TABLA_HEADER_FILA}>
                <th className={TABLA_HEADER_CELDA}>Nombre</th>
                <th className={TABLA_HEADER_CELDA}>Saldo</th>
                <th className={TABLA_HEADER_CELDA}></th>
              </tr>
            </thead>
            <tbody>
              {cuentasExternas!.map((cuentaExterna) => (
                <tr key={cuentaExterna.id} className={TABLA_FILA}>
                  <td className={TABLA_CELDA_PRINCIPAL}>{cuentaExterna.nombre}</td>
                  <td className={TABLA_CELDA}>{formatearSaldo(cuentaExterna.id)}</td>
                  <td className={TABLA_CELDA}>
                    <EnlaceBoton href={`/admin/cuentas-externas/${cuentaExterna.id}`} className={ENLACE_TABLA}>
                      Ver detalle
                    </EnlaceBoton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
