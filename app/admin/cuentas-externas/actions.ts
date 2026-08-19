'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'
import { mensajeDeError } from '@/lib/errores'

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

  redirect(`/admin/cuentas-externas/${cuentaExternaId}?ok=1`)
}

export async function agregarMovimiento(cuentaExternaId: string, formData: FormData) {
  await requireAdministrador()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const montoTexto = ((formData.get('monto') as string) || '').trim()
  const monto = montoTexto ? Number(montoTexto) : NaN
  const moneda = (formData.get('moneda') as string) || 'USD'
  const concepto = ((formData.get('concepto') as string) || '').trim()
  const tipo = (formData.get('tipo') as string) || 'debito'

  if (!Number.isFinite(monto) || monto <= 0) {
    redirect(
      `/admin/cuentas-externas/${cuentaExternaId}?error=${encodeURIComponent(
        'Ingresá un monto válido, mayor a cero'
      )}`
    )
  }

  if (tipo !== 'debito' && tipo !== 'credito') {
    redirect(`/admin/cuentas-externas/${cuentaExternaId}?error=${encodeURIComponent('Elegí un tipo válido')}`)
  }

  if (!concepto) {
    redirect(
      `/admin/cuentas-externas/${cuentaExternaId}?error=${encodeURIComponent('Ingresá un concepto')}`
    )
  }

  const { error } = await supabase.from('cuentas_externas_movimientos').insert({
    cuenta_externa_id: cuentaExternaId,
    tipo,
    monto,
    moneda,
    concepto,
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
