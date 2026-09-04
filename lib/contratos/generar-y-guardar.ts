import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { armarDatosContrato } from '@/lib/contratos/armar-datos-contrato'
import { generarContrato, ErrorPlantillaContrato } from '@/lib/contratos/generar-contrato'
import { mensajeDeError } from '@/lib/errores'

export type ResultadoContrato = { ok: true; path: string } | { ok: false; error: string }

// Genera el .docx del contrato de un lote y lo guarda como documento del
// lote. Extraído de generarContratoLote (04/09) para poder llamarlo desde
// tres lugares con políticas distintas de manejo de error:
//   - el botón del detalle del lote y la pantalla de Boletos, que muestran
//     el error en pantalla;
//   - la reserva, que lo genera automáticamente y NO puede romper el flujo
//     si algo falla (la reserva ya quedó tomada).
// Por eso devuelve un resultado en vez de hacer redirect: quién llama
// decide qué hacer con el error.
//
// La autorización queda afuera a propósito: cada caller ya la resolvió
// (requireAdminSobreLote en el detalle, requireAccesoParaReservar en la
// reserva).
export async function generarYGuardarContrato({
  loteId,
  fechaContrato,
  userId,
}: {
  loteId: string
  fechaContrato: string
  userId: string
}): Promise<ResultadoContrato> {
  const supabase = await createClient()

  const { data: lote } = await supabase
    .from('lotes')
    .select(
      'identificador, moneda, cliente_id, acreedor_id, loteo_id, ciclo_actual, ubicacion, precio_total, numero_lote, manzana, superficie_m2, cuenta_rentas, nomenclatura_catastral, matricula, interes_moratorio_diario'
    )
    .eq('id', loteId)
    .single()

  if (!lote) {
    return { ok: false, error: 'No se encontró el lote' }
  }

  if (!lote.loteo_id) {
    return {
      ok: false,
      error:
        'Este lote no tiene un loteo asignado -- asignale uno primero para poder generar el contrato.',
    }
  }

  const { data: loteo } = await supabase
    .from('loteos')
    .select('plantilla_contrato_path')
    .eq('id', lote.loteo_id)
    .single()

  if (!loteo?.plantilla_contrato_path) {
    return {
      ok: false,
      error:
        'El loteo de este lote todavía no tiene una plantilla de contrato cargada (se carga desde /admin/loteos).',
    }
  }

  const admin = createAdminClient()

  const [
    { data: acreedor },
    { data: cliente },
    { data: cuotas },
    { data: reserva },
    { data: plantillaBlob, error: errorDescarga },
  ] = await Promise.all([
    lote.acreedor_id
      ? supabase.from('profiles').select('full_name, dni, domicilio').eq('id', lote.acreedor_id).single()
      : Promise.resolve({ data: null }),
    lote.cliente_id
      ? supabase.from('profiles').select('full_name, dni, domicilio, email').eq('id', lote.cliente_id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from('cuotas')
      .select('numero, monto_base, fecha_vencimiento')
      .eq('lote_id', loteId)
      .eq('ciclo', lote.ciclo_actual)
      .order('numero', { ascending: true }),
    // Datos de la seña -- monto SIEMPRE, y también nombre/DNI/domicilio/
    // email del RESERVANTE cuando el lote todavía está en "reservado"
    // (04/09): en ese estado `lote.cliente_id` sigue en null, la identidad
    // de la persona vive en la reserva, no en `profiles`.
    supabase
      .from('reservas')
      .select('monto_sena, nombre_completo, dni, domicilio, email')
      .eq('lote_id', loteId)
      .is('cancelada_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.storage.from('comprobantes').download(loteo.plantilla_contrato_path),
  ])

  if (errorDescarga || !plantillaBlob) {
    return { ok: false, error: 'No se pudo descargar la plantilla del loteo. Probá de nuevo.' }
  }

  if (!cliente && !reserva) {
    return { ok: false, error: 'Este lote todavía no tiene un cliente ni una reserva asociada.' }
  }

  const primeraCuota = (cuotas ?? [])[0] ?? null

  const datosContrato = armarDatosContrato({
    fechaContrato,
    acreedorNombre: acreedor?.full_name ?? null,
    acreedorDni: acreedor?.dni ?? null,
    acreedorDomicilio: acreedor?.domicilio ?? null,
    clienteNombre: cliente?.full_name ?? reserva!.nombre_completo,
    clienteDni: cliente?.dni ?? reserva?.dni ?? null,
    clienteDomicilio: cliente?.domicilio ?? reserva?.domicilio ?? null,
    clienteEmail: cliente?.email ?? reserva?.email ?? null,
    loteIdentificador: lote.identificador,
    numeroLote: lote.numero_lote,
    manzana: lote.manzana,
    ubicacion: lote.ubicacion,
    superficieM2: lote.superficie_m2,
    cuentaRentas: lote.cuenta_rentas,
    nomenclaturaCatastral: lote.nomenclatura_catastral,
    matricula: lote.matricula,
    moneda: lote.moneda,
    precioTotal: lote.precio_total,
    montoSena: reserva?.monto_sena ?? null,
    cantidadCuotas: (cuotas ?? []).length,
    montoCuota: primeraCuota?.monto_base ?? null,
    primeraCuotaFecha: primeraCuota?.fecha_vencimiento ?? null,
    interesMoratorioDiario: lote.interes_moratorio_diario,
  })

  const plantillaBuffer = Buffer.from(await plantillaBlob.arrayBuffer())

  let contratoBuffer: Buffer
  try {
    contratoBuffer = generarContrato(plantillaBuffer, datosContrato)
  } catch (error) {
    return {
      ok: false,
      error: error instanceof ErrorPlantillaContrato ? error.message : 'No se pudo generar el contrato.',
    }
  }

  const path = `lotes/${loteId}/contrato-generado-${Date.now()}.docx`
  const { error: errorSubida } = await admin.storage.from('comprobantes').upload(path, contratoBuffer, {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })

  if (errorSubida) {
    return { ok: false, error: 'El contrato se generó pero no se pudo guardar. Probá de nuevo.' }
  }

  const { error: errorInsert } = await admin.from('lote_documentos').insert({
    lote_id: loteId,
    path,
    descripcion: `Contrato generado (${fechaContrato})`,
    subido_por: userId,
  })

  if (errorInsert) {
    return { ok: false, error: mensajeDeError(errorInsert) }
  }

  return { ok: true, path }
}
