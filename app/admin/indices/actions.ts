'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { calcularAjusteIndexacion, calcularRangoMesSiguiente } from '@/lib/lotes/aplicar-indexacion'
import { mensajeDeError } from '@/lib/errores'

export async function cargarValorIndice(formData: FormData) {
  await requireAdministrador()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const nombreNuevo = ((formData.get('nombreNuevo') as string) || '').trim()
  const nombreExistente = ((formData.get('nombreExistente') as string) || '').trim()
  const nombre = nombreNuevo || nombreExistente

  const mesInput = (formData.get('periodo') as string) || ''
  const valorRaw = ((formData.get('valor') as string) || '').trim()
  const valor = Number(valorRaw)

  if (!nombre) {
    redirect(`/admin/indices?error=${encodeURIComponent('Elegí un índice existente o escribí el nombre de uno nuevo')}`)
  }

  if (!/^\d{4}-\d{2}$/.test(mesInput)) {
    redirect(`/admin/indices?error=${encodeURIComponent('Elegí un mes válido')}`)
  }

  if (!valorRaw || !Number.isFinite(valor) || valor < -100 || valor > 1000) {
    redirect(`/admin/indices?error=${encodeURIComponent('Ingresá un porcentaje válido')}`)
  }

  const periodo = `${mesInput}-01`

  const { error: errorInsert } = await supabase.from('indices_valores').insert({
    nombre,
    periodo,
    valor,
    cargado_por: user!.id,
  })

  if (errorInsert) {
    const mensaje = mensajeDeError(errorInsert, {
      '23505': `Ya se cargó un valor de "${nombre}" para ese mes`,
    })
    redirect(`/admin/indices?error=${encodeURIComponent(mensaje)}`)
  }

  // Auto-aplicar a mes vencido: mismo mecanismo que la aplicación manual por
  // lote (ajustes_indexacion + saldo_pendiente de cuotas, ver
  // lib/lotes/aplicar-indexacion.ts), pero disparado una sola vez acá para
  // todos los lotes atados a este índice, en vez de que un admin tenga que
  // entrar lote por lote. Nunca retroactivo: al filtrar por
  // saldo_pendiente > 0, una cuota de ese mes ya saldada antes de cargar el
  // índice queda afuera sola, sin necesitar ningún caso especial.
  const { desde, hastaExclusive } = calcularRangoMesSiguiente(periodo)

  const { data: lotesConEsteIndice } = await supabase
    .from('lotes')
    .select('id')
    .eq('moneda', 'ARS')
    .eq('indice_tipo', nombre)

  for (const lote of lotesConEsteIndice ?? []) {
    const { data: cuotasDelMes } = await supabase
      .from('cuotas')
      .select('id, saldo_pendiente, fecha_vencimiento')
      .eq('lote_id', lote.id)
      .gte('fecha_vencimiento', desde)
      .lt('fecha_vencimiento', hastaExclusive)
      .gt('saldo_pendiente', 0)

    if (!cuotasDelMes || cuotasDelMes.length === 0) continue

    const { error: errorAjuste } = await supabase.from('ajustes_indexacion').insert({
      lote_id: lote.id,
      porcentaje: valor,
      fecha_desde: desde,
      aplicado_por: user!.id,
    })

    if (errorAjuste) {
      // Ya se aplicó este mismo ajuste antes para este lote (constraint
      // unique lote_id+fecha_desde+porcentaje) -- backstop defensivo, no
      // debería pasar en el camino normal porque el insert de arriba en
      // indices_valores ya bloquea una segunda carga del mismo mes.
      console.error('No se pudo registrar el ajuste automático de índice:', errorAjuste)
      continue
    }

    const ajustes = calcularAjusteIndexacion(
      valor,
      desde,
      cuotasDelMes.map((cuota) => ({
        id: cuota.id,
        saldoPendiente: cuota.saldo_pendiente,
        fechaVencimiento: cuota.fecha_vencimiento,
      }))
    )

    for (const ajuste of ajustes) {
      const { error: errorSaldo } = await supabase
        .from('cuotas')
        .update({ saldo_pendiente: ajuste.saldoPendienteNuevo })
        .eq('id', ajuste.cuotaId)

      if (errorSaldo) {
        console.error('No se pudo actualizar el saldo de una cuota tras el ajuste automático:', errorSaldo)
      }
    }
  }

  redirect('/admin/indices')
}
