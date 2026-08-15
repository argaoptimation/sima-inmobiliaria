'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { calcularMontoCuota } from '@/lib/lotes/calcular-monto-cuota'
import { generarCuotas, generarCuotasManual, CuotaGenerada } from '@/lib/lotes/generar-cuotas'
import { imputarPagoFIFO } from '@/lib/pagos/imputar-fifo'
import { excedeTamanioMaximo, MAX_ARCHIVO_MB } from '@/lib/storage/validar-tamanio-archivo'

function construirParamsVenderPreservados(
  formData: FormData,
  clienteExistenteConfirmado: { id: string; nombre: string } | null,
  clienteNuevoId: string
): URLSearchParams {
  const params = new URLSearchParams({
    fullName: (formData.get('fullName') as string) || '',
    email: (formData.get('email') as string) || '',
    cantidadCuotas: (formData.get('cantidadCuotas') as string) || '',
    fechaPrimeraCuota: (formData.get('fechaPrimeraCuota') as string) || '',
  })

  const modoFormulario = (formData.get('modo') as string) || ''
  if (modoFormulario) {
    params.set('modo', modoFormulario)
  }

  if (clienteExistenteConfirmado) {
    params.set('confirmarClienteId', clienteExistenteConfirmado.id)
    params.set('nombreEncontrado', clienteExistenteConfirmado.nombre)
  }

  // Un cliente NUEVO creado por este mismo flujo (no uno preexistente
  // confirmado -- eso ya lo cubre confirmarClienteId de arriba). Se
  // preserva para que el próximo submit no vuelva a "descubrir" por
  // email la cuenta que este mismo flujo acaba de crear y la trate como
  // si fuera una cuenta ajena, mostrando un cartel de confirmación
  // espurio y perdiendo los montos/documento ya cargados.
  if (clienteNuevoId) {
    params.set('clienteNuevoId', clienteNuevoId)
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
  const clienteNuevoId = ((formData.get('clienteNuevoId') as string) || '').trim()

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

  let clienteId: string
  let clienteExistenteParaPreservar: { id: string; nombre: string } | null = null
  let esClienteNuevo = false

  const { data: clienteExistente } = await admin
    .from('profiles')
    .select('id, full_name, dni, domicilio, telefono')
    .eq('email', email)
    .eq('role', 'cliente')
    .maybeSingle()

  if (clienteExistente) {
    // El comprador ya tiene cuenta -- puede ser porque compró otro lote
    // antes (cuenta genuinamente preexistente, requiere confirmación
    // explícita más abajo) o porque este MISMO flujo, en un paso
    // anterior de esta misma venta, ya la creó (clienteNuevoId lo
    // certifica: solo se seteó en el momento en que este flujo insertó
    // esa fila, nunca se confía a ciegas -- siempre se valida contra
    // esta búsqueda real por email).
    const confirmadoPorRecienCreado = Boolean(clienteNuevoId) && clienteNuevoId === clienteExistente.id
    const confirmado =
      (formData.get('confirmarClienteExistente') as string) === clienteExistente.id ||
      confirmadoPorRecienCreado

    if (!confirmado) {
      // Antes de asociar el lote, se exige una confirmación explícita del
      // admin: si tipeó mal el email, este chequeo podría enganchar el lote a
      // la cuenta de OTRA persona real sin que nadie lo note. El primer
      // submit nunca trae `confirmarClienteExistente` todavía, así que
      // siempre se corta acá la primera vez y se le muestra al admin el
      // nombre real de la cuenta encontrada antes de completar la venta.
      const dniNoCoincide = Boolean(
        reserva?.dni && clienteExistente.dni && reserva.dni !== clienteExistente.dni
      )

      const params = new URLSearchParams({
        confirmarClienteId: clienteExistente.id,
        nombreEncontrado: clienteExistente.full_name ?? '',
        fullName,
        email,
        cantidadCuotas: String(cantidadCuotas),
        fechaPrimeraCuota,
        modo,
        ...(dniNoCoincide
          ? { dniReserva: reserva!.dni as string, dniPerfil: clienteExistente.dni as string }
          : {}),
      })
      redirect(`/admin/lotes/${loteId}/vender?${params.toString()}`)
    }

    clienteId = clienteExistente.id

    if (confirmadoPorRecienCreado) {
      // Es la cuenta que este mismo flujo acaba de crear -- ya se
      // completaron sus datos en el momento de crearla, no hace falta
      // repetir la completacion de datos faltantes, y NO se muestra el
      // cartel de "cliente existente" (sería engañoso: no es una cuenta
      // ajena, es la que se está creando en esta misma venta).
      esClienteNuevo = true
    } else {
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

      clienteExistenteParaPreservar = { id: clienteExistente.id, nombre: clienteExistente.full_name ?? '' }
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
        `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(errorInvite?.message ?? 'error desconocido')}`
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
          redirect(`/admin/lotes/${loteId}/vender?error=${encodeURIComponent(errorProfileSinDni.message)}`)
        }
      } else {
        redirect(`/admin/lotes/${loteId}/vender?error=${encodeURIComponent(errorProfile.message)}`)
      }
    }

    clienteId = invited!.user.id
    esClienteNuevo = true
  }

  const clienteNuevoIdParaPreservar = esClienteNuevo ? clienteId : ''

  let montoCuotaBase: number | null
  let cuotas: CuotaGenerada[]
  let documentoFirmadoPath: string

  if (modo === 'manual') {
    const montosManualesRaw: string[] = []
    for (let i = 1; i <= cantidadCuotas; i++) {
      const valor = formData.get(`cuotaMonto${i}`)
      if (valor === null) break
      montosManualesRaw.push(valor as string)
    }

    if (montosManualesRaw.length !== cantidadCuotas) {
      // Todavía no cargó los montos -- redirige agregando modo=manual (y
      // lo ya preservado) para que la página muestre el campo por cuota.
      const params = construirParamsVenderPreservados(formData, clienteExistenteParaPreservar, clienteNuevoIdParaPreservar)
      redirect(`/admin/lotes/${loteId}/vender?${params.toString()}`)
    }

    const montosManuales = montosManualesRaw.map((valor) => Number(valor))
    if (!montosManuales.every((monto) => Number.isFinite(monto) && monto >= 0)) {
      redirectVenderConError(
        loteId,
        'Los montos de las cuotas tienen que ser números válidos, no negativos',
        construirParamsVenderPreservados(formData, clienteExistenteParaPreservar, clienteNuevoIdParaPreservar)
      )
    }

    const confirmado = (formData.get('confirmarMontosManual') as string) === 'true'

    if (!confirmado) {
      // Paso de carga de montos: acá se sube el documento (una sola vez) y
      // se redirige a la pantalla de balance para que confirme.
      const documentoFirmado = formData.get('documentoFirmado') as File

      if (!documentoFirmado || documentoFirmado.size === 0) {
        redirectVenderConError(
          loteId,
          'Subí el documento firmado (boleto o escritura)',
          construirParamsVenderPreservados(formData, clienteExistenteParaPreservar, clienteNuevoIdParaPreservar)
        )
      }

      if (excedeTamanioMaximo(documentoFirmado)) {
        redirectVenderConError(
          loteId,
          `El documento firmado pesa más de ${MAX_ARCHIVO_MB} MB — subí uno más liviano.`,
          construirParamsVenderPreservados(formData, clienteExistenteParaPreservar, clienteNuevoIdParaPreservar)
        )
      }

      const { filePath, error: errorSubidaDocumento } = await subirDocumentoFirmado(documentoFirmado)

      if (errorSubidaDocumento) {
        console.error('Error al subir el documento firmado:', errorSubidaDocumento)
        redirectVenderConError(
          loteId,
          'No se pudo subir el documento firmado. Probá de nuevo.',
          construirParamsVenderPreservados(formData, clienteExistenteParaPreservar, clienteNuevoIdParaPreservar)
        )
      }

      const params = construirParamsVenderPreservados(formData, clienteExistenteParaPreservar, clienteNuevoIdParaPreservar)
      montosManuales.forEach((monto, indice) => params.set(`cuotaMonto${indice + 1}`, String(monto)))
      params.set('documentoFirmadoPath', filePath)
      redirect(`/admin/lotes/${loteId}/vender?${params.toString()}`)
    }

    // Confirmado: el documento ya se subió en el paso anterior, viene como
    // input oculto -- no se vuelve a pedir.
    const documentoFirmadoPathConfirmado = ((formData.get('documentoFirmadoPath') as string) || '').trim()

    if (!documentoFirmadoPathConfirmado) {
      redirectVenderConError(
        loteId,
        'Falta el documento firmado, volvé a intentarlo desde el principio',
        construirParamsVenderPreservados(formData, clienteExistenteParaPreservar, clienteNuevoIdParaPreservar)
      )
    }

    documentoFirmadoPath = documentoFirmadoPathConfirmado
    montoCuotaBase = null
    cuotas = generarCuotasManual(montosManuales, fechaPrimeraCuota)
  } else {
    const documentoFirmado = formData.get('documentoFirmado') as File

    if (!documentoFirmado || documentoFirmado.size === 0) {
      redirectVenderConError(
        loteId,
        'Subí el documento firmado (boleto o escritura)',
        construirParamsVenderPreservados(formData, clienteExistenteParaPreservar, clienteNuevoIdParaPreservar)
      )
    }

    if (excedeTamanioMaximo(documentoFirmado)) {
      redirectVenderConError(
        loteId,
        `El documento firmado pesa más de ${MAX_ARCHIVO_MB} MB — subí uno más liviano.`,
        construirParamsVenderPreservados(formData, clienteExistenteParaPreservar, clienteNuevoIdParaPreservar)
      )
    }

    const { filePath, error: errorSubidaDocumento } = await subirDocumentoFirmado(documentoFirmado)

    if (errorSubidaDocumento) {
      console.error('Error al subir el documento firmado:', errorSubidaDocumento)
      redirectVenderConError(
        loteId,
        'No se pudo subir el documento firmado. Probá de nuevo.',
        construirParamsVenderPreservados(formData, clienteExistenteParaPreservar, clienteNuevoIdParaPreservar)
      )
    }

    documentoFirmadoPath = filePath

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
