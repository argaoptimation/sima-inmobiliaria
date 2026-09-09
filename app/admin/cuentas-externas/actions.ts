'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'
import { mensajeDeError } from '@/lib/errores'
import { revalidarNotificaciones } from '@/lib/notificaciones/revalidar'

export async function crearCuentaExterna(formData: FormData) {
  await requireAdministrador()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const nombre = ((formData.get('nombre') as string) || '').trim()
  const titular = ((formData.get('titular') as string) || '').trim()
  const alias = ((formData.get('alias') as string) || '').trim()
  const banco = ((formData.get('banco') as string) || '').trim()
  const cbu = ((formData.get('cbu') as string) || '').trim() || null

  if (!nombre) {
    redirect(`/admin/cuentas-externas/nuevo?error=${encodeURIComponent('Ingresá un nombre')}`)
  }

  if (!tieneDatosTransferencia({ titular, alias, banco })) {
    redirect(
      `/admin/cuentas-externas/nuevo?error=${encodeURIComponent(
        'Titular, alias y banco son obligatorios'
      )}`
    )
  }

  const { data: cuentaExterna, error } = await supabase
    .from('cuentas_externas')
    .insert({ nombre, titular, alias, banco, cbu })
    .select('id')
    .single()

  if (error || !cuentaExterna) {
    redirect(
      `/admin/cuentas-externas/nuevo?error=${encodeURIComponent(mensajeDeError(error))}`
    )
  }

  const deudaInicialTexto = ((formData.get('deudaInicialMonto') as string) || '').trim()
  const deudaInicialMonto = deudaInicialTexto ? Number(deudaInicialTexto) : null

  if (deudaInicialMonto && deudaInicialMonto > 0) {
    const deudaInicialMoneda = (formData.get('deudaInicialMoneda') as string) || 'USD'
    const deudaInicialTipoRaw = (formData.get('deudaInicialTipo') as string) || 'debito'
    const deudaInicialTipo = deudaInicialTipoRaw === 'credito' ? 'credito' : 'debito'
    const deudaInicialConcepto =
      ((formData.get('deudaInicialConcepto') as string) || '').trim() ||
      (deudaInicialTipo === 'credito' ? 'Saldo inicial a favor nuestro' : 'Deuda inicial')

    const { error: errorMovimiento } = await supabase.from('cuentas_externas_movimientos').insert({
      cuenta_externa_id: cuentaExterna!.id,
      tipo: deudaInicialTipo,
      monto: deudaInicialMonto,
      moneda: deudaInicialMoneda,
      concepto: deudaInicialConcepto,
      cargado_por: user!.id,
    })

    if (errorMovimiento) {
      redirect(
        `/admin/cuentas-externas/${cuentaExterna!.id}?error=${encodeURIComponent(
          `La cuenta se creó pero no se pudo cargar la deuda inicial: ${mensajeDeError(errorMovimiento)}`
        )}`
      )
    }
  }

  redirect(`/admin/cuentas-externas/${cuentaExterna!.id}`)
}

