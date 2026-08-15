'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'

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
      `/admin/cuentas-externas/nuevo?error=${encodeURIComponent(error?.message ?? 'error desconocido')}`
    )
  }

  const deudaInicialTexto = ((formData.get('deudaInicialMonto') as string) || '').trim()
  const deudaInicialMonto = deudaInicialTexto ? Number(deudaInicialTexto) : null

  if (deudaInicialMonto && deudaInicialMonto > 0) {
    const deudaInicialMoneda = (formData.get('deudaInicialMoneda') as string) || 'USD'
    const deudaInicialConcepto =
      ((formData.get('deudaInicialConcepto') as string) || '').trim() || 'Deuda inicial'

    const { error: errorMovimiento } = await supabase.from('cuentas_externas_movimientos').insert({
      cuenta_externa_id: cuentaExterna!.id,
      tipo: 'debito',
      monto: deudaInicialMonto,
      moneda: deudaInicialMoneda,
      concepto: deudaInicialConcepto,
      cargado_por: user!.id,
    })

    if (errorMovimiento) {
      redirect(
        `/admin/cuentas-externas/${cuentaExterna!.id}?error=${encodeURIComponent(
          `La cuenta se creó pero no se pudo cargar la deuda inicial: ${errorMovimiento.message}`
        )}`
      )
    }
  }

  redirect(`/admin/cuentas-externas/${cuentaExterna!.id}`)
}
