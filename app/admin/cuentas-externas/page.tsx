import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { resumirCuentaExternaPorMoneda } from '@/lib/cuentas-externas/situacion'
import { describirSituacion } from '@/lib/cuenta-corriente/situacion'
import { BotonVerDetalle } from '@/components/BotonVerDetalle'
import { FiltroEnVivo } from '@/components/FiltroEnVivo'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { EncabezadoPagina } from '@/components/EncabezadoPagina'
import {
  ENTRADA,
  BOTON_PRIMARIO,
  BOTON_SECUNDARIO,
  ENLACE,
  TABLA_CONTENEDOR,
  TABLA_HEADER_FILA,
  TABLA_HEADER_CELDA,
  TABLA_FILA,
  TABLA_CELDA,
  TABLA_CELDA_PRINCIPAL,
  NUMERO_TABULAR,
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

  // Las mismas tres cifras que muestra /admin/cuentas-corrientes (06/09):
  // una cuenta externa es una cuenta corriente con alguien que no tiene
  // login, así que se lee igual.
  function resumenDe(cuentaExternaId: string) {
    const propios = movimientosPorCuenta.get(cuentaExternaId) ?? []
    return resumirCuentaExternaPorMoneda(
      propios.map((m) => ({ tipo: m.tipo as 'debito' | 'credito', monto: m.monto, moneda: m.moneda }))
    )
  }

  return (
    <main>
      <EncabezadoPagina
        titulo="Cuentas externas"
        migas={['Cuentas externas']}
        acciones={
          <EnlaceBoton href="/admin/cuentas-externas/nuevo" className={`cursor-pointer ${BOTON_PRIMARIO}`}>
            + Nueva cuenta externa
          </EnlaceBoton>
        }
      />

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
                <th className={TABLA_HEADER_CELDA}>Le corresponde</th>
                <th className={TABLA_HEADER_CELDA}>Cobró directo</th>
                <th className={TABLA_HEADER_CELDA}>Cómo queda</th>
                <th className={TABLA_HEADER_CELDA}></th>
              </tr>
            </thead>
            <tbody>
              {cuentasExternas!.map((cuentaExterna) => {
                const resumen = resumenDe(cuentaExterna.id)
                const monedas = Object.keys(resumen).sort()

                return (
                  <tr key={cuentaExterna.id} className={TABLA_FILA}>
                    <td className={TABLA_CELDA_PRINCIPAL}>{cuentaExterna.nombre}</td>
                    <td className={`${TABLA_CELDA} ${NUMERO_TABULAR}`}>
                      {monedas.length === 0
                        ? '—'
                        : monedas.map((moneda) => (
                            <span key={moneda} className="block">
                              {resumen[moneda].leCorresponde} {moneda}
                            </span>
                          ))}
                    </td>
                    <td className={`${TABLA_CELDA} ${NUMERO_TABULAR}`}>
                      {monedas.length === 0
                        ? '—'
                        : monedas.map((moneda) => (
                            <span key={moneda} className="block">
                              {resumen[moneda].cobroDirecto} {moneda}
                            </span>
                          ))}
                    </td>
                    <td className={TABLA_CELDA}>
                      {monedas.length === 0 ? (
                        <span className="text-slate-500">Sin movimientos</span>
                      ) : (
                        monedas.map((moneda) => {
                          const saldo = resumen[moneda].saldo
                          return (
                            <span
                              key={moneda}
                              className={`block font-medium ${
                                saldo > 0
                                  ? 'text-amber-800'
                                  : saldo < 0
                                    ? 'text-blue-800'
                                    : 'text-green-700'
                              }`}
                            >
                              {describirSituacion(saldo, moneda)}
                            </span>
                          )
                        })
                      )}
                    </td>
                    <td className={TABLA_CELDA}>
                      <BotonVerDetalle
                        href={`/admin/cuentas-externas/${cuentaExterna.id}`}
                        titulo={`Ver la cuenta de ${cuentaExterna.nombre}`}
                      />
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
