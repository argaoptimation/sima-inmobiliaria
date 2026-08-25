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
  const montoIngresado = montoTexto ? Number(montoTexto) : NaN
  const moneda = (formData.get('moneda') as string) || 'USD'
  const tipo = (formData.get('tipo') as string) === 'debe' ? 'debe' : 'haber'
  const origenForm = (formData.get('origen') as string) || ''
  const signo = (formData.get('signo') as string) || 'credito'
  const fechaEvento = ((formData.get('fechaEvento') as string) || '').trim()
  const deParteDe = ((formData.get('deParteDe') as string) || '').trim() || null
  const detalle = ((formData.get('detalle') as string) || '').trim() || null
  const loteId = ((formData.get('loteId') as string) || '').trim() || null

  // Debe manual (gasto, adelanto, descuento) es un origen fijo -- el
  // desplegable de "origen" (transferencia_empresa/pago_directo_cliente)
  // solo tiene sentido para Haber. El motivo puntual del Debe se explica
  // en el campo "Detalle", igual que ya se hace para el Haber.
  const origen = tipo === 'debe' ? 'debe_manual' : origenForm

  if (!Number.isFinite(montoIngresado) || montoIngresado <= 0) {
    redirect(
      `/admin/cuentas-corrientes/${profileId}?error=${encodeURIComponent(
        'Ingresá un monto válido, mayor a cero'
      )}`
    )
  }

  // El input siempre pide un número positivo (más simple para tipear que
  // pedir "-500") -- un Debe manual "gasto/descuento" se guarda en negativo
  // para que reste del saldo, un "crédito adicional" se guarda en positivo
  // para que sume, igual que ya hacen las correcciones automáticas
  // (reversion_cobro_cuota/ajuste_distribucion, que también aceptan signo).
  const monto = tipo === 'debe' && signo === 'gasto' ? -montoIngresado : montoIngresado

  if (tipo === 'haber' && origen !== 'transferencia_empresa' && origen !== 'pago_directo_cliente') {
    redirect(`/admin/cuentas-corrientes/${profileId}?error=${encodeURIComponent('Elegí un origen válido')}`)
  }

  if (tipo === 'debe' && !detalle) {
    redirect(
      `/admin/cuentas-corrientes/${profileId}?error=${encodeURIComponent(
        'Un Debe manual necesita un detalle explicando el motivo (gasto, adelanto, descuento, etc.)'
      )}`
    )
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
    tipo,
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
