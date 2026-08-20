import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calcularEstadoCobranza } from '@/lib/cobranza/estado-cliente'
import { calcularInteresMoratorio } from '@/lib/cobranza/interes-moratorio'
import { notFound, redirect } from 'next/navigation'
import { requireAdminOAcreedor } from '@/lib/auth/require-admin'
import {
  actualizarDatosGenerales,
  actualizarCobro,
  eliminarLote,
  subirDocumentoLote,
  eliminarDocumentoLote,
} from './actions'
import { agregarParticipante, quitarParticipante } from './participantes-actions'
import { cancelarReserva } from '../actions'
import { BotonEliminarLote } from './BotonEliminarLote'
import { BotonCancelarReserva } from '../BotonCancelarReserva'
import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'
import { telefonoParaWhatsApp } from '@/lib/telefono/prefijos'

export default async function LoteDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; editarUsuario?: string }>
}) {
  const { id } = await params
  const { error, editarUsuario } = await searchParams

  await requireAdminOAcreedor()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: perfilPropio } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  const { data: lote } = await supabase
    .from('lotes')
    .select(
      'id, identificador, moneda, estado, cliente_id, admin_id, acreedor_id, vendedor_id, cuenta_cobro_id, cuenta_cobro_externa_id, ubicacion, precio_total, documento_firmado_path, interes_moratorio_diario, indice_tipo'
    )
    .eq('id', id)
    .single()

  if (!lote) {
    notFound()
  }

  if (perfilPropio!.role === 'acreedor' && lote!.acreedor_id !== user!.id) {
    redirect('/admin/lotes')
  }

  let documentoFirmadoUrl: string | null = null
  if (lote!.documento_firmado_path) {
    const admin = createAdminClient()
    const { data: documentoSigned } = await admin.storage
      .from('comprobantes')
      .createSignedUrl(lote!.documento_firmado_path, 300)
    documentoFirmadoUrl = documentoSigned?.signedUrl ?? null
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

  const { data: reserva } = await supabase
    .from('reservas')
    .select(
      'nombre_completo, dni, domicilio, email, telefono_prefijo, telefono_numero, telefono_alternativo, estado_civil, instrumentacion, monto_sena, moneda_sena, recibido_por, recibido_por_otro, comprobante_sena_path, dni_frente_path, dni_dorso_path, dni_conyuge_path, sentencia_divorcio_path, created_at'
    )
    .eq('lote_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let reservaComprobanteUrl: string | null = null
  let reservaRecibidoPorNombre: string | null = null
  let reservaDniFrenteUrl: string | null = null
  let reservaDniDorsoUrl: string | null = null
  let reservaDniConyugeUrl: string | null = null
  let reservaSentenciaDivorcioUrl: string | null = null

  if (reserva) {
    const admin = createAdminClient()

    const { data: signedUrl } = await admin.storage
      .from('comprobantes')
      .createSignedUrl(reserva.comprobante_sena_path, 300)
    reservaComprobanteUrl = signedUrl?.signedUrl ?? null

    if (reserva.dni_frente_path) {
      const { data: dniFrenteSigned } = await admin.storage
        .from('comprobantes')
        .createSignedUrl(reserva.dni_frente_path, 300)
      reservaDniFrenteUrl = dniFrenteSigned?.signedUrl ?? null
    }

    if (reserva.dni_dorso_path) {
      const { data: dniDorsoSigned } = await admin.storage
        .from('comprobantes')
        .createSignedUrl(reserva.dni_dorso_path, 300)
      reservaDniDorsoUrl = dniDorsoSigned?.signedUrl ?? null
    }

    if (reserva.dni_conyuge_path) {
      const { data: dniConyugeSigned } = await admin.storage
        .from('comprobantes')
        .createSignedUrl(reserva.dni_conyuge_path, 300)
      reservaDniConyugeUrl = dniConyugeSigned?.signedUrl ?? null
    }

    if (reserva.sentencia_divorcio_path) {
      const { data: sentenciaSigned } = await admin.storage
        .from('comprobantes')
        .createSignedUrl(reserva.sentencia_divorcio_path, 300)
      reservaSentenciaDivorcioUrl = sentenciaSigned?.signedUrl ?? null
    }

    if (reserva.recibido_por) {
      const { data: persona } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', reserva.recibido_por)
        .single()
      reservaRecibidoPorNombre = persona?.full_name ?? null
    }
  }

  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name, role, alias, banco, titular')
    .in('role', ['administrador', 'acreedor', 'vendedor'])
    .order('full_name')

  const administradores = (staff ?? []).filter((persona) => persona.role === 'administrador')
  const acreedores = (staff ?? []).filter((persona) => persona.role === 'acreedor')
  const vendedores = (staff ?? []).filter((persona) => persona.role === 'vendedor')
  const conDatos = (staff ?? []).filter(
    (persona) =>
      tieneDatosTransferencia({ alias: persona.alias, banco: persona.banco, titular: persona.titular }) ||
      persona.id === lote!.cuenta_cobro_id
  )

  const { data: participantes } = await supabase
    .from('lote_participantes')
    .select('id, profile_id, cuenta_externa_id, etiqueta')
    .eq('lote_id', id)
    .order('created_at', { ascending: true })

  const profileIdsParticipantes = (participantes ?? [])
    .map((p) => p.profile_id)
    .filter((pid): pid is string => pid !== null)
  const cuentaExternaIdsParticipantes = (participantes ?? [])
    .map((p) => p.cuenta_externa_id)
    .filter((cid): cid is string => cid !== null)

  const { data: profilesParticipantes } =
    profileIdsParticipantes.length > 0
      ? await supabase.from('profiles').select('id, full_name, role').in('id', profileIdsParticipantes)
      : { data: [] }

  const { data: cuentasExternasParticipantes } =
    cuentaExternaIdsParticipantes.length > 0
      ? await supabase.from('cuentas_externas').select('id, nombre').in('id', cuentaExternaIdsParticipantes)
      : { data: [] }

  function nombreParticipante(participante: {
    profile_id: string | null
    cuenta_externa_id: string | null
  }) {
    if (participante.profile_id) {
      const persona = profilesParticipantes?.find((p) => p.id === participante.profile_id)
      return persona ? `${persona.full_name} (${persona.role})` : 'Persona eliminada'
    }
    const cuentaExterna = cuentasExternasParticipantes?.find(
      (c) => c.id === participante.cuenta_externa_id
    )
    return cuentaExterna ? `${cuentaExterna.nombre} (cuenta externa)` : 'Cuenta externa eliminada'
  }

  const participantesElegibles = (staff ?? []).filter(
    (persona) =>
      persona.id !== lote!.admin_id &&
      persona.id !== lote!.acreedor_id &&
      persona.id !== lote!.vendedor_id
  )

  const { data: cuentasExternas } = await supabase
    .from('cuentas_externas')
    .select('id, nombre')
    .order('nombre')

  const { data: documentos } = await supabase
    .from('lote_documentos')
    .select('id, path, descripcion, subido_por, created_at')
    .eq('lote_id', id)
    .order('created_at', { ascending: false })

  const subidoPorIds = [...new Set((documentos ?? []).map((d) => d.subido_por))]
  const { data: subidoPorPersonas } =
    subidoPorIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', subidoPorIds)
      : { data: [] }
  const nombreSubidoPorId = new Map((subidoPorPersonas ?? []).map((persona) => [persona.id, persona.full_name]))

  const adminDocumentos = createAdminClient()
  const documentosConUrl = await Promise.all(
    (documentos ?? []).map(async (documento) => {
      const { data: signedUrl } = await adminDocumentos.storage
        .from('comprobantes')
        .createSignedUrl(documento.path, 300)
      return {
        ...documento,
        url: signedUrl?.signedUrl ?? null,
        nombreSubidoPor: nombreSubidoPorId.get(documento.subido_por) ?? '—',
      }
    })
  )

  const actualizarDatosGeneralesConId = actualizarDatosGenerales.bind(null, id)

  const { data: indicesDisponibles } =
    lote!.moneda === 'ARS'
      ? await supabase.from('indices_valores').select('nombre')
      : { data: [] }
  const nombresIndicesDisponibles = [...new Set((indicesDisponibles ?? []).map((v) => v.nombre))].sort()
  const actualizarCobroConId = actualizarCobro.bind(null, id)
  const agregarParticipanteConId = agregarParticipante.bind(null, id)
  const eliminarLoteConId = eliminarLote.bind(null, id)
  const cancelarReservaConId = cancelarReserva.bind(null, id)
  const subirDocumentoConId = subirDocumentoLote.bind(null, id)

  return (
    <main className="max-w-2xl">
      <a href="/admin/lotes" className="mb-4 inline-block text-sm underline">
        ← Volver a Lotes
      </a>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{lote!.identificador}</h1>
        <div className="flex gap-2">
          {perfilPropio!.role === 'administrador' && lote!.estado === 'reservado' && (
            <>
              <a
                href={`/admin/lotes/${id}/reservar/editar`}
                className="rounded border px-3 py-2 text-sm underline"
              >
                Editar reserva →
              </a>
              <BotonCancelarReserva cancelarReservaAction={cancelarReservaConId} />
            </>
          )}
          {perfilPropio!.role === 'administrador' && (
            <BotonEliminarLote eliminarLoteAction={eliminarLoteConId} />
          )}
        </div>
      </div>

      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}

      <p className="mb-1 text-sm">Moneda: {lote!.moneda}</p>
      <p className="mb-1 text-sm">Estado: {lote!.estado}</p>
      {lote!.ubicacion && <p className="mb-1 text-sm">Ubicación: {lote!.ubicacion}</p>}
      {lote!.precio_total && (
        <p className="mb-1 text-sm">
          Precio total: {lote!.precio_total} {lote!.moneda}
        </p>
      )}
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

      {reserva && (
        <>
          <h2 className="mb-2 mt-6 text-lg font-semibold">Reserva</h2>
          <p className="mb-1 text-sm">Comprador: {reserva.nombre_completo}</p>
          <p className="mb-1 text-sm">DNI: {reserva.dni}</p>
          <p className="mb-1 text-sm">Domicilio: {reserva.domicilio}</p>
          <p className="mb-1 text-sm">
            Contacto: {reserva.email} · +
            {telefonoParaWhatsApp(reserva.telefono_prefijo, reserva.telefono_numero)}
            {reserva.telefono_alternativo && ` · ${reserva.telefono_alternativo}`}
          </p>
          <p className="mb-1 text-sm">Estado civil: {reserva.estado_civil}</p>
          {reserva.instrumentacion && (
            <p className="mb-1 text-sm">Instrumentación prevista: {reserva.instrumentacion}</p>
          )}
          <p className="mb-1 text-sm font-medium">
            Seña: {reserva.monto_sena} {reserva.moneda_sena}
          </p>
          <p className="mb-1 text-sm">
            Recibida por: {reservaRecibidoPorNombre ?? reserva.recibido_por_otro}
          </p>
          <p className="mb-4 text-sm">
            {reservaComprobanteUrl ? (
              <a href={reservaComprobanteUrl} target="_blank" className="underline">
                Ver comprobante de la seña
              </a>
            ) : (
              <span className="text-gray-500">Comprobante no disponible</span>
            )}
          </p>
          <p className="mb-1 text-sm">
            {reservaDniFrenteUrl ? (
              <a href={reservaDniFrenteUrl} target="_blank" className="underline">
                Ver DNI (frente)
              </a>
            ) : (
              <span className="text-gray-500">DNI (frente) no disponible</span>
            )}
          </p>
          <p className="mb-1 text-sm">
            {reservaDniDorsoUrl ? (
              <a href={reservaDniDorsoUrl} target="_blank" className="underline">
                Ver DNI (dorso)
              </a>
            ) : (
              <span className="text-gray-500">DNI (dorso) no disponible</span>
            )}
          </p>
          {reserva.dni_conyuge_path && (
            <p className="mb-1 text-sm">
              {reservaDniConyugeUrl ? (
                <a href={reservaDniConyugeUrl} target="_blank" className="underline">
                  Ver DNI del cónyuge
                </a>
              ) : (
                <span className="text-gray-500">DNI del cónyuge no disponible</span>
              )}
            </p>
          )}
          {reserva.sentencia_divorcio_path && (
            <p className="mb-4 text-sm">
              {reservaSentenciaDivorcioUrl ? (
                <a href={reservaSentenciaDivorcioUrl} target="_blank" className="underline">
                  Ver sentencia de divorcio
                </a>
              ) : (
                <span className="text-gray-500">Sentencia de divorcio no disponible</span>
              )}
            </p>
          )}
        </>
      )}

      {lote!.estado === 'vendido' && (
        <p className="mb-4 text-sm">
          {documentoFirmadoUrl ? (
            <a href={documentoFirmadoUrl} target="_blank" className="underline">
              Ver documento firmado
            </a>
          ) : (
            <span className="text-gray-500">Documento firmado no disponible</span>
          )}
        </p>
      )}

      <h2 className="mb-2 mt-6 text-lg font-semibold">Cuotas</h2>
      {perfilPropio!.role === 'administrador' && lote!.estado === 'vendido' && (
        <p className="mb-2 text-sm">
          <a href={`/admin/lotes/${id}/distribucion`} className="underline">
            Ver / editar distribución de cuotas →
          </a>
        </p>
      )}
      {lote!.estado !== 'vendido' && (
        <p className="mb-2 text-sm text-amber-700">
          Este lote todavía no está vendido — la tabla de abajo es la estructura de cuotas
          planificada, no una deuda real. Todavía no hay ningún cliente que la deba, así que
          ninguna cuota puede estar &quot;vencida&quot; hasta que el lote pase a vendido.
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Cuota</th>
            <th>Vencimiento</th>
            <th>Monto base</th>
            <th>Saldo pendiente</th>
            <th>Interés moratorio</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {cuotas?.map((cuota) => {
            const vencida =
              lote!.estado === 'vendido' && cuota.saldo_pendiente > 0 && cuota.fecha_vencimiento < hoy
            const interesMoratorio = vencida
              ? calcularInteresMoratorio(
                  { saldoPendiente: cuota.saldo_pendiente, fechaVencimiento: cuota.fecha_vencimiento },
                  lote!.interes_moratorio_diario,
                  hoy
                )
              : 0
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
                <td>
                  {interesMoratorio > 0 && (
                    <span className="text-red-700">
                      +{interesMoratorio} {lote!.moneda}
                    </span>
                  )}
                </td>
                <td>{vencida && <span className="text-red-700">Vencida</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Datos generales</h2>
      <form action={actualizarDatosGeneralesConId} className="mb-8 flex flex-col gap-3">
        <label className="text-sm">
          Identificador
          <input
            name="identificador"
            defaultValue={lote!.identificador}
            required
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Ubicación
          <input
            name="ubicacion"
            defaultValue={lote!.ubicacion ?? ''}
            placeholder="Ej: Loteo San Martín, Manzana 3"
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Precio total del lote
          <input
            name="precioTotal"
            type="number"
            step="0.01"
            min="0"
            defaultValue={lote!.precio_total ?? ''}
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        {lote!.moneda === 'ARS' && (
          <label className="text-sm">
            Índice de ajuste (opcional — solo para lotes en pesos)
            <select
              name="indiceTipo"
              defaultValue={lote!.indice_tipo ?? ''}
              className="mt-1 block w-full rounded border px-3 py-2"
            >
              <option value="">— sin índice —</option>
              {nombresIndicesDisponibles.map((nombre) => (
                <option key={nombre} value={nombre}>
                  {nombre}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-gray-500">
              Si elegís un índice, las cuotas de este lote se ajustan solas cada mes con el valor
              que se cargue en{' '}
              <a href="/admin/indices" className="underline">
                Índices
              </a>
              . Los índices disponibles acá son los que ya se cargaron al menos una vez ahí.
            </span>
          </label>
        )}
        <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
          Guardar
        </button>
      </form>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Documentos</h2>
      {documentosConUrl.length === 0 ? (
        <p className="mb-3 text-sm text-gray-600">Todavía no se subió ningún documento.</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-2">
          {documentosConUrl.map((documento) => {
            const eliminarDocumentoConId = eliminarDocumentoLote.bind(null, documento.id, id)
            return (
              <li key={documento.id} className="flex items-center gap-3 text-sm">
                {documento.url ? (
                  <a href={documento.url} target="_blank" className="underline">
                    {documento.descripcion}
                  </a>
                ) : (
                  <span>{documento.descripcion} (link no disponible)</span>
                )}
                <span className="text-gray-500">— subido por {documento.nombreSubidoPor}</span>
                <form action={eliminarDocumentoConId}>
                  <button type="submit" className="text-sm text-red-700 underline">
                    Eliminar
                  </button>
                </form>
              </li>
            )
          })}
        </ul>
      )}
      <form action={subirDocumentoConId} className="mb-8 flex flex-col gap-3">
        <label className="text-sm">
          Descripción
          <input
            name="descripcion"
            placeholder="Ej: Plano del lote"
            required
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Archivo
          <input name="archivo" type="file" required className="mt-1 block w-full rounded border px-3 py-2" />
        </label>
        <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
          Subir documento
        </button>
      </form>

      {perfilPropio!.role === 'administrador' && (
        <>
          <h2 className="mb-2 text-lg font-semibold">Cobro</h2>
          <p className="mb-3 text-sm text-gray-600">
            Asigná quiénes son el admin, el acreedor y el vendedor de este lote, y cuál de ellos
            recibe las transferencias actualmente. Solo se puede elegir como cuenta de cobro a
            alguien que ya tenga datos de transferencia cargados
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
                {!tieneDatosTransferencia({ alias: persona.alias, banco: persona.banco, titular: persona.titular }) &&
                  ' — sin datos de transferencia'}
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
                {!tieneDatosTransferencia({ alias: persona.alias, banco: persona.banco, titular: persona.titular }) &&
                  ' — sin datos de transferencia'}
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
                {!tieneDatosTransferencia({ alias: persona.alias, banco: persona.banco, titular: persona.titular }) &&
                  ' — sin datos de transferencia'}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Cuenta de cobro actual
          <select
            name="cuentaCobroId"
            defaultValue={
              lote!.cuenta_cobro_externa_id
                ? `externa:${lote!.cuenta_cobro_externa_id}`
                : (lote!.cuenta_cobro_id ?? '')
            }
            className="mt-1 block w-full rounded border px-3 py-2"
          >
            <option value="">— sin asignar —</option>
            {conDatos.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.full_name} ({persona.role})
                {!tieneDatosTransferencia({ alias: persona.alias, banco: persona.banco, titular: persona.titular }) &&
                  ' — sin datos de transferencia'}
              </option>
            ))}
            {(cuentasExternas ?? []).map((cuentaExterna) => (
              <option key={cuentaExterna.id} value={`externa:${cuentaExterna.id}`}>
                {cuentaExterna.nombre} (cuenta externa)
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
          Guardar cobro
        </button>
          </form>

          <h2 className="mb-2 mt-8 text-lg font-semibold">Participantes adicionales</h2>
          <p className="mb-3 text-sm text-gray-600">
            Gente que comparte la comisión de este lote sin ser el admin, el acreedor ni el vendedor
            principal (ej. un segundo vendedor). Los montos que cobra cada uno se cargan cuota por
            cuota en{' '}
            {lote!.estado === 'vendido' ? (
              <a href={`/admin/lotes/${id}/distribucion`} className="underline">
                la distribución de cuotas
              </a>
            ) : (
              'la distribución de cuotas'
            )}
            .
          </p>
          {(participantes ?? []).length === 0 ? (
            <p className="mb-4 text-sm text-gray-600">Sin participantes adicionales todavía.</p>
          ) : (
            <ul className="mb-4 flex flex-col gap-2">
              {participantes!.map((participante) => (
                <li key={participante.id} className="flex items-center justify-between text-sm">
                  <span>
                    {nombreParticipante(participante)}
                    {participante.etiqueta && ` — ${participante.etiqueta}`}
                  </span>
                  <form action={quitarParticipante.bind(null, id, participante.id)}>
                    <button type="submit" className="text-red-700 underline">
                      Quitar
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form action={agregarParticipanteConId} className="flex max-w-sm flex-col gap-3">
            <label className="text-sm">
              Agregar participante
              <select name="participanteId" className="mt-1 block w-full rounded border px-3 py-2">
                <option value="">— elegir —</option>
                {participantesElegibles.map((persona) => (
                  <option key={persona.id} value={persona.id}>
                    {persona.full_name} ({persona.role})
                  </option>
                ))}
                {(cuentasExternas ?? []).map((cuentaExterna) => (
                  <option key={cuentaExterna.id} value={`externa:${cuentaExterna.id}`}>
                    {cuentaExterna.nombre} (cuenta externa)
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Etiqueta (opcional)
              <input
                name="etiqueta"
                placeholder="Ej: Vendedor 2"
                className="mt-1 block w-full rounded border px-3 py-2"
              />
            </label>
            <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
              Agregar participante
            </button>
          </form>
        </>
      )}
    </main>
  )
}
