import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { notFound } from 'next/navigation'
import { calcularSaldoPorMoneda } from '@/lib/cuentas-externas/calcular-saldo'
import { armarFilasDeMovimiento } from '@/lib/cuenta-corriente/filas-movimiento'
import {
  traerDatosDeLotes,
  traerDatosDeCuotasPorPago,
} from '@/lib/cuenta-corriente/traer-datos-planilla'
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
import {
  FormularioMovimientoManual,
  ETIQUETAS_CUENTA_EXTERNA,
} from '@/components/FormularioMovimientoManual'


// Una cuenta externa guarda 'debito'/'credito' con el sentido invertido
// respecto de la planilla de Nicolas: aca 'debito' es lo que TODAVIA le
// debemos (suma al saldo) y 'credito' es lo que ya le transferimos (resta).
// En la planilla es al reves: el credito es lo que le queda a favor.
//
// Se traduce en vez de renombrar la base: son dos vocabularios distintos y
// la pantalla tiene que hablar el de Nicolas, para que las dos cuentas
// corrientes (la de una persona y la de una cuenta externa) se lean igual.
function comoMovimientoDeCuentaCorriente(movimiento: {
  id: string
  tipo: 'debito' | 'credito'
  monto: number
  moneda: string
  concepto: string | null
  fecha_evento: string
  de_parte_de: string | null
  origen: string | null
  lote_id: string | null
  pago_id: string | null
}) {
  return {
    id: movimiento.id,
    tipo: (movimiento.tipo === 'debito' ? 'debe' : 'haber') as 'debe' | 'haber',
    monto: movimiento.monto,
    moneda: movimiento.moneda,
    cotizacion_dia: null,
    origen: movimiento.origen ?? 'transferencia_empresa',
    fecha_evento: movimiento.fecha_evento,
    de_parte_de: movimiento.de_parte_de,
    detalle: movimiento.concepto,
    lote_id: movimiento.lote_id,
    // Estos movimientos no apuntan a la cuota sino al pago: se le pasa el
    // pago como si fuera la cuota y el mapa viene indexado por pago_id.
    cuota_id: movimiento.pago_id,
  }
}

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
      'id, tipo, monto, moneda, concepto, fecha_evento, lote_id, de_parte_de, origen, created_at, pago_id'
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
    pago_id: string | null
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

  // Mismo formato de planilla que la cuenta corriente de una persona
  // (09/09), y la tabla que se ve es identica a la que se descarga.
  const adaptados = movimientosFiltrados.map(comoMovimientoDeCuentaCorriente)
  const filasPlanilla = armarFilasDeMovimiento(
    adaptados,
    await traerDatosDeLotes(
      supabase,
      adaptados.map((m) => m.lote_id).filter((id): id is string => Boolean(id))
    ),
    await traerDatosDeCuotasPorPago(
      supabase,
      adaptados.map((m) => m.cuota_id).filter((id): id is string => Boolean(id))
    )
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
                    <th className={TABLA_HEADER_CELDA}>Concepto</th>
                    <th className={TABLA_HEADER_CELDA}>Loteo</th>
                    <th className={TABLA_HEADER_CELDA}>Mza</th>
                    <th className={TABLA_HEADER_CELDA}>Lote</th>
                    <th className={TABLA_HEADER_CELDA}>Cliente</th>
                    <th className={TABLA_HEADER_CELDA}>Mes de</th>
                    <th className={TABLA_HEADER_CELDA}>Nro cuota</th>
                    <th className={`${TABLA_HEADER_CELDA} text-right`}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {filasPlanilla.map((fila) => (
                    <tr key={fila.id} className={TABLA_FILA}>
                      <td className={`${TABLA_CELDA_PRINCIPAL} tabular-nums`}>
                        {new Date(`${fila.fecha}T00:00:00`).toLocaleDateString('es-AR')}
                      </td>
                      <td className={TABLA_CELDA}>
                        <span
                          className={
                            fila.tipoMovimiento === 'crédito' ? 'text-emerald-700' : 'text-slate-600'
                          }
                        >
                          {fila.tipoMovimiento}
                        </span>
                      </td>
                      {/* El detalle va DEBAJO del concepto y no en un
                          tooltip: es lo que escribio una persona ("de:
                          Cliente 1", "Adelanto entregado en mano") y es la
                          unica explicacion de por que existe esa fila. En un
                          tooltip no se ve, no se busca con Ctrl+F y no se
                          lee en el celular. */}
                      <td className={TABLA_CELDA}>
                        {fila.concepto}
                        {fila.detalle && (
                          <span className="block text-xs text-slate-500">{fila.detalle}</span>
                        )}
                      </td>
                      <td className={TABLA_CELDA}>{fila.loteo || '—'}</td>
                      <td className={TABLA_CELDA}>{fila.manzana || '—'}</td>
                      <td className={TABLA_CELDA}>
                        {fila.loteId && fila.lote ? (
                          <EnlaceBoton href={`/admin/lotes/${fila.loteId}`} className={ENLACE_TABLA}>
                            {fila.lote}
                          </EnlaceBoton>
                        ) : (
                          fila.lote || '—'
                        )}
                      </td>
                      <td className={TABLA_CELDA}>{fila.cliente || '—'}</td>
                      <td className={TABLA_CELDA}>{fila.mesDe || '—'}</td>
                      <td className={`${TABLA_CELDA} tabular-nums`}>{fila.nroCuota || '—'}</td>
                      <td className={`${TABLA_CELDA} tabular-nums text-right whitespace-nowrap`}>
                        <span className={fila.monto < 0 ? 'text-slate-600' : 'text-emerald-700'}>
                          {fila.monto} {fila.moneda}
                        </span>
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