export async function actualizarCuentaExterna(cuentaExternaId: string, formData: FormData) {
  await requireAdministrador()

  const nombre = ((formData.get('nombre') as string) || '').trim()
  const titular = ((formData.get('titular') as string) || '').trim()
  const alias = ((formData.get('alias') as string) || '').trim()
  const banco = ((formData.get('banco') as string) || '').trim()
  const cbu = ((formData.get('cbu') as string) || '').trim() || null

  if (!nombre) {
    redirect(
      `/admin/cuentas-externas/${cuentaExternaId}?error=${encodeURIComponent('Ingresá un nombre')}`
    )
  }

  if (!tieneDatosTransferencia({ titular, alias, banco })) {
    redirect(
      `/admin/cuentas-externas/${cuentaExternaId}?error=${encodeURIComponent(
        'Titular, alias y banco son obligatorios'
      )}`
    )
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('cuentas_externas')
    .update({ nombre, titular, alias, banco, cbu })
    .eq('id', cuentaExternaId)

  if (error) {
    redirect(
      `/admin/cuentas-externas/${cuentaExternaId}?error=${encodeURIComponent(mensajeDeError(error))}`
    )
  }

  // Misma razón que en usuarios: una cuenta externa sin alias/banco/titular
  // deja cuotas "sin dónde pagar" en la campana.
  revalidarNotificaciones()

  redirect(`/admin/cuentas-externas/${cuentaExternaId}?ok=1`)
}

export async function agregarMovimiento(cuentaExternaId: string, formData: FormData) {
  await requireAdministrador()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // El formulario es el mismo que el de la cuenta corriente de una persona
  // (06/09), así que habla en debe/haber. Acá se traduce al vocabulario que
  // guarda esta tabla: son la misma idea con otro nombre.
  //   debe  = le debemos nosotros   -> debito
  //   haber = le entró plata a ella -> credito
  const montoTexto = ((formData.get('monto') as string) || '').trim()
  const montoIngresado = montoTexto ? Number(montoTexto) : NaN
  const moneda = (formData.get('moneda') as string) || 'USD'
  const detalle = ((formData.get('detalle') as string) || '').trim() || null
  const esDebe = (formData.get('tipo') as string) === 'debe'
  const tipo = esDebe ? 'debito' : 'credito'
  const signo = (formData.get('signo') as string) || 'credito'
  const fechaEvento = ((formData.get('fechaEvento') as string) || '').trim()
  const deParteDe = ((formData.get('deParteDe') as string) || '').trim() || null
  const loteId = ((formData.get('loteId') as string) || '').trim() || null

  // El origen (cómo llegó la plata) solo tiene sentido para un crédito: un
  // débito es plata que le debemos, no que le llegó de algún lado.
  const origen = esDebe ? null : (formData.get('origen') as string) || ''

  if (!Number.isFinite(montoIngresado) || montoIngresado <= 0) {
    redirect(
      `/admin/cuentas-externas/${cuentaExternaId}?error=${encodeURIComponent(
        'Ingresá un monto válido, mayor a cero'
      )}`
    )
  }

  // El input siempre pide un número positivo (más simple de tipear que
  // "-500"): un débito de tipo "gasto/descuento" se guarda en negativo para
  // que reste del saldo. Mismo criterio que la cuenta corriente de una
  // persona.
  const monto = esDebe && signo === 'gasto' ? -montoIngresado : montoIngresado

  if (!esDebe && origen !== 'transferencia_empresa' && origen !== 'pago_directo_cliente') {
    redirect(
      `/admin/cuentas-externas/${cuentaExternaId}?error=${encodeURIComponent('Elegí un origen válido')}`
    )
  }

  if (esDebe && !detalle) {
    redirect(
      `/admin/cuentas-externas/${cuentaExternaId}?error=${encodeURIComponent(
        'Un débito necesita un detalle explicando el motivo (gasto, adelanto, descuento, etc.)'
      )}`
    )
  }

  if (!fechaEvento) {
    redirect(`/admin/cuentas-externas/${cuentaExternaId}?error=${encodeURIComponent('Ingresá la fecha')}`)
  }

  if (origen === 'pago_directo_cliente' && !deParteDe) {
    redirect(
      `/admin/cuentas-externas/${cuentaExternaId}?error=${encodeURIComponent(
        'Un pago directo del cliente necesita el nombre de quién lo hizo'
      )}`
    )
  }

  const { error } = await supabase.from('cuentas_externas_movimientos').insert({
    cuenta_externa_id: cuentaExternaId,
    tipo,
    monto,
    moneda,
    concepto: detalle,
    fecha_evento: fechaEvento,
    lote_id: loteId,
    de_parte_de: deParteDe,
    origen: origen || null,
    cargado_por: user!.id,
  })

  if (error) {
    redirect(
      `/admin/cuentas-externas/${cuentaExternaId}?error=${encodeURIComponent(mensajeDeError(error))}`
    )
  }

  redirect(`/admin/cuentas-externas/${cuentaExternaId}?ok=1`)
}

export async function eliminarCuentaExterna(cuentaExternaId: string) {
  await requireAdministrador()

  const supabase = await createClient()

  const { count: movimientos } = await supabase
    .from('cuentas_externas_movimientos')
    .select('id', { count: 'exact', head: true })
    .eq('cuenta_externa_id', cuentaExternaId)

  if (movimientos && movimientos > 0) {
    redirect(
      `/admin/cuentas-externas/${cuentaExternaId}?error=${encodeURIComponent(
        'No se puede eliminar: esta cuenta ya tiene movimientos'
      )}`
    )
  }

  // Cuotas que se le transfieren a esta cuenta. Desde el 08/09 el destino se
  // elige cuota por cuota, así que mirar solo el lote dejaba pasar el caso
  // normal.
  const { count: cuotasAsociadas } = await supabase
    .from('cuotas')
    .select('id', { count: 'exact', head: true })
    .eq('cuenta_cobro_externa_id', cuentaExternaId)

  if (cuotasAsociadas && cuotasAsociadas > 0) {
    redirect(
      `/admin/cuentas-externas/${cuentaExternaId}?error=${encodeURIComponent(
        'No se puede eliminar: está asignada como cuenta de cobro de alguna cuota'
      )}`
    )
  }

  const { count: lotesAsociados } = await supabase
    .from('lotes')
    .select('id', { count: 'exact', head: true })
    .eq('cuenta_cobro_externa_id', cuentaExternaId)

  if (lotesAsociados && lotesAsociados > 0) {
    redirect(
      `/admin/cuentas-externas/${cuentaExternaId}?error=${encodeURIComponent(
        'No se puede eliminar: está asignada como cuenta de cobro de algún lote'
      )}`
    )
  }

  const { count: comoParticipante } = await supabase
    .from('lote_participantes')
    .select('id', { count: 'exact', head: true })
    .eq('cuenta_externa_id', cuentaExternaId)

  if (comoParticipante && comoParticipante > 0) {
    redirect(
      `/admin/cuentas-externas/${cuentaExternaId}?error=${encodeURIComponent(
        'No se puede eliminar: está agregada como participante adicional de algún lote'
      )}`
    )
  }

  const { error } = await supabase.from('cuentas_externas').delete().eq('id', cuentaExternaId)

  if (error) {
    redirect(
      `/admin/cuentas-externas/${cuentaExternaId}?error=${encodeURIComponent(mensajeDeError(error))}`
    )
  }

  redirect('/admin/cuentas-externas')
}
