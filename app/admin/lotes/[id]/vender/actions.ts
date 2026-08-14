'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { calcularMontoCuota } from '@/lib/lotes/calcular-monto-cuota'
import { generarCuotas } from '@/lib/lotes/generar-cuotas'
import { imputarPagoFIFO } from '@/lib/pagos/imputar-fifo'

export async function venderLote(loteId: string, formData: FormData) {
  await requireAdministrador()

  const email = ((formData.get('email') as string) || '').trim()
  const fullName = ((formData.get('fullName') as string) || '').trim()
  const cantidadCuotas = Number(formData.get('cantidadCuotas'))
  const fechaPrimeraCuota = formData.get('fechaPrimeraCuota') as string

  if (!email || !fullName) {
    redirect(
      `/admin/lotes/${loteId}/vender?error=${encodeURIComponent('Completá nombre y email del comprador')}`
    )
  }

  if (!Number.isInteger(cantidadCuotas) || cantidadCuotas < 1) {
    redirect(
      `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(
        'La cantidad de cuotas tiene que ser un número entero, mínimo 1'
      )}`
    )
  }

  if (!fechaPrimeraCuota) {
    redirect(
      `/admin/lotes/${loteId}/vender?error=${encodeURIComponent('Ingresá la fecha de la primera cuota')}`
    )
  }

  const supabase = await createClient()
  const {
    data: { user: adminUser },
  } = await supabase.auth.getUser()

  const admin = createAdminClient()

  const { data: loteActual, error: errorLoteActual } = await admin
    .from('lotes')
    .select('estado, precio_total, moneda')
    .eq('id', loteId)
    .single()

  if (errorLoteActual || !loteActual) {
    redirect(`/admin/lotes/${loteId}/vender?error=${encodeURIComponent('Lote no encontrado')}`)
  }

  if (loteActual!.estado !== 'reservado') {
    redirect(
      `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(
        `Este lote no está en estado reservado (estado actual: ${loteActual!.estado}), no se puede vender`
      )}`
    )
  }

  if (!loteActual!.precio_total) {
    redirect(
      `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(
        'El lote no tiene precio total cargado, no se puede vender'
      )}`
    )
  }

  const { data: clienteExistente } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('email', email)
    .eq('role', 'cliente')
    .maybeSingle()

  let clienteId: string

  if (clienteExistente) {
    // El comprador ya tiene cuenta (compró otro lote antes) -- se reusa la
    // misma cuenta en vez de invitar de nuevo (rompería con "duplicate key"
    // contra profiles_pkey) o crear una segunda cuenta para la misma
    // persona. No se toca su full_name existente para no pisarlo si el
    // nombre tipeado esta vez difiere levemente.
    //
    // Antes de asociar el lote, se exige una confirmación explícita del
    // admin: si tipeó mal el email, este chequeo podría enganchar el lote a
    // la cuenta de OTRA persona real sin que nadie lo note. El primer
    // submit nunca trae `confirmarClienteExistente` todavía, así que
    // siempre se corta acá la primera vez y se le muestra al admin el
    // nombre real de la cuenta encontrada antes de completar la venta.
    const confirmado = (formData.get('confirmarClienteExistente') as string) === clienteExistente.id

    if (!confirmado) {
      const params = new URLSearchParams({
        confirmarClienteId: clienteExistente.id,
        nombreEncontrado: clienteExistente.full_name ?? '',
        fullName,
        email,
        cantidadCuotas: String(cantidadCuotas),
        fechaPrimeraCuota,
      })
      redirect(`/admin/lotes/${loteId}/vender?${params.toString()}`)
    }

    clienteId = clienteExistente.id
  } else {
    const { data: invited, error: errorInvite } = await admin.auth.admin.inviteUserByEmail(email)

    if (errorInvite || !invited.user) {
      redirect(
        `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(errorInvite?.message ?? 'error desconocido')}`
      )
    }

    const { error: errorProfile } = await admin.from('profiles').insert({
      id: invited.user.id,
      role: 'cliente',
      full_name: fullName,
      email,
    })

    if (errorProfile) {
      redirect(`/admin/lotes/${loteId}/vender?error=${encodeURIComponent(errorProfile.message)}`)
    }

    clienteId = invited.user.id
  }

  const precioTotal = loteActual!.precio_total as number
  const montoCuotaBase = calcularMontoCuota(precioTotal, cantidadCuotas)
  const cuotas = generarCuotas(cantidadCuotas, montoCuotaBase, fechaPrimeraCuota, precioTotal)

  // Claim atomico: solo vende si el lote SIGUE reservado en este instante
  // (mismo patron que reservarLote / cancelarReserva). Si esto no pega, ya
  // se invito y se creo el profile del cliente igual — caso raro (alguien
  // mas cancelo la reserva en el instante exacto entre el chequeo de arriba
  // y este update); se reporta como error y queda para revision manual del
  // admin, no se intenta revertir la invitacion ya enviada.
  const { data: loteActualizado, error: errorVenta } = await admin
    .from('lotes')
    .update({
      estado: 'vendido',
      cliente_id: clienteId,
      cantidad_cuotas: cantidadCuotas,
      monto_cuota_base: montoCuotaBase,
      fecha_primera_cuota: fechaPrimeraCuota,
    })
    .eq('id', loteId)
    .eq('estado', 'reservado')
    .select('id')
    .single()

  if (errorVenta || !loteActualizado) {
    redirect(
      `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(
        'Este lote dejó de estar reservado justo antes de confirmar la venta. Ya se invitó al cliente — revisalo manualmente antes de reintentar.'
      )}`
    )
  }

  const { data: cuotasCreadas, error: errorCuotas } = await admin
    .from('cuotas')
    .insert(
      cuotas.map((cuota) => ({
        lote_id: loteId,
        numero: cuota.numero,
        monto_base: cuota.montoBase,
        saldo_pendiente: cuota.montoBase,
        fecha_vencimiento: cuota.fechaVencimiento,
      }))
    )
    .select('id, numero, saldo_pendiente')

  if (errorCuotas || !cuotasCreadas) {
    redirect(
      `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(
        errorCuotas?.message ?? 'error desconocido'
      )}`
    )
  }

  // Descuento de la seña de la reserva en las cuotas recien generadas: si
  // hay una reserva activa con seña > 0 en la misma moneda del lote, se
  // registra como un pago ya confirmado (la seña ya se verifico al
  // reservar, con su propio comprobante) y se reparte en cascada con el
  // mismo FIFO que un pago normal. Si la moneda de la seña difiere de la
  // del lote, no se descuenta nada automatico -- mismo criterio de "sin
  // conversion de moneda" que el resto del proyecto.
  const { data: reserva } = await admin
    .from('reservas')
    .select('monto_sena, moneda_sena, comprobante_sena_path')
    .eq('lote_id', loteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (reserva && reserva.monto_sena > 0 && reserva.moneda_sena === loteActual!.moneda) {
    const { data: pagoSena, error: errorPagoSena } = await admin
      .from('pagos')
      .insert({
        cliente_id: clienteId,
        lote_id: loteId,
        monto: reserva.monto_sena,
        moneda: reserva.moneda_sena,
        comprobante_path: reserva.comprobante_sena_path,
        motivo: 'sena',
        estado: 'confirmado',
        confirmado_admin_por: adminUser!.id,
        confirmado_admin_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (errorPagoSena || !pagoSena) {
      redirect(
        `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(
          `La venta se completó pero no se pudo registrar la seña como pago: ${errorPagoSena?.message ?? 'error desconocido'}`
        )}`
      )
    }

    const cuotasOrdenadas = [...cuotasCreadas]
      .sort((a, b) => a.numero - b.numero)
      .map((cuota) => ({ id: cuota.id, saldoPendiente: cuota.saldo_pendiente }))
    const resultado = imputarPagoFIFO(reserva.monto_sena, cuotasOrdenadas)

    for (const imputacion of resultado.imputaciones) {
      const { error: errorImputacion } = await admin.from('pago_imputaciones').insert({
        pago_id: pagoSena!.id,
        cuota_id: imputacion.cuotaId,
        monto_imputado: imputacion.montoImputado,
      })

      if (errorImputacion) {
        redirect(
          `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(
            `La venta y la seña se registraron, pero falló aplicar el descuento a una cuota: ${errorImputacion.message}`
          )}`
        )
      }

      const cuota = cuotasOrdenadas.find((c) => c.id === imputacion.cuotaId)!
      const { error: errorSaldo } = await admin
        .from('cuotas')
        .update({ saldo_pendiente: cuota.saldoPendiente - imputacion.montoImputado })
        .eq('id', imputacion.cuotaId)

      if (errorSaldo) {
        redirect(
          `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(
            `La venta y la seña se registraron, pero falló actualizar el saldo de una cuota: ${errorSaldo.message}`
          )}`
        )
      }
    }
  }

  redirect('/admin/lotes')
}
