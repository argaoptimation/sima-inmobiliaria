'use server'

import { createClient } from '@/lib/supabase/server'
import { imputarPagoFIFO, imputarPagoConMora } from '@/lib/pagos/imputar-fifo'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { hoyArgentina } from '@/lib/fecha/hoy-argentina'
import {
  alcanzaConLaConfirmacionDelAdmin,
  resolverDestinatarioDelPago,
} from '@/lib/pagos/destinatario'
import {
  generarDebeAutomaticoSiCorresponde,
  revertirDebeAutomaticoSiCorresponde,
} from '@/lib/cuenta-corriente/generar-debe-automatico'

export async function confirmarPago(pagoId: string, formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  // Desde el 06/09 el que hace la primera confirmación es el DESTINATARIO
  // del cobro, no el acreedor del lote: si la cuota 1 se cobra en la cuenta
  // del vendedor 1, es el vendedor 1 quien verifica el comprobante y el
  // monto, y recién después Nicolás hace el segundo check. Así que un
  // vendedor o un cobrador también pueden llegar acá.
  const ROLES_QUE_CONFIRMAN = ['administrador', 'acreedor', 'vendedor', 'cobrador']

  if (!perfil || !ROLES_QUE_CONFIRMAN.includes(perfil.role)) {
    return
  }

  const { data: pago } = await supabase
    .from('pagos')
    .select('comprobante_path, cliente_id, lote_id, moneda, motivo, medio_pago, cuota_origen_id')
    .eq('id', pagoId)
    .single()

  // Un pago en efectivo no tiene comprobante que subir -- la evidencia es
  // que el admin lo tiene físicamente en la mano, no un archivo (ver
  // Notas_Decisiones_SIMA.txt punto 22). Para transferencia se sigue
  // exigiendo el comprobante como antes.
  if (!pago || (!pago.comprobante_path && pago.medio_pago !== 'efectivo')) {
    revalidatePath('/admin/pagos')
    revalidatePath('/admin/efectivo')
    return
  }

  // Resolucion del lote de este pago via pagos.lote_id (no via cliente_id:
  // un cliente puede tener varios lotes, cliente_id ya no alcanza). Se reusa
  // mas abajo para la imputacion FIFO, evitando una segunda consulta
  // redundante.
  const { data: lote } = await supabase
    .from('lotes')
    .select('id, acreedor_id, identificador, cuenta_cobro_externa_id, ciclo_actual, interes_moratorio_diario')
    .eq('id', pago.lote_id)
    .single()

  const destinatario = await resolverDestinatarioDelPago(supabase, pago)

  if (perfil.role !== 'administrador' && destinatario.perfilId !== user.id) {
    // No es el destinatario de este cobro -- ya sea porque la cuota se
    // cobra en la cuenta de otra persona, o porque el lote todavia no tiene
    // ninguna asignada. En ambos casos el rechazo debe ser visible (no un
    // fallo silencioso): sin esta senal, un lote sin destinatario deja el
    // pago trabado para siempre sin que nadie note que hay algo pendiente
    // de resolver.
    redirect(
      `/admin/pagos?error=${encodeURIComponent(
        'Este pago no se cobra en tu cuenta, así que no sos vos quien lo confirma. Si creés que sí, revisá con el administrador a qué cuenta está asignada esa cuota.'
      )}`
    )
  }

  // Para acreedor, el chequeo de arriba ya garantiza `lote` no nulo. Para
  // admin no hay ningun chequeo previo -- sin este guard, un lote no
  // encontrado (ej. falla transitoria de la consulta) tira una excepcion sin
  // manejar mas abajo, en vez del mismo patron de rechazo prolijo que usa el
  // resto de la funcion.
  if (!lote) {
    revalidatePath('/admin/pagos')
    return
  }

  // Las columnas se llaman "acreedor" por historia; hoy son las del
  // destinatario del cobro, sea quien sea (ver migración 0055).
  const firmaComoDestinatario = perfil.role !== 'administrador'

  const campoPor = firmaComoDestinatario ? 'confirmado_acreedor_por' : 'confirmado_admin_por'
  const campoAt = firmaComoDestinatario ? 'confirmado_acreedor_at' : 'confirmado_admin_at'
  const campoOtroPor = firmaComoDestinatario ? 'confirmado_admin_por' : 'confirmado_acreedor_por'
  const campoOtroAt = firmaComoDestinatario ? 'confirmado_admin_at' : 'confirmado_acreedor_at'

  const montoVisto = Number(formData.get('montoVisto'))
  const montoIngresado = Number(formData.get('monto'))

  if (!Number.isFinite(montoVisto) || !Number.isFinite(montoIngresado) || montoIngresado < 0) {
    redirect(`/admin/pagos?error=${encodeURIComponent('Monto inválido')}`)
  }

  // Si el monto que se envía difiere del que esta misma pantalla mostraba al
  // cargar, hubo una edicion real (no solo un submit sin tocar el campo): se
  // actualiza pago.monto y se limpia la confirmacion del OTRO rol, si ya
  // estaba cargada -- nadie puede quedar "confirmando" un numero que en
  // realidad nunca vio ni acepto.
  const huboEdicion = montoIngresado !== montoVisto

  // Bookkeeping opcional para el cierre de caja del acreedor/admin: el monto
  // realmente recibido (a menudo en pesos) puede diferir del monto imputado
  // (en la moneda del lote). Si se deja en blanco, no tocamos estas columnas
  // para no pisar un valor que ya haya cargado otro confirmador.
  const montoRecibido = formData.get('montoRecibido')
  const monedaRecibida = formData.get('monedaRecibida')
  const montoRecibidoNumero = montoRecibido ? Number(montoRecibido) : NaN
  const montoRecibidoValido =
    Number.isFinite(montoRecibidoNumero) && montoRecibidoNumero >= 0

  // Guarda atomica: el UPDATE solo pega si el pago SIGUE pendiente y el
  // monto SIGUE siendo el que esta pantalla vio al cargar. Si otro
  // confirmador ya lo cambio (o ya se termino de confirmar) mientras tanto,
  // esto no afecta ninguna fila -- se rechaza en vez de pisar en silencio lo
  // que el otro rol ya cargo.
  const { data: pagoActualizado, error: errorConfirmacion } = await supabase
    .from('pagos')
    .update({
      monto: montoIngresado,
      [campoPor]: user.id,
      [campoAt]: new Date().toISOString(),
      ...(huboEdicion ? { [campoOtroPor]: null, [campoOtroAt]: null } : {}),
      ...(montoRecibidoValido
        ? { monto_recibido: montoRecibidoNumero, moneda_recibida: monedaRecibida }
        : {}),
    })
    .eq('id', pagoId)
    .eq('estado', 'pendiente')
    .eq('monto', montoVisto)
    .select('id')
    .maybeSingle()

  if (errorConfirmacion) {
    revalidatePath('/admin/pagos')
    return
  }

  if (!pagoActualizado) {
    redirect(
      `/admin/pagos?error=${encodeURIComponent(
        'El monto cambió desde que abriste esta pantalla (ahora figura un valor distinto) o el pago ya se terminó de confirmar. Revisalo antes de confirmar.'
      )}`
    )
  }

  // Claim atomico: solo un llamador puede ganar este UPDATE, ya sea contra
  // una carrera de doble click o contra un reintento tras una falla parcial.
  // El doble check (destinatario + admin) es la regla; alcanza con el admin
  // solo cuando del otro lado no hay nadie que pueda confirmar -- ver
  // alcanzaConLaConfirmacionDelAdmin(). Dos ramas explicitas (en vez de
  // armar un solo query condicional) para que quede clara la diferencia
  // exacta entre ambos casos, sin depender de como encadena internamente el
  // builder.
  const { data: pagoClaimado, error: errorClaim } = alcanzaConLaConfirmacionDelAdmin(
    destinatario,
    pago.medio_pago
  )
    ? await supabase
        .from('pagos')
        .update({ estado: 'confirmado' })
        .eq('id', pagoId)
        .eq('estado', 'pendiente')
        .not('confirmado_admin_por', 'is', null)
        .select('id, monto')
        .single()
    : await supabase
        .from('pagos')
        .update({ estado: 'confirmado' })
        .eq('id', pagoId)
        .eq('estado', 'pendiente')
        .not('confirmado_acreedor_por', 'is', null)
        .not('confirmado_admin_por', 'is', null)
        .select('id, monto')
        .single()

  if (errorClaim || !pagoClaimado || !lote) {
    revalidatePath('/admin/pagos')
    return
  }

  // La plata le entro a alguien: se registra donde corresponda. El destino
  // es el de la CUOTA que origino el pago (o el del lote, si esa cuota no
  // tiene uno propio) -- el mismo alias que el cliente vio al transferir.
  if (destinatario.cobroDirecto) {
    const { data: cliente } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', pago.cliente_id)
      .single()

    const conceptoMovimiento = `Pago de ${pago.motivo === 'sena' ? 'seña' : 'cuota'} — Lote ${
      lote.identificador
    } — ${cliente?.full_name ?? 'cliente'}`

    if (destinatario.cuentaExternaId) {
      const { error: errorMovimientoExterno } = await supabase.from('cuentas_externas_movimientos').insert({
        cuenta_externa_id: destinatario.cuentaExternaId,
        tipo: 'credito',
        monto: pagoClaimado.monto,
        moneda: pago.moneda,
        concepto: conceptoMovimiento,
        pago_id: pagoClaimado.id,
        cargado_por: user.id,
      })

      if (errorMovimientoExterno) {
        // El pago ya quedo "confirmado" y el FIFO de abajo sigue corriendo --
        // no revertimos nada, pero queda para revision manual el hecho de que
        // no se registro el credito en la cuenta externa.
        console.error('No se pudo registrar el crédito en la cuenta externa:', errorMovimientoExterno)
      }
    } else if (destinatario.perfilId) {
      // Haber automatico (06/09): el cliente le transfirio DIRECTO a esta
      // persona, salteando a la empresa. Es la contracara del Debe que la
      // distribucion le postea por lo que le corresponde de esta cuota.
      //
      // Sin esto la cuenta corriente solo tenia la mitad de la historia
      // (todo lo que se le debe, nada de lo que ya cobro), y habia que
      // cargar cada Haber a mano. Con las dos mitades el saldo se salda
      // solo: si un vendedor cobro 500 de mas en un lote y le corresponden
      // 500 en otro, queda en cero sin que nadie transfiera nada.
      const { error: errorHaber } = await supabase.from('movimientos_cuenta_corriente').insert({
        profile_id: destinatario.perfilId,
        tipo: 'haber',
        monto: pagoClaimado.monto,
        moneda: pago.moneda,
        lote_id: lote.id,
        cuota_id: pago.cuota_origen_id,
        origen: 'pago_directo_cliente',
        de_parte_de: cliente?.full_name ?? 'cliente',
        detalle: conceptoMovimiento,
        cargado_por: user.id,
      })

      if (errorHaber) {
        console.error('No se pudo registrar el Haber automático de cuenta corriente:', errorHaber)
      }
    }
  }

  // Acotado al ciclo de venta VIGENTE (ver migración 0039): si este lote
  // fue rescindido y revendido, un pago del cliente actual nunca se tiene
  // que imputar contra deuda vieja de un ciclo anterior.
  const { data: cuotas } = await supabase
    .from('cuotas')
    .select('id, saldo_pendiente, fecha_vencimiento, mora_pagada')
    .eq('lote_id', lote.id)
    .eq('ciclo', lote.ciclo_actual)
    .gt('saldo_pendiente', 0)
    .order('numero', { ascending: true })

  // Cobra mora real, no solo capital (migración 0049 -- antes de esto la
  // mora era puramente informativa, ver Notas_Decisiones_SIMA.txt). Cada
  // cuota, en orden FIFO, primero salda su mora devengada pendiente y recien
  // despues su saldo de capital.
  const resultado = imputarPagoConMora(
    pagoClaimado.monto,
    (cuotas ?? []).map((cuota) => ({
      id: cuota.id,
      saldoPendiente: cuota.saldo_pendiente,
      fechaVencimiento: cuota.fecha_vencimiento,
      moraPagada: cuota.mora_pagada,
    })),
    lote.interes_moratorio_diario,
    hoyArgentina()
  )

  for (const imputacion of resultado.imputaciones) {
    if (imputacion.montoCapital > 0) {
      const { error: errorImputacion } = await supabase.from('pago_imputaciones').insert({
        pago_id: pagoClaimado.id,
        cuota_id: imputacion.cuotaId,
        monto_imputado: imputacion.montoCapital,
      })

      if (errorImputacion) {
        // El pago ya quedo marcado "confirmado" (evita que un reintento
        // vuelva a correr el FIFO y duplique lo ya imputado). Si una fila
        // puntual falla aca, queda para revision manual via la tabla de
        // imputaciones -- no seguimos intentando escribir en un estado
        // inconsistente.
        revalidatePath('/admin/pagos')
        return
      }
    }

    if (imputacion.montoMora > 0) {
      const { error: errorImputacionMora } = await supabase.from('pago_imputaciones_mora').insert({
        pago_id: pagoClaimado.id,
        cuota_id: imputacion.cuotaId,
        monto_imputado: imputacion.montoMora,
      })

      if (errorImputacionMora) {
        revalidatePath('/admin/pagos')
        return
      }
    }

    const cuota = cuotas!.find((c) => c.id === imputacion.cuotaId)!
    const { error: errorSaldo } = await supabase
      .from('cuotas')
      .update({
        saldo_pendiente: cuota.saldo_pendiente - imputacion.montoCapital,
        mora_pagada: cuota.mora_pagada + imputacion.montoMora,
      })
      .eq('id', imputacion.cuotaId)

    if (errorSaldo) {
      revalidatePath('/admin/pagos')
      return
    }

    await generarDebeAutomaticoSiCorresponde(supabase, {
      cuotaId: imputacion.cuotaId,
      loteId: lote.id,
      userId: user.id,
    })
  }

  revalidatePath('/admin/pagos')
  revalidatePath('/admin/efectivo')
  revalidatePath('/admin/cierre-caja')
  revalidatePath('/portal-cliente')
}

