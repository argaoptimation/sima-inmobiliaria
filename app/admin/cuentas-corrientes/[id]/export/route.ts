import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'

const ETIQUETA_ORIGEN: Record<string, string> = {
  cobro_cuota: 'Cobro de cuota (automático)',
  transferencia_empresa: 'Transferencia de la empresa',
  pago_directo_cliente: 'Pago directo del cliente',
  reversion_cobro_cuota: 'Reversión (corrección de pago)',
  ajuste_distribucion: 'Ajuste de distribución',
  debe_manual: 'Debe manual (gasto/adelanto/descuento)',
}

// Una coma, comilla o salto de línea adentro de un campo rompería el CSV
// si no se escapa -- "detalle" y "de_parte_de" son texto libre, cualquiera
// de los tres puede aparecer.
function celdaCsv(valor: string): string {
  if (/[",\n]/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`
  }
  return valor
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireAdministrador()

  const { id } = await params
  const { searchParams } = new URL(request.url)
  const filtroLoteId = searchParams.get('lote')
  const filtroOrigen = searchParams.get('origen')
  const filtroDesde = searchParams.get('desde')
  const filtroHasta = searchParams.get('hasta')

  const supabase = await createClient()

  const { data: persona } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', id)
    .maybeSingle()

  if (!persona) {
    return NextResponse.json({ error: 'No se encontró la persona' }, { status: 404 })
  }

  const { data: movimientosData } = await supabase
    .from('movimientos_cuenta_corriente')
    .select(
      'tipo, monto, moneda, cotizacion_dia, origen, fecha_evento, de_parte_de, detalle, lote_id, lotes(identificador)'
    )
    .eq('profile_id', id)
    .order('fecha_evento', { ascending: false })
    .order('created_at', { ascending: false })

  const movimientos = (movimientosData ?? []) as unknown as Array<{
    tipo: 'debe' | 'haber'
    monto: number
    moneda: string
    cotizacion_dia: number | null
    origen: string
    fecha_evento: string
    de_parte_de: string | null
    detalle: string | null
    lote_id: string | null
    lotes: { identificador: string } | null
  }>

  // Mismo filtro que la pantalla (ver page.tsx) -- la descarga tiene que
  // respetar lo que el admin está viendo en ese momento, no volcar siempre
  // el historial completo.
  const movimientosFiltrados = movimientos.filter((movimiento) => {
    if (filtroLoteId && movimiento.lote_id !== filtroLoteId) return false
    if (filtroOrigen && movimiento.origen !== filtroOrigen) return false
    if (filtroDesde && movimiento.fecha_evento < filtroDesde) return false
    if (filtroHasta && movimiento.fecha_evento > filtroHasta) return false
    return true
  })

  const encabezado = ['Fecha', 'Tipo', 'Origen', 'Detalle', 'Lote', 'Monto', 'Moneda', 'Cotización del día']
  const filas = movimientosFiltrados.map((movimiento) =>
    [
      movimiento.fecha_evento,
      movimiento.tipo === 'debe' ? 'Debe' : 'Haber',
      ETIQUETA_ORIGEN[movimiento.origen] ?? movimiento.origen,
      [movimiento.detalle, movimiento.de_parte_de ? `de: ${movimiento.de_parte_de}` : null]
        .filter(Boolean)
        .join(' — '),
      movimiento.lotes?.identificador ?? '',
      String(movimiento.monto),
      movimiento.moneda,
      movimiento.cotizacion_dia ? String(movimiento.cotizacion_dia) : '',
    ]
      .map(celdaCsv)
      .join(',')
  )

  // BOM al principio para que Excel abra los acentos bien en vez de mostrar
  // caracteres raros (quirk conocido de Excel con UTF-8 sin BOM).
  const csv = '﻿' + [encabezado.join(','), ...filas].join('\r\n')

  const nombreArchivo = `cuenta-corriente-${persona.full_name.replace(/[^a-zA-Z0-9]+/g, '-')}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
    },
  })
}
