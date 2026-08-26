import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdminOCobrador } from '@/lib/auth/require-admin'

const MOTIVO_ETIQUETA: Record<string, string> = {
  cuota: 'Cuota',
  sena: 'Seña',
  entrega: 'Entrega',
  ajuste: 'Corrección',
}

// Una coma, comilla o salto de línea adentro de un campo rompería el CSV
// si no se escapa -- el identificador del lote es texto libre.
function celdaCsv(valor: string): string {
  if (/[",\n]/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`
  }
  return valor
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// Descarga en CSV (se abre directo en Excel) del mismo resumen que muestra
// /admin/cierre-caja para un día puntual -- pedido de Gabriel (25/08) para
// poder compartirle a Nico un detalle completo del día sin tener que
// transcribirlo a mano.
export async function GET(request: NextRequest) {
  await requireAdminOCobrador()

  const { searchParams } = new URL(request.url)
  const fechaParam = searchParams.get('fecha')
  const fecha = fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam) ? fechaParam : hoyISO()

  const supabase = await createClient()

  const { data: pagosData } = await supabase
    .from('pagos')
    .select(
      'id, monto, moneda, medio_pago, motivo, cliente_id, confirmado_acreedor_at, confirmado_admin_at, lote_id, lotes(identificador)'
    )
    .eq('estado', 'confirmado')

  const pagos = (pagosData ?? []) as unknown as Array<{
    id: string
    monto: number
    moneda: string
    medio_pago: 'efectivo' | 'transferencia'
    motivo: string
    cliente_id: string
    confirmado_acreedor_at: string | null
    confirmado_admin_at: string | null
    lote_id: string
    lotes: { identificador: string } | null
  }>

  // Mismo cálculo que la pantalla (ver page.tsx): "recibido el día X" es el
  // toque de confirmación más tardío entre acreedor y admin.
  function fechaDeConfirmacion(pago: (typeof pagos)[number]): string | null {
    const candidatos = [pago.confirmado_acreedor_at, pago.confirmado_admin_at].filter(
      (valor): valor is string => valor !== null
    )
    if (candidatos.length === 0) return null
    const masTardio = candidatos.reduce((a, b) => (a > b ? a : b))
    return masTardio.slice(0, 10)
  }

  const pagosDelDia = pagos.filter((pago) => fechaDeConfirmacion(pago) === fecha)

  const clienteIds = [...new Set(pagosDelDia.map((pago) => pago.cliente_id))]
  const { data: clientes } =
    clienteIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', clienteIds)
      : { data: [] }
  const nombreClientePorId = new Map((clientes ?? []).map((persona) => [persona.id, persona.full_name]))

  const totalesPorMedioYMoneda = new Map<string, number>()
  for (const pago of pagosDelDia) {
    const clave = `${pago.medio_pago}|${pago.moneda}`
    totalesPorMedioYMoneda.set(clave, (totalesPorMedioYMoneda.get(clave) ?? 0) + pago.monto)
  }

  const filasResumen = [...totalesPorMedioYMoneda.entries()].map(([clave, total]) => {
    const [medio, moneda] = clave.split('|')
    return [medio === 'efectivo' ? 'Efectivo' : 'Transferencia', moneda, String(total)]
      .map(celdaCsv)
      .join(',')
  })

  const filasDetalle = pagosDelDia.map((pago) =>
    [
      pago.lotes?.identificador ?? '',
      nombreClientePorId.get(pago.cliente_id) ?? '',
      pago.medio_pago === 'efectivo' ? 'Efectivo' : 'Transferencia',
      MOTIVO_ETIQUETA[pago.motivo] ?? pago.motivo,
      String(pago.monto),
      pago.moneda,
    ]
      .map(celdaCsv)
      .join(',')
  )

  const bloques = [
    `Cierre de caja — ${fecha}`,
    '',
    'Resumen',
    'Medio,Moneda,Total',
    ...filasResumen,
    '',
    'Detalle',
    'Lote,Cliente,Medio,Motivo,Monto,Moneda',
    ...filasDetalle,
  ]

  // BOM al principio para que Excel abra los acentos bien en vez de mostrar
  // caracteres raros (quirk conocido de Excel con UTF-8 sin BOM).
  const csv = '﻿' + bloques.join('\r\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="cierre-caja-${fecha}.csv"`,
    },
  })
}
