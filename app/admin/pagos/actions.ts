'use server'

import { createClient } from '@/lib/supabase/server'
import { imputarPagoFIFO } from '@/lib/pagos/imputar-fifo'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'

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

  if (!perfil || (perfil.role !== 'acreedor' && perfil.role !== 'administrador')) {
    return
  }

  const { data: pago } = await supabase
    .from('pagos')
    .select('comprobante_path, cliente_id, lote_id, moneda, motivo')
    .eq('id', pagoId)
    .single()

  if (!pago || !pago.comprobante_path) {
    // No se puede confirmar un pago del que todavia no se subio comprobante:
    // no hay evidencia que revisar.
    revalidatePath('/admin/pagos')
    return
  }

  // Resolucion del lote de este pago via pagos.lote_id (no via cliente_id:
  // un cliente puede tener varios lotes, cliente_id ya no alcanza). Se reusa
  // mas abajo para la imputacion FIFO, evitando una segunda consulta
  // redundante.
  const { data: lote } = await supabase
    .from('lotes')
    .select('id, acreedor_id, identificador, cuenta_cobro_externa_id')
    .eq('id', pago.lote_id)
    .single()

  if (perfil.role === 'acreedor' && (!lote || lote.acreedor_id !== user.id)) {
    // No es el acreedor de este lote -- ya sea porque el lote pertenece a
    // otro acreedor, o porque todavia no tiene ninguno asignado. En ambos
    // casos el rechazo debe ser visible (no un fallo silencioso): sin esta
    // senal, un lote sin acreedor deja el pago trabado para siempre sin que
    // nadie note que hay algo pendiente de resolver.
    redirect(
      `/admin/pagos?error=${encodeURIComponent(
        'No sos el acreedor vinculado a este lote, o el lote todavía no tiene un acreedor asignado.'
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

  const campoPor = perfil.role === 'acreedor' ? 'confirmado_acreedor_por' : 'confirmado_admin_por'
  const campoAt = perfil.role === 'acreedor' ? 'confirmado_acreedor_at' : 'confirmado_admin_at'
  const campoOtroPor =
    perfil.role === 'acreedor' ? 'confirmado_admin_por' : 'confirmado_acreedor_por'
  const campoOtroAt = perfil.role === 'acreedor' ? 'confirmado_admin_at' : 'confirmado_acreedor_at'

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
  // Si el lote redirige el cobro a una cuenta externa (sin login), alcanza
  // con la confirmacion del admin -- no tiene sentido pedirle a alguien sin
  // cuenta que confirme nada. Dos ramas explicitas (en vez de armar un solo
  // query condicional) para que quede clara la diferencia exacta entre
  // ambos casos, sin depender de como encadena internamente el builder.
  const { data: pagoClaimado, error: errorClaim } = lote!.cuenta_cobro_externa_id
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

  if (lote.cuenta_cobro_externa_id) {
    const { data: cliente } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', pago.cliente_id)
      .single()

    const conceptoMovimiento = `Pago de ${pago.motivo === 'sena' ? 'seña' : 'cuota'} — Lote ${
      lote.identificador
    } — ${cliente?.full_name ?? 'cliente'}`

    const { error: errorMovimientoExterno } = await supabase.from('cuentas_externas_movimientos').insert({
      cuenta_externa_id: lote.cuenta_cobro_externa_id,
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
  }

  const { data: cuotas } = await supabase
    .from('cuotas')
    .select('id, saldo_pendiente')
    .eq('lote_id', lote.id)
    .gt('saldo_pendiente', 0)
    .order('numero', { ascending: true })

  const resultado = imputarPagoFIFO(
    pagoClaimado.monto,
    (cuotas ?? []).map((cuota) => ({ id: cuota.id, saldoPendiente: cuota.saldo_pendiente }))
  )

  for (const imputacion of resultado.imputaciones) {
    const { error: errorImputacion } = await supabase.from('pago_imputaciones').insert({
      pago_id: pagoClaimado.id,
      cuota_id: imputacion.cuotaId,
      monto_imputado: imputacion.montoImputado,
    })

    if (errorImputacion) {
      // El pago ya quedo marcado "confirmado" (evita que un reintento vuelva
      // a correr el FIFO y duplique lo ya imputado). Si una fila puntual
      // falla aca, queda para revision manual via la tabla de imputaciones
      // -- no seguimos intentando escribir en un estado inconsistente.
      revalidatePath('/admin/pagos')
      return
    }

    const cuota = cuotas!.find((c) => c.id === imputacion.cuotaId)!
    const { error: errorSaldo } = await supabase
      .from('cuotas')
      .update({ saldo_pendiente: cuota.saldo_pendiente - imputacion.montoImputado })
      .eq('id', imputacion.cuotaId)

    if (errorSaldo) {
      revalidatePath('/admin/pagos')
      return
    }
  }

  revalidatePath('/admin/pagos')
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
    .select('id, cliente_id, lote_id, moneda, comprobante_path, motivo, estado, monto')
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
    const { data: cuotas } = await supabase
      .from('cuotas')
      .select('id, saldo_pendiente')
      .eq('lote_id', pago!.lote_id)
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
    }
  }

  revalidatePath('/admin/pagos')
  revalidatePath('/portal-cliente')
}
