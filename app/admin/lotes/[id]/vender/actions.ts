'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { calcularMontoCuota } from '@/lib/lotes/calcular-monto-cuota'
import { generarCuotas, generarCuotasManual, CuotaGenerada } from '@/lib/lotes/generar-cuotas'
import { imputarPagoFIFO } from '@/lib/pagos/imputar-fifo'
import { excedeTamanioMaximo, MAX_ARCHIVO_MB } from '@/lib/storage/validar-tamanio-archivo'
import { mensajeDeError } from '@/lib/errores'

function construirParamsPreservados(formData: FormData): URLSearchParams {
  const params = new URLSearchParams({
    fullName: (formData.get('fullName') as string) || '',
    email: (formData.get('email') as string) || '',
    cantidadCuotas: (formData.get('cantidadCuotas') as string) || '',
    fechaPrimeraCuota: (formData.get('fechaPrimeraCuota') as string) || '',
    modo: (formData.get('modo') as string) || 'automatico',
    entregaMonto: (formData.get('entregaMonto') as string) || '',
    interesMoratorioDiario: (formData.get('interesMoratorioDiario') as string) || '',
  })

  const cantidadCuotas = Number(formData.get('cantidadCuotas')) || 0
  for (let i = 1; i <= cantidadCuotas; i++) {
    const valor = formData.get(`cuotaMonto${i}`)
    if (valor !== null) {
      params.set(`cuotaMonto${i}`, valor as string)
    }
  }

  return params
}

function redirectVenderConError(
  loteId: string,
  mensaje: string,
  paramsPreservados: URLSearchParams
): never {
  paramsPreservados.set('error', mensaje)
  redirect(`/admin/lotes/${loteId}/vender?${paramsPreservados.toString()}`)
}

