import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { generarBoletoDesdeListado } from './actions'
import { hoyArgentina } from '@/lib/fecha/hoy-argentina'
import { FiltroEnVivo } from '@/components/FiltroEnVivo'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import { EncabezadoPagina } from '@/components/EncabezadoPagina'
import { Obligatorio } from '@/components/Obligatorio'
import {
  ENTRADA,
  BOTON_SECUNDARIO,
  ENLACE,
  ENLACE_TABLA,
  BANNER_ERROR,
  BANNER_OK,
  BADGE_BASE,
  BADGE_VERDE,
  BADGE_GRIS,
  BADGE_AMARILLO,
  TABLA_CONTENEDOR,
  TABLA_HEADER_FILA,
  TABLA_HEADER_CELDA,
  TABLA_FILA,
  TABLA_CELDA,
  TABLA_CELDA_PRINCIPAL,
} from '@/lib/ui/clases'

// Pantalla propia de boletos de compraventa (04/09, pedido de Gabriel):
// "que cada página tenga su parte específica". Junta en un solo lugar los
// lotes reservados o vendidos, con el comprador y su DNI, y deja generar el
// boleto sin tener que entrar lote por lote. El botón del detalle del lote
// sigue existiendo: los dos llaman a la misma función.
export default async function BoletosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; error?: string; ok?: string }>
}) {
  await requireAdministrador()

  const { q: filtroTexto, error, ok } = await searchParams

  const supabase = await createClient()

  const { data: lotes } = await supabase
    .from('lotes')
    .select('id, identificador, estado, loteo_id, cliente_id, loteos(nombre, plantilla_contrato_path)')
    .in('estado', ['reservado', 'vendido'])
    .order('identificador')

  const lotesTipados = (lotes ?? []) as unknown as Array<{
    id: string
    identificador: string
    estado: string
    loteo_id: string | null
    cliente_id: string | null
    loteos: { nombre: string; plantilla_contrato_path: string | null } | null
  }>

  const loteIds = lotesTipados.map((lote) => lote.id)

  // La identidad del comprador vive en dos lados según el estado: en
  // `reservas` mientras está reservado (todavía no hay usuario creado) y en
  // `profiles` una vez vendido. Se traen las dos y se prioriza el cliente.
  const admin = createAdminClient()

  const { data: reservas } =
    loteIds.length > 0
      ? await admin
          .from('reservas')
          .select('lote_id, nombre_completo, dni, instrumentacion, forma_pago, created_at')
          .in('lote_id', loteIds)
          .is('cancelada_at', null)
          .order('created_at', { ascending: false })
      : { data: [] }

  // Una fila por lote: la más reciente (vienen ordenadas por fecha desc).
  const reservaPorLote = new Map<
    string,
    { nombre_completo: string; dni: string; instrumentacion: string | null; forma_pago: string | null }
  >()
  for (const reserva of reservas ?? []) {
    if (!reservaPorLote.has(reserva.lote_id)) reservaPorLote.set(reserva.lote_id, reserva)
  }

  const clienteIds = [...new Set(lotesTipados.map((l) => l.cliente_id).filter(Boolean))] as string[]
  const { data: clientes } =
    clienteIds.length > 0
      ? await supabase.from('profiles').select('id, full_name, dni').in('id', clienteIds)
      : { data: [] }
  const clientePorId = new Map((clientes ?? []).map((c) => [c.id, c]))

  // Boletos ya generados por lote, para saber cuáles están pendientes.
  const { data: documentos } =
    loteIds.length > 0
      ? await supabase
          .from('lote_documentos')
          .select('lote_id, descripcion, created_at')
          .in('lote_id', loteIds)
          .like('descripcion', 'Contrato generado%')
          .order('created_at', { ascending: false })
      : { data: [] }

  const boletoPorLote = new Map<string, string>()
  for (const documento of documentos ?? []) {
    if (!boletoPorLote.has(documento.lote_id)) boletoPorLote.set(documento.lote_id, documento.descripcion)
  }

  const filas = lotesTipados
    .map((lote) => {
      const reserva = reservaPorLote.get(lote.id)
      const cliente = lote.cliente_id ? clientePorId.get(lote.cliente_id) : null
      return {
        ...lote,
        compradorNombre: cliente?.full_name ?? reserva?.nombre_completo ?? null,
        compradorDni: cliente?.dni ?? reserva?.dni ?? null,
        instrumentacion: reserva?.instrumentacion ?? null,
        formaPago: reserva?.forma_pago ?? null,
        boletoGenerado: boletoPorLote.get(lote.id) ?? null,
        tienePlantilla: Boolean(lote.loteos?.plantilla_contrato_path),
      }
    })
    .filter((fila) => {
      if (!filtroTexto) return true
      const texto = filtroTexto.toLowerCase()
      return (
        fila.identificador.toLowerCase().includes(texto) ||
        (fila.compradorNombre ?? '').toLowerCase().includes(texto) ||
        (fila.compradorDni ?? '').toLowerCase().includes(texto)
      )
    })

  const hoy = hoyArgentina()

  return (
    <main>
      <EncabezadoPagina titulo="Boletos de compraventa" migas={['Boletos de compraventa']} />

      {error && <p className={BANNER_ERROR}>{error}</p>}
      {ok && <p className={BANNER_OK}>{ok}</p>}

      <p className="mb-6 max-w-3xl text-sm text-slate-600">
        Todos los lotes reservados y vendidos, con su comprador. El boleto se genera solo al reservar
        cuando la instrumentación elegida es &quot;boleto&quot; y el lote tiene un loteo con plantilla
        cargada; acá podés generarlo (o volver a generarlo) a mano cuando haga falta. Los lotes que
        van a escritura directa no llevan boleto.
      </p>

      <FiltroEnVivo className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-600">
          Buscar por lote, comprador o DNI
          <input
            type="text"
            name="q"
            defaultValue={filtroTexto ?? ''}
            placeholder="Ej: 12345678 o Pérez"
            className={ENTRADA}
          />
        </label>
        <button type="submit" className={`cursor-pointer ${BOTON_SECUNDARIO}`}>
          Buscar
        </button>
        {filtroTexto && (
          <EnlaceBoton href="/admin/boletos" className={ENLACE}>
            Limpiar
          </EnlaceBoton>
        )}
      </FiltroEnVivo>

      {filas.length === 0 ? (
        <p className="text-sm text-slate-600">
          {filtroTexto
            ? 'Ningún lote coincide con la búsqueda.'
            : 'Todavía no hay lotes reservados ni vendidos.'}
        </p>
      ) : (
        <div className={TABLA_CONTENEDOR}>
          <table className="w-full text-sm">
            <thead>
              <tr className={TABLA_HEADER_FILA}>
                <th className={TABLA_HEADER_CELDA}>Lote</th>
                <th className={TABLA_HEADER_CELDA}>Comprador</th>
                <th className={TABLA_HEADER_CELDA}>DNI</th>
                <th className={TABLA_HEADER_CELDA}>Loteo</th>
                <th className={TABLA_HEADER_CELDA}>Instrumentación</th>
                <th className={TABLA_HEADER_CELDA}>Boleto</th>
                <th className={TABLA_HEADER_CELDA}></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => {
                const generarConId = generarBoletoDesdeListado.bind(null, fila.id)
                return (
                  <tr key={fila.id} className={TABLA_FILA}>
                    <td className={TABLA_CELDA_PRINCIPAL}>
                      <EnlaceBoton href={`/admin/lotes/${fila.id}`} className={ENLACE_TABLA}>
                        {fila.identificador}
                      </EnlaceBoton>
                      <span className="ml-2 text-xs text-slate-500">({fila.estado})</span>
                    </td>
                    <td className={TABLA_CELDA}>{fila.compradorNombre ?? '—'}</td>
                    <td className={TABLA_CELDA}>{fila.compradorDni ?? '—'}</td>
                    <td className={TABLA_CELDA}>
                      {fila.loteos?.nombre ?? <span className="text-amber-700">sin loteo</span>}
                    </td>
                    <td className={TABLA_CELDA}>
                      {fila.instrumentacion === 'boleto'
                        ? 'Boleto'
                        : fila.instrumentacion === 'escritura'
                          ? 'Escritura'
                          : '—'}
                      {fila.formaPago && (
                        <span className="block text-xs text-slate-500">
                          {fila.formaPago === 'financiado' ? 'Financiado' : 'Contado'}
                        </span>
                      )}
                    </td>
                    <td className={TABLA_CELDA}>
                      {fila.boletoGenerado ? (
                        <span className={`${BADGE_BASE} ${BADGE_VERDE}`}>Generado</span>
                      ) : fila.instrumentacion === 'escritura' ? (
                        <span className={`${BADGE_BASE} ${BADGE_GRIS}`}>No corresponde</span>
                      ) : (
                        <span className={`${BADGE_BASE} ${BADGE_AMARILLO}`}>Pendiente</span>
                      )}
                    </td>
                    <td className={TABLA_CELDA}>
                      {fila.tienePlantilla ? (
                        <form action={generarConId} className="flex items-end gap-2">
                          <label className="text-xs text-slate-500">
                            Fecha
                            <Obligatorio />
                            <input
                              type="date"
                              name="fechaContrato"
                              defaultValue={hoy}
                              required
                              className={`${ENTRADA} py-1.5 text-xs`}
                            />
                          </label>
                          <BotonEnvio className={`cursor-pointer ${ENLACE_TABLA}`}>
                            {fila.boletoGenerado ? 'Generar de nuevo' : 'Generar'}
                          </BotonEnvio>
                        </form>
                      ) : (
                        <span className="text-xs text-amber-700">
                          {fila.loteo_id
                            ? 'El loteo no tiene plantilla cargada'
                            : 'Asignale un loteo al lote primero'}
                        </span>
                      )}
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
