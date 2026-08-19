'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { mensajeDeError } from '@/lib/errores'
import { obtenerCotizacionVigente } from '@/lib/cuenta-corriente/obtener-cotizacion-vigente'

export async function agregarMovimientoManual(profileId: string, formData: FormData) {
  await requireAdministrador()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const montoTexto = ((formData.get('monto') as string) || '').trim()
  const monto = montoTexto ? Number(montoTexto) : NaN
  const moneda = (formData.get('moneda') as string) || 'USD'
  const origen = (formData.get('origen') as string) || ''
  const fechaEvento = ((formData.get('fechaEvento') as string) || '').trim()
  const deParteDe = ((formData.get('deParteDe') as string) || '').trim() || null
  const detalle = ((formData.get('detalle') as string) || '').trim() || null
  const loteId = ((formData.get('loteId') as string) || '').trim() || null

  if (!Number.isFinite(monto) || monto <= 0) {
    redirect(
      `/admin/cuentas-corrientes/${profileId}?error=${encodeURIComponent(
        'Ingresá un monto válido, mayor a cero'
      )}`
    )
  }

  if (origen !== 'transferencia_empresa' && origen !== 'pago_directo_cliente') {
    redirect(`/admin/cuentas-corrientes/${profileId}?error=${encodeURIComponent('Elegí un origen válido')}`)
  }

  if (!fechaEvento) {
    redirect(`/admin/cuentas-corrientes/${profileId}?error=${encodeURIComponent('Ingresá la fecha')}`)
  }

  if (origen === 'pago_directo_cliente' && !deParteDe) {
    redirect(
      `/admin/cuentas-corrientes/${profileId}?error=${encodeURIComponent(
        'Un pago directo del cliente necesita el nombre de quién lo hizo'
      )}`
    )
  }

  const cotizacionDia = moneda === 'ARS' ? await obtenerCotizacionVigente(supabase, fechaEvento) : null

  const { error } = await supabase.from('movimientos_cuenta_corriente').insert({
    profile_id: profileId,
    tipo: 'haber',
    monto,
    moneda,
    cotizacion_dia: cotizacionDia,
    lote_id: loteId,
    origen,
    fecha_evento: fechaEvento,
    de_parte_de: deParteDe,
    detalle,
    cargado_por: user.id,
  })

  if (error) {
    redirect(
      `/admin/cuentas-corrientes/${profileId}?error=${encodeURIComponent(mensajeDeError(error))}`
    )
  }

  redirect(`/admin/cuentas-corrientes/${profileId}?ok=1`)
}