export async function venderLote(loteId: string, formData: FormData) {
  await requireAdministrador()

  const email = ((formData.get('email') as string) || '').trim()
  const fullName = ((formData.get('fullName') as string) || '').trim()
  const cantidadCuotas = Number(formData.get('cantidadCuotas'))
  const fechaPrimeraCuota = formData.get('fechaPrimeraCuota') as string
  const modo = ((formData.get('modo') as string) || 'automatico').trim()

  if (!email || !fullName) {
    redirect(
      `/admin/lotes/${loteId}/vender?error=${encodeURIComponent('Completá nombre y email del comprador')}`
    )
  }

  if (!Number.isInteger(cantidadCuotas) || cantidadCuotas < 1 || cantidadCuotas > 600) {
    redirect(
      `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(
        'La cantidad de cuotas tiene que ser un número entero entre 1 y 600'
      )}`
    )
  }

  if (!fechaPrimeraCuota) {
    redirect(`/admin/lotes/${loteId}/vender?error=${encodeURIComponent('Ingresá la fecha de la primera cuota')}`)
  }

  const supabase = await createClient()
  const {
    data: { user: adminUser },
  } = await supabase.auth.getUser()

  const admin = createAdminClient()

  async function subirDocumentoFirmado(archivo: File): Promise<{ filePath: string; error: unknown }> {
    const nombreSeguro = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `ventas/${loteId}/documento-${Date.now()}-${nombreSeguro}`
    const { error } = await admin.storage.from('comprobantes').upload(filePath, archivo)
    return { filePath, error }
  }

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

  // Reserva más reciente de este lote: se usa tanto para completar/copiar
  // los datos del cliente (dni, domicilio, telefono) más abajo como para el
  // descuento de la seña en las cuotas, al final de la función.
  const { data: reserva } = await admin
    .from('reservas')
    .select('monto_sena, moneda_sena, comprobante_sena_path, dni, domicilio, telefono')
    .eq('lote_id', loteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Cliente existente por email: chequeo de solo lectura, sin efectos
  // secundarios -- se hace ANTES de tocar montos/documento porque, si hace
  // falta confirmación explícita del admin, no tiene sentido haber subido
  // ya el documento (quedaría huérfano en el storage).
  const { data: clienteExistente } = await admin
    .from('profiles')
    .select('id, full_name, dni, domicilio, telefono')
    .eq('email', email)
    .eq('role', 'cliente')
    .maybeSingle()

  if (clienteExistente) {
    // Antes de asociar el lote, se exige una confirmación explícita del
    // admin: si tipeó mal el email, este chequeo podría enganchar el lote a
    // la cuenta de OTRA persona real sin que nadie lo note. El primer
    // submit nunca trae `confirmarClienteExistente` todavía, así que
    // siempre se corta acá la primera vez y se le muestra al admin el
    // nombre real de la cuenta encontrada antes de completar la venta.
    const confirmado = (formData.get('confirmarClienteExistente') as string) === clienteExistente.id

    if (!confirmado) {
      const dniNoCoincide = Boolean(
        reserva?.dni && clienteExistente.dni && reserva.dni !== clienteExistente.dni
      )

      const params = construirParamsPreservados(formData)
      params.set('confirmarClienteId', clienteExistente.id)
      params.set('nombreEncontrado', clienteExistente.full_name ?? '')
      if (dniNoCoincide) {
        params.set('dniReserva', reserva!.dni as string)
        params.set('dniPerfil', clienteExistente.dni as string)
      }
      redirect(`/admin/lotes/${loteId}/vender?${params.toString()}`)
    }
  }

  // Montos manuales: se validan antes de tocar el documento (chequeo
  // barato, sin I/O) o la cuenta del comprador.
  let montosManuales: number[] = []

  if (modo === 'manual') {
    const montosManualesRaw: string[] = []
    for (let i = 1; i <= cantidadCuotas; i++) {
      montosManualesRaw.push(((formData.get(`cuotaMonto${i}`) as string) || '').trim())
    }

    if (montosManualesRaw.some((valor) => valor === '')) {
      redirectVenderConError(loteId, 'Completá el monto de todas las cuotas', construirParamsPreservados(formData))
    }

    montosManuales = montosManualesRaw.map((valor) => Number(valor))
    if (!montosManuales.every((monto) => Number.isFinite(monto) && monto >= 0)) {
      redirectVenderConError(
        loteId,
        'Los montos de las cuotas tienen que ser números válidos, no negativos',
        construirParamsPreservados(formData)
      )
    }
  }

  const entregaMontoRaw = ((formData.get('entregaMonto') as string) || '').trim()
  let entregaMonto = 0
  if (entregaMontoRaw !== '') {
    entregaMonto = Number(entregaMontoRaw)
    if (!Number.isFinite(entregaMonto) || entregaMonto < 0) {
      redirectVenderConError(
        loteId,
        'El monto de la entrega tiene que ser un número válido, no negativo',
        construirParamsPreservados(formData)
      )
    }
  }

  const interesMoratorioDiarioRaw = ((formData.get('interesMoratorioDiario') as string) || '').trim()
  let interesMoratorioDiario: number | null = null
  if (interesMoratorioDiarioRaw !== '') {
    interesMoratorioDiario = Number(interesMoratorioDiarioRaw)
    if (
      !Number.isFinite(interesMoratorioDiario) ||
      interesMoratorioDiario < 0 ||
      interesMoratorioDiario > 100
    ) {
      redirectVenderConError(
        loteId,
        'El interés moratorio diario tiene que ser un porcentaje válido, entre 0 y 100',
        construirParamsPreservados(formData)
      )
    }
  }

  // Documento firmado: siempre obligatorio, se sube una sola vez acá --
  // recién ahora, con todo lo demás ya validado.
  const documentoFirmado = formData.get('documentoFirmado') as File

  if (!documentoFirmado || documentoFirmado.size === 0) {
    redirectVenderConError(
      loteId,
      'Subí el documento firmado (boleto o escritura)',
      construirParamsPreservados(formData)
    )
  }

  if (excedeTamanioMaximo(documentoFirmado)) {
    redirectVenderConError(
      loteId,
      `El documento firmado pesa más de ${MAX_ARCHIVO_MB} MB — subí uno más liviano.`,
      construirParamsPreservados(formData)
    )
  }

  const { filePath: documentoFirmadoPath, error: errorSubidaDocumento } = await subirDocumentoFirmado(
    documentoFirmado
  )

  if (errorSubidaDocumento) {
    console.error('Error al subir el documento firmado:', errorSubidaDocumento)
    redirectVenderConError(
      loteId,
      'No se pudo subir el documento firmado. Probá de nuevo.',
      construirParamsPreservados(formData)
    )
  }

  // Recién acá, con documento y montos ya validados, se resuelve la cuenta
  // del comprador -- si es nueva, se crea en este mismo paso, nunca antes.
  let clienteId: string

  if (clienteExistente) {
    clienteId = clienteExistente.id

    // Solo se completan los campos que el perfil todavia no tenga cargados
    // -- nunca se pisa un valor ya guardado, podria ser una correccion
    // manual posterior a un error de tipeo en una reserva vieja.
    const datosFaltantes: Record<string, string> = {}
    if (!clienteExistente.dni && reserva?.dni) datosFaltantes.dni = reserva.dni
    if (!clienteExistente.domicilio && reserva?.domicilio) datosFaltantes.domicilio = reserva.domicilio
    if (!clienteExistente.telefono && reserva?.telefono) datosFaltantes.telefono = reserva.telefono

    if (Object.keys(datosFaltantes).length > 0) {
      const { error: errorCompletarDatos } = await admin
        .from('profiles')
        .update(datosFaltantes)
        .eq('id', clienteExistente.id)

      if (errorCompletarDatos) {
        // No bloquea la venta -- ni siquiera un choque de DNI con otro
        // cliente (23505). Queda para completar a mano despues desde la
        // ficha del cliente si hace falta.
        console.error('No se pudieron completar datos del cliente existente:', errorCompletarDatos)
      }
    }
  } else {
    let dniParaNuevoCliente = reserva?.dni ?? null

    if (dniParaNuevoCliente) {
      const { data: dniYaUsado } = await admin
        .from('profiles')
        .select('id')
        .eq('dni', dniParaNuevoCliente)
        .maybeSingle()

      if (dniYaUsado) {
        // El DNI de la reserva ya pertenece a otro cliente (typo o
        // coincidencia) -- no bloquea el alta, se guarda sin DNI y se
        // puede completar despues a mano desde la ficha del cliente.
        dniParaNuevoCliente = null
      }
    }

    const { data: invited, error: errorInvite } = await admin.auth.admin.inviteUserByEmail(email)

    if (errorInvite || !invited.user) {
      redirect(
        `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(mensajeDeError(errorInvite))}`
      )
    }

    const nuevoPerfil = {
      id: invited!.user.id,
      role: 'cliente' as const,
      full_name: fullName,
      email,
      dni: dniParaNuevoCliente,
      domicilio: reserva?.domicilio ?? null,
      telefono: reserva?.telefono ?? null,
    }

    const { error: errorProfile } = await admin.from('profiles').insert(nuevoPerfil)

    if (errorProfile) {
      if (errorProfile.code === '23505' && nuevoPerfil.dni) {
        // Choque de DNI justo en este instante (otro alta simultanea) --
        // reintenta sin DNI en vez de bloquear la venta.
        const { error: errorProfileSinDni } = await admin
          .from('profiles')
          .insert({ ...nuevoPerfil, dni: null })

        if (errorProfileSinDni) {
          redirect(
            `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(mensajeDeError(errorProfileSinDni))}`
          )
        }
      } else {
        redirect(`/admin/lotes/${loteId}/vender?error=${encodeURIComponent(mensajeDeError(errorProfile))}`)
      }
    }

    clienteId = invited!.user.id
  }

  let montoCuotaBase: number | null
  let cuotas: CuotaGenerada[]

  if (modo === 'manual') {
    montoCuotaBase = null
    cuotas = generarCuotasManual(montosManuales, fechaPrimeraCuota)
  } else {
    const precioTotal = loteActual!.precio_total as number
    montoCuotaBase = calcularMontoCuota(precioTotal, cantidadCuotas)
    cuotas = generarCuotas(cantidadCuotas, montoCuotaBase, fechaPrimeraCuota, precioTotal)
  }

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
      documento_firmado_path: documentoFirmadoPath,
      interes_moratorio_diario: interesMoratorioDiario,
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
      `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(mensajeDeError(errorCuotas))}`
    )
  }

  // Descuento de la seña de la reserva en las cuotas recien generadas: si
  // hay una reserva activa con seña > 0 en la misma moneda del lote, se
  // registra como un pago ya confirmado (la seña ya se verifico al
  // reservar, con su propio comprobante) y se reparte en cascada con el
  // mismo FIFO que un pago normal. Si la moneda de la seña difiere de la
  // del lote, no se descuenta nada automatico -- mismo criterio de "sin
  // conversion de moneda" que el resto del proyecto.
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
          `La venta se completó pero no se pudo registrar la seña como pago: ${mensajeDeError(errorPagoSena)}`
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
            `La venta y la seña se registraron, pero falló aplicar el descuento a una cuota: ${mensajeDeError(errorImputacion)}`
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
            `La venta y la seña se registraron, pero falló actualizar el saldo de una cuota: ${mensajeDeError(errorSaldo)}`
          )}`
        )
      }
    }
  }

  if (entregaMonto > 0) {
    const { error: errorPagoEntrega } = await admin.from('pagos').insert({
      cliente_id: clienteId,
      lote_id: loteId,
      monto: entregaMonto,
      moneda: loteActual!.moneda,
      motivo: 'entrega',
      estado: 'confirmado',
      confirmado_admin_por: adminUser!.id,
      confirmado_admin_at: new Date().toISOString(),
    })

    if (errorPagoEntrega) {
      redirect(
        `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(
          `La venta se completó pero no se pudo registrar la entrega como pago: ${mensajeDeError(errorPagoEntrega)}`
        )}`
      )
    }
  }

  redirect('/admin/lotes')
}
