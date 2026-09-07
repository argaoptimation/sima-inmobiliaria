import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { notFound } from 'next/navigation'
import { calcularSaldoPorMoneda } from '@/lib/cuentas-externas/calcular-saldo'
import { actualizarCuentaExterna, agregarMovimiento, eliminarCuentaExterna } from '../actions'
import { BotonEliminarCuentaExterna } from '../BotonEliminarCuentaExterna'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import { FiltroEnVivo } from '@/components/FiltroEnVivo'
import { Obligatorio } from '@/components/Obligatorio'
import {
  ENTRADA,
  BOTON_SECUNDARIO,
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
  ENLACE_TABLA,
} from '@/lib/ui/clases'
import { ETIQUETA_ORIGEN } from '@/lib/cuenta-corriente/etiquetas'
import {
  FormularioMovimientoManual,
  ETIQUETAS_CUENTA_EXTERNA,
} from '@/components/FormularioMovimientoManual'

export default async function CuentaExternaDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; ok?: string; desde?: string; hasta?: string }>
}) {
  await requireAdministrador()

  const { id } = await params
  const { error, ok, desde: filtroDesde, hasta: filtroHasta } = await searchParams

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

  const { data: movimientosData } = await supabase
    .from('cuentas_externas_movimientos')
    .select(
      'id, tipo, monto, moneda, concepto, fecha_evento, lote_id, de_parte_de, origen, created_at, lotes(identificador)'
    )
    .eq('cuenta_externa_id', id)
    .order('fecha_evento', { ascending: false })
    .order('created_at', { ascending: false })

  // Mismo cast que en la cuenta corriente de una persona: el tipo generado
  // trata el join como un array aunque la FK sea a-uno.
  const movimientos = (movimientosData ?? []) as unknown as Array<{
    id: string
    tipo: 'debito' | 'credito'
    monto: number
    moneda: string
    concepto: string | null
    fecha_evento: string
    lote_id: string | null
    de_parte_de: string | null
    origen: string | null
    created_at: string
    lotes: { identificador: string } | null
  }>

  // Para el formulario compartido: el buscador de lotes y las sugerencias de
  // "de quién vino la plata".
  const { data: lotes } = await supabase.from('lotes').select('id, identificador').order('identificador')

  const { data: personasParaSugerir } = await supabase
    .from('profiles')
    .select('full_name')
    .order('full_name')

  const nombresUnicosParaSugerir = [
    ...new Set((personasParaSugerir ?? []).map((persona) => persona.full_name)),
  ]

  const saldos = calcularSaldoPorMoneda(
    movimientos.map((m) => ({ tipo: m.tipo, monto: m.monto, moneda: m.moneda }))
  )

  // Filtro desde/hasta (04/09, pedido de Gabriel -- mismo patrón que
  // /admin/cuentas-corrientes): el saldo de arriba sigue calculado con TODOS
  // los movimientos, el filtro solo acota qué se lista abajo.
  //
  // Desde el 06/09 se filtra por `fecha_evento` (cuándo PASÓ el movimiento) y
  // no por `created_at` (cuándo se cargó): ya es un día de calendario, así que
  // no hace falta la conversión de zona horaria que necesitaba el timestamp.
  const movimientosFiltrados = movimientos.filter((movimiento) => {
    if (filtroDesde || filtroHasta) {
      const fecha = movimiento.fecha_evento
      if (filtroDesde && fecha < filtroDesde) return false
      if (filtroHasta && fecha > filtroHasta) return false
    }
    return true
  })
  const hayFiltrosActivos = Boolean(filtroDesde || filtroHasta)

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
          <Obligatorio />
          <input name="nombre" defaultValue={cuentaExterna!.nombre} required className={`w-full ${ENTRADA}`} />
        </label>
        <label className="text-sm text-slate-600">
          Titular
          <Obligatorio />
          <input name="titular" defaultValue={cuentaExterna!.titular} required className={`w-full ${ENTRADA}`} />
        </label>
        <label className="text-sm text-slate-600">
          Alias
          <Obligatorio />
          <input name="alias" defaultValue={cuentaExterna!.alias} required className={`w-full ${ENTRADA}`} />
        </label>
        <label className="text-sm text-slate-600">
          Banco
          <Obligatorio />
          <input name="banco" defaultValue={cuentaExterna!.banco} required className={`w-full ${ENTRADA}`} />
        </label>
        <label className="text-sm text-slate-600">
          CBU (opcional)
          <input name="cbu" defaultValue={cuentaExterna!.cbu ?? ''} className={`w-full ${ENTRADA}`} />
        </label>
        <BotonEnvio className={`cursor-pointer self-start ${BOTON_PRIMARIO}`}>Guardar</BotonEnvio>
      </form>

      {/* Exactamente el mismo formulario que la cuenta corriente de una
          persona (06/09, pedido de Gabriel). Habla en debe/haber y el server
          action lo traduce a débito/crédito, que es lo que guarda esta
          tabla. */}
      <h2 className={`mb-2 ${TITULO_H2}`}>Registrar movimiento manual</h2>
      <FormularioMovimientoManual
        agregarMovimientoManualAction={agregarMovimientoConId}
        nombresUnicosParaSugerir={nombresUnicosParaSugerir}
        lotes={lotes ?? []}
        etiquetas={ETIQUETAS_CUENTA_EXTERNA}
        idListaSugerencias="lista-personas-cuenta-externa"
      />

      <h2 className={`mb-2 ${TITULO_H2}`}>Movimientos</h2>
      <a
        href={`/admin/cuentas-externas/${id}/export?${new URLSearchParams({
          ...(filtroDesde ? { desde: filtroDesde } : {}),
          ...(filtroHasta ? { hasta: filtroHasta } : {}),
        }).toString()}`}
        className={`mb-3 inline-block ${ENLACE}`}
      >
        Descargar Excel →
      </a>
      {movimientos.length === 0 ? (
        <p className="mb-8 text-sm text-slate-600">Sin movimientos todavía.</p>
      ) : (
        <>
          <FiltroEnVivo className="mb-3 flex flex-wrap items-end gap-3">
            <label className="text-sm text-slate-600">
              Desde
              <input type="date" name="desde" defaultValue={filtroDesde ?? ''} className={ENTRADA} />
            </label>
            <label className="text-sm text-slate-600">
              Hasta
              <input type="date" name="hasta" defaultValue={filtroHasta ?? ''} className={ENTRADA} />
            </label>
            <button type="submit" className={`cursor-pointer ${BOTON_SECUNDARIO}`}>
              Filtrar
            </button>
            {hayFiltrosActivos && (
              <EnlaceBoton href={`/admin/cuentas-externas/${id}`} className={ENLACE}>
                Limpiar filtros
              </EnlaceBoton>
            )}
          </FiltroEnVivo>
          {movimientosFiltrados.length === 0 ? (
            <p className="mb-8 text-sm text-slate-600">Ningún movimiento coincide con los filtros.</p>
          ) : (
            <div className={`mb-8 max-h-[70vh] overflow-y-auto ${TABLA_CONTENEDOR}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={`${TABLA_HEADER_FILA} sticky top-0 z-10`}>
                    <th className={TABLA_HEADER_CELDA}>Fecha</th>
                    <th className={TABLA_HEADER_CELDA}>Tipo</th>
                    <th className={TABLA_HEADER_CELDA}>Origen</th>
                    <th className={TABLA_HEADER_CELDA}>Detalle</th>
                    <th className={TABLA_HEADER_CELDA}>Lote</th>
                    <th className={TABLA_HEADER_CELDA}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientosFiltrados.map((movimiento) => (
                    <tr key={movimiento.id} className={TABLA_FILA}>
                      <td className={TABLA_CELDA_PRINCIPAL}>
                        {new Date(`${movimiento.fecha_evento}T00:00:00`).toLocaleDateString('es-AR')}
                      </td>
                      <td className={TABLA_CELDA}>
                        {movimiento.tipo === 'debito' ? 'Débito' : 'Crédito'}
                      </td>
                      <td className={TABLA_CELDA}>
                        {movimiento.origen
                          ? (ETIQUETA_ORIGEN[movimiento.origen] ?? movimiento.origen)
                          : '—'}
                      </td>
                      <td className={TABLA_CELDA}>
                        {movimiento.concepto ?? '—'}
                        {movimiento.de_parte_de ? ` (de: ${movimiento.de_parte_de})` : ''}
                      </td>
                      <td className={TABLA_CELDA}>
                        {movimiento.lote_id && movimiento.lotes ? (
                          <EnlaceBoton href={`/admin/lotes/${movimiento.lote_id}`} className={ENLACE_TABLA}>
                            {movimiento.lotes.identificador}
                          </EnlaceBoton>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={TABLA_CELDA}>
                        {movimiento.monto} {movimiento.moneda}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <h2 className={`mb-2 ${TITULO_H2}`}>Eliminar</h2>
      <BotonEliminarCuentaExterna eliminarCuentaExternaAction={eliminarCuentaExternaConId} />
    </main>
  )
}