export async function editarMontoPago(pagoId: string, formData: FormData) {
  await requireAdministrador()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // requireAdministrador() de arriba ya redirige si no hay sesion, pero se
  // repite el chequeo aca (misma convencion que confirmarPago) para no
  // depender implicitamente de esa otra funcion al usar `user!.id` mas abajo.
  if (!user) return

  const { data: pago } = await supabase
    .from('pagos')
    .select('id, cliente_id, lote_id, moneda, comprobante_path, motivo, estado, monto, medio_pago')
    .eq('id', pagoId)
    .single()

  if (!pago || pago.estado !== 'confirmado' || pago.motivo === 'ajuste') {
    redirect(`/admin/pagos?error=${encodeURIComponent('Este pago no se puede editar.')}`)
  }

  const { data: ajustesPrevios } = await supabase
    .from('pagos')
    .select('id, monto')
    .eq('corrige_pago_id', pagoId)

  const montoEfectivoActual =
    pago!.monto + (ajustesPrevios ?? []).reduce((acc, ajuste) => acc + ajuste.monto, 0)

  const montoEfectivoVisto = Number(formData.get('montoEfectivoVisto'))
  const montoNuevo = Number(formData.get('montoNuevo'))

  if (!Number.isFinite(montoEfectivoVisto) || !Number.isFinite(montoNuevo) || montoNuevo < 0) {
    redirect(`/admin/pagos?error=${encodeURIComponent('Monto inválido')}`)
  }

  if (montoEfectivoVisto !== montoEfectivoActual) {
    redirect(
      `/admin/pagos?error=${encodeURIComponent(
        'El monto de este pago cambió desde que abriste esta pantalla. Revisalo antes de corregir.'
      )}`
    )
  }

  const delta = montoNuevo - montoEfectivoActual

  if (delta === 0) {
    redirect(`/admin/pagos?error=${encodeURIComponent('No hubo cambios en el monto.')}`)
  }

  const { data: pagoAjuste, error: errorAjuste } = await supabase
    .from('pagos')
    .insert({
      cliente_id: pago!.cliente_id,
      lote_id: pago!.lote_id,
      monto: delta,
      moneda: pago!.moneda,
      comprobante_path: pago!.comprobante_path,
      motivo: 'ajuste',
      // Hereda el medio de pago del original -- una corrección sobre un
      // pago en efectivo tiene que seguir contando como efectivo en el
      // cierre de caja, no caer en el default 'transferencia'.
      medio_pago: pago!.medio_pago,
      estado: 'confirmado',
      confirmado_admin_por: user!.id,
      confirmado_admin_at: new Date().toISOString(),
      corrige_pago_id: pagoId,
    })
    .select('id')
    .single()

  if (errorAjuste || !pagoAjuste) {
    redirect(`/admin/pagos?error=${encodeURIComponent('No se pudo registrar la corrección.')}`)
  }

  if (delta > 0) {
    // Acotado al ciclo de venta VIGENTE (ver migración 0039) -- mismo
    // motivo que en confirmarPago: nunca imputar contra deuda vieja de un
    // ciclo anterior si este lote fue rescindido y revendido.
    //
    // Nota (migración 0049): esta corrección sigue usando imputarPagoFIFO
    // (solo capital), no imputarPagoConMora -- a diferencia de confirmarPago,
    // acá no conviene cobrar mora, porque la rama de reversión de abajo
    // (delta < 0) neteos por pago_imputaciones sin considerar
    // pago_imputaciones_mora; mezclar ambos ledgers en una corrección
    // rompería esa reversión. Es una limitación conocida y aceptada: una
    // corrección de monto sobre un pago ya confirmado no cobra mora
    // adicional, solo ajusta capital.
    const { data: loteDelPago } = await supabase
      .from('lotes')
      .select('ciclo_actual')
      .eq('id', pago!.lote_id)
      .single()

    const { data: cuotas } = await supabase
      .from('cuotas')
      .select('id, saldo_pendiente')
      .eq('lote_id', pago!.lote_id)
      .eq('ciclo', loteDelPago?.ciclo_actual ?? 1)
      .gt('saldo_pendiente', 0)
      .order('numero', { ascending: true })

    const resultado = imputarPagoFIFO(
      delta,
      (cuotas ?? []).map((cuota) => ({ id: cuota.id, saldoPendiente: cuota.saldo_pendiente }))
    )

    for (const imputacion of resultado.imputaciones) {
      const { error: errorImputacion } = await supabase.from('pago_imputaciones').insert({
        pago_id: pagoAjuste!.id,
        cuota_id: imputacion.cuotaId,
        monto_imputado: imputacion.montoImputado,
      })

      if (errorImputacion) {
        // El ajuste ya quedo insertado (evita que un reintento vuelva a
        // correr el FIFO y duplique lo ya imputado). Si una fila puntual
        // falla aca, queda para revision manual via la tabla de
        // imputaciones -- no seguimos escribiendo en un estado inconsistente
        // (mismo patron que confirmarPago).
        redirect(
          `/admin/pagos?error=${encodeURIComponent(
            'La corrección se registró pero falló al imputarla. Revisalo manualmente.'
          )}`
        )
      }

      const cuota = cuotas!.find((c) => c.id === imputacion.cuotaId)!
      const { error: errorSaldo } = await supabase
        .from('cuotas')
        .update({ saldo_pendiente: cuota.saldo_pendiente - imputacion.montoImputado })
        .eq('id', imputacion.cuotaId)

      if (errorSaldo) {
        redirect(
          `/admin/pagos?error=${encodeURIComponent(
            'La corrección se registró pero falló al actualizar el saldo de una cuota. Revisalo manualmente.'
          )}`
        )
      }

      await generarDebeAutomaticoSiCorresponde(supabase, {
        cuotaId: imputacion.cuotaId,
        loteId: pago!.lote_id,
        userId: user!.id,
      })
    }
  } else {
    // La reversion tiene que considerar TODA la cadena de correcciones sobre
    // este pago (el original + cada ajuste previo), no solo las
    // imputaciones del pago original -- una correccion hacia arriba previa
    // dejo sus propias filas en pago_imputaciones bajo el id de ESE ajuste,
    // no bajo pagoId. Neteamos por cuota para no revertir de mas lo que una
    // correccion previa ya revirtio, y ordenamos por el toque mas reciente
    // para revertir primero el movimiento de plata mas nuevo.
    const idsCorreccion = [pagoId, ...(ajustesPrevios ?? []).map((ajuste) => ajuste.id)]

    const { data: imputacionesCorreccion } = await supabase
      .from('pago_imputaciones')
      .select('cuota_id, monto_imputado, created_at')
      .in('pago_id', idsCorreccion)
      .order('created_at', { ascending: false })

    const netoPorCuota = new Map<string, { neto: number; ultimoToque: string }>()
    for (const imputacion of imputacionesCorreccion ?? []) {
      const actual = netoPorCuota.get(imputacion.cuota_id)
      netoPorCuota.set(imputacion.cuota_id, {
        neto: (actual?.neto ?? 0) + imputacion.monto_imputado,
        ultimoToque: actual?.ultimoToque ?? imputacion.created_at, // ya viene ordenado desc
      })
    }

    const cuotasOrdenadas = [...netoPorCuota.entries()]
      .filter(([, info]) => info.neto > 0)
      .sort((a, b) => (a[1].ultimoToque < b[1].ultimoToque ? 1 : -1))

    let restante = Math.abs(delta)

    for (const [cuotaId, info] of cuotasOrdenadas) {
      if (restante <= 0) break

      const aRevertir = Math.min(info.neto, restante)

      const { data: cuota } = await supabase
        .from('cuotas')
        .select('saldo_pendiente')
        .eq('id', cuotaId)
        .single()

      if (!cuota) continue

      const { error: errorSaldo } = await supabase
        .from('cuotas')
        .update({ saldo_pendiente: cuota.saldo_pendiente + aRevertir })
        .eq('id', cuotaId)

      if (errorSaldo) {
        redirect(
          `/admin/pagos?error=${encodeURIComponent(
            'La corrección se registró pero falló al actualizar el saldo de una cuota. Revisalo manualmente.'
          )}`
        )
      }

      const { error: errorImputacion } = await supabase.from('pago_imputaciones').insert({
        pago_id: pagoAjuste!.id,
        cuota_id: cuotaId,
        monto_imputado: -aRevertir,
      })

      if (errorImputacion) {
        redirect(
          `/admin/pagos?error=${encodeURIComponent(
            'La corrección se registró pero falló al revertir una imputación. Revisalo manualmente.'
          )}`
        )
      }

      restante -= aRevertir

      await revertirDebeAutomaticoSiCorresponde(supabase, { cuotaId, userId: user!.id })
    }
  }

  revalidatePath('/admin/pagos')
  revalidatePath('/portal-cliente')
}
