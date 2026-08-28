import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { notFound } from 'next/navigation'
import { calcularSaldoPorMoneda } from '@/lib/cuentas-externas/calcular-saldo'
import { actualizarCuentaExterna, agregarMovimiento, eliminarCuentaExterna } from '../actions'
import { BotonEliminarCuentaExterna } from '../BotonEliminarCuentaExterna'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import {
  ENTRADA,
  BOTON_PRIMARIO,
  ENLACE,
  TITULO_H1,
  TITULO_H2,
  BANNER_ERROR,
  BANNER_OK,
  TABLA_CONTENEDOR,
  TABLA_HEADER_FILA,
  TABLA_HEADER_CELDA,
  TABLA_FILA,
  TABLA_CELDA,
  TABLA_CELDA_PRINCIPAL,
} from '@/lib/ui/clases'

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
      <EnlaceBoton href="/admin/cuentas-externas" className={`mb-4 inline-block ${ENLACE}`}>
        ← Volver a Cuentas externas
      </EnlaceBoton>
      <h1 className={`mb-6 ${TITULO_H1}`}>{cuentaExterna!.nombre}</h1>
      {error && <p className={BANNER_ERROR}>{error}</p>}
      {ok && <p className={BANNER_OK}>Guardado.</p>}

      <h2 className={`mb-2 ${TITULO_H2}`}>Saldo</h2>
      {Object.keys(saldos).length === 0 ? (
        <p className="mb-6 text-sm text-slate-600">Sin movimientos todavía.</p>
      ) : (
        <p className="mb-6 text-sm">
          {Object.entries(saldos)
            .map(([moneda, monto]) => `${monto} ${moneda}`)
            .join(' / ')}
        </p>
      )}

      <h2 className={`mb-2 ${TITULO_H2}`}>Datos de transferencia</h2>
      <form action={actualizarCuentaExternaConId} className="mb-8 flex flex-col gap-3">
        <label className="text-sm text-slate-600">
          Nombre del destinatario
          <input name="nombre" defaultValue={cuentaExterna!.nombre} required className={`w-full ${ENTRADA}`} />
        </label>
        <label className="text-sm text-slate-600">
          Titular
          <input name="titular" defaultValue={cuentaExterna!.titular} required className={`w-full ${ENTRADA}`} />
        </label>
        <label className="text-sm text-slate-600">
          Alias
          <input name="alias" defaultValue={cuentaExterna!.alias} required className={`w-full ${ENTRADA}`} />
        </label>
        <label className="text-sm text-slate-600">
          Banco
          <input name="banco" defaultValue={cuentaExterna!.banco} required className={`w-full ${ENTRADA}`} />
        </label>
        <label className="text-sm text-slate-600">
          CBU (opcional)
          <input name="cbu" defaultValue={cuentaExterna!.cbu ?? ''} className={`w-full ${ENTRADA}`} />
        </label>
        <BotonEnvio className={`cursor-pointer self-start ${BOTON_PRIMARIO}`}>Guardar</BotonEnvio>
      </form>

      <h2 className={`mb-2 ${TITULO_H2}`}>Agregar movimiento</h2>
      <form action={agregarMovimientoConId} className="mb-8 flex max-w-sm flex-col gap-3">
        <label className="text-sm text-slate-600">
          Tipo
          <select name="tipo" defaultValue="debito" className={`w-full ${ENTRADA}`}>
            <option value="debito">Débito — le debemos nosotros a esta cuenta</option>
            <option value="credito">Crédito — esta cuenta nos debe a nosotros</option>
          </select>
        </label>
        <label className="text-sm text-slate-600">
          Monto
          <input name="monto" type="number" step="0.01" min="0" required className={`w-full ${ENTRADA}`} />
        </label>
        <label className="text-sm text-slate-600">
          Moneda
          <select name="moneda" defaultValue="USD" className={`w-full ${ENTRADA}`}>
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>
        </label>
        <label className="text-sm text-slate-600">
          Concepto
          <input
            name="concepto"
            required
            placeholder="Ej: Materiales de construcción, agosto 2026"
            className={`w-full ${ENTRADA}`}
          />
        </label>
        <BotonEnvio className={`cursor-pointer self-start ${BOTON_PRIMARIO}`}>Agregar movimiento</BotonEnvio>
      </form>

      <h2 className={`mb-2 ${TITULO_H2}`}>Movimientos</h2>
      {(movimientos ?? []).length === 0 ? (
        <p className="mb-8 text-sm text-slate-600">Sin movimientos todavía.</p>
      ) : (
        <div className={`mb-8 ${TABLA_CONTENEDOR}`}>
          <table className="w-full text-sm">
            <thead>
              <tr className={TABLA_HEADER_FILA}>
                <th className={TABLA_HEADER_CELDA}>Fecha</th>
                <th className={TABLA_HEADER_CELDA}>Tipo</th>
                <th className={TABLA_HEADER_CELDA}>Concepto</th>
                <th className={TABLA_HEADER_CELDA}>Monto</th>
              </tr>
            </thead>
            <tbody>
              {movimientos!.map((movimiento) => (
                <tr key={movimiento.id} className={TABLA_FILA}>
                  <td className={TABLA_CELDA_PRINCIPAL}>
                    {new Date(movimiento.created_at).toLocaleDateString('es-AR')}
                  </td>
                  <td className={TABLA_CELDA}>
                    {movimiento.tipo === 'debito' ? 'Débito (le debemos)' : 'Crédito (nos debe / le pagamos)'}
                  </td>
                  <td className={TABLA_CELDA}>{movimiento.concepto}</td>
                  <td className={TABLA_CELDA}>
                    {movimiento.monto} {movimiento.moneda}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className={`mb-2 ${TITULO_H2}`}>Eliminar</h2>
      <BotonEliminarCuentaExterna eliminarCuentaExternaAction={eliminarCuentaExternaConId} />
    </main>
  )
}
