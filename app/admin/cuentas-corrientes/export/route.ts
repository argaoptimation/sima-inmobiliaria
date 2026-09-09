import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import {
  obtenerResumenDeTransferencias,
  type PersonaEnResumen,
} from '@/lib/cuenta-corriente/resumen-transferencias'
import { monedasOrdenadas } from '@/lib/cuenta-corriente/totales-a-transferir'
import {
  armarFilasDeMovimiento,
  celdasDeFila,
  COLUMNAS_PLANILLA,
  type MovimientoCrudo,
} from '@/lib/cuenta-corriente/filas-movimiento'
import {
  traerDatosDeLotes,
  traerDatosDeCuotas,
} from '@/lib/cuenta-corriente/traer-datos-planilla'
import { obtenerProyeccionCobranza } from '@/lib/cuenta-corriente/proyeccion'
import { etiquetaMesCorta, ultimoDiaDelMes, mesRelativoAHoy } from '@/lib/fecha/meses'

// El Excel del "Resumen de transferencias por acreedor" (add-on confirmado
// por Nicolás el 09/09). Un archivo con dos hojas:
//
//   1. "A transferir": el resumen global por moneda, el cuadro por persona,
//      y el detalle fila por fila de los movimientos que componen cada
//      saldo -- para que el acreedor que lo recibe pueda verificarlo solo
//      sin pedirle nada a nadie.
//   2. "Proyección": lo que va a cobrar cada uno mes a mes según los
//      vencimientos ya cargados. Es lo mismo que ya se podía bajar de a una
//      persona por vez; acá van todos en la misma hoja.
//
// Las dos hojas salen de los mismos módulos que usa la pantalla
// (resumen-transferencias.ts, filas-movimiento.ts, proyeccion.ts): el Excel
// no recalcula nada por su cuenta.

const ESTILO_TITULO = { bold: true, size: 14 } as const
const ESTILO_SUBTITULO = { bold: true, size: 12 } as const
const ESTILO_ENCABEZADO = {
  font: { bold: true, color: { argb: 'FFFFFFFF' } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } } as const,
}

function encabezar(fila: ExcelJS.Row) {
  fila.eachCell((celda) => {
    celda.font = ESTILO_ENCABEZADO.font
    celda.fill = ESTILO_ENCABEZADO.fill
  })
}

export async function GET(request: NextRequest) {
  await requireAdministrador()

  const { searchParams } = new URL(request.url)
  const filtroNombre = searchParams.get('q')
  // Solo los que esperan plata, que es el caso de uso real: la lista con la
  // que se va al banco. Sin el filtro sale todo el mundo, incluida la gente
  // al día, que es lo que se quiere para archivar el mes cerrado.
  const soloPendientes = searchParams.get('pendientes') === '1'
  const mesDesde = searchParams.get('desde') || mesRelativoAHoy(0)
  const mesHasta = searchParams.get('hasta') || mesRelativoAHoy(5)

  if (mesDesde > mesHasta) {
    return NextResponse.json({ error: 'El rango de meses es inválido' }, { status: 400 })
  }

  const supabase = await createClient()

  const { personas: todas, totales } = await obtenerResumenDeTransferencias(supabase, {
    filtroNombre,
  })

  const personas = soloPendientes
    ? todas.filter((persona) =>
        Object.values(persona.porMoneda).some((situacion) => situacion.saldo > 0)
      )
    : todas

  const workbook = new ExcelJS.Workbook()

  // ---------------------------------------------------------------- hoja 1
  const hoja = workbook.addWorksheet('A transferir')

  hoja.addRow(['Resumen de transferencias por acreedor']).font = ESTILO_TITULO
  hoja.addRow([`Generado el ${new Date().toLocaleDateString('es-AR')}`])
  if (filtroNombre) hoja.addRow([`Filtrado por: ${filtroNombre}`])
  if (soloPendientes) hoja.addRow(['Solo las personas a las que hay que girarles plata'])
  hoja.addRow([])

  hoja.addRow(['Total a girar']).font = ESTILO_SUBTITULO
  encabezar(
    hoja.addRow([
      'Moneda',
      'Hay que girar',
      'A cuántas personas',
      'Cobrado de más',
      'Por cuántas personas',
    ])
  )
  const monedasDelTotal = monedasOrdenadas(totales)
  for (const moneda of monedasDelTotal) {
    const total = totales[moneda]
    hoja.addRow([
      moneda,
      total.aGirar,
      total.cuantosEsperan,
      total.deMas,
      total.cuantosTienenDeMas,
    ])
  }
  if (monedasDelTotal.length === 0) hoja.addRow(['No hay movimientos cargados todavía.'])

  hoja.addRow([])
  hoja.addRow(['Por persona']).font = ESTILO_SUBTITULO
  encabezar(
    hoja.addRow(['Acreedor', 'Rol', 'Moneda', 'Le corresponde', 'Ya cobró', 'A transferir'])
  )

  if (personas.length === 0) {
    hoja.addRow(['Nadie coincide con estos filtros.'])
  }
  for (const persona of personas) {
    const monedasDeLaPersona = monedasOrdenadas(persona.porMoneda)
    if (monedasDeLaPersona.length === 0) {
      hoja.addRow([persona.nombre, persona.rol, '—', 0, 0, 0, 'Sin movimientos'])
      continue
    }
    for (const moneda of monedasDeLaPersona) {
      const situacion = persona.porMoneda[moneda]
      hoja.addRow([
        persona.nombre,
        persona.rol,
        moneda,
        situacion.leCorresponde,
        situacion.cobroDirecto,
        situacion.saldo,
      ])
    }
  }

  // El detalle: los mismos movimientos que se ven en la cuenta corriente de
  // cada uno, con una columna más adelante para saber de quién es la fila.
  const idsDePersonas = personas.map((persona) => persona.id)
  const { data: movimientosData } = idsDePersonas.length
    ? await supabase
        .from('movimientos_cuenta_corriente')
        .select(
          'id, profile_id, tipo, monto, moneda, cotizacion_dia, origen, fecha_evento, de_parte_de, detalle, lote_id, cuota_id'
        )
        .in('profile_id', idsDePersonas)
        .order('fecha_evento', { ascending: false })
        .order('created_at', { ascending: false })
    : { data: [] }

  const movimientos = (movimientosData ?? []) as unknown as Array<
    MovimientoCrudo & { profile_id: string }
  >

  const lotePorId = await traerDatosDeLotes(
    supabase,
    movimientos.map((m) => m.lote_id).filter((id): id is string => Boolean(id))
  )
  const cuotaPorId = await traerDatosDeCuotas(
    supabase,
    movimientos.map((m) => m.cuota_id).filter((id): id is string => Boolean(id))
  )

  const nombrePorPersona = new Map(personas.map((persona) => [persona.id, persona.nombre]))

  hoja.addRow([])
  hoja.addRow(['Detalle de los movimientos que forman cada saldo']).font = ESTILO_SUBTITULO
  encabezar(hoja.addRow(['Acreedor', ...COLUMNAS_PLANILLA]))

  // Se arman por persona y no todos juntos para que el Excel salga agrupado:
  // el que lo recibe lee su bloque de corrido, no busca sus filas entre las
  // de los demás.
  let hayDetalle = false
  for (const persona of personas) {
    const suyos = movimientos.filter((movimiento) => movimiento.profile_id === persona.id)
    if (suyos.length === 0) continue
    for (const fila of armarFilasDeMovimiento(suyos, lotePorId, cuotaPorId)) {
      hoja.addRow([nombrePorPersona.get(persona.id) ?? '', ...celdasDeFila(fila)])
      hayDetalle = true
    }
  }
  if (!hayDetalle) hoja.addRow(['Sin movimientos para estos filtros.'])

  hoja.columns = [
    { width: 24 }, // Acreedor
    { width: 12 }, // Fecha
    { width: 18 }, // Tipo de movimiento
    { width: 24 }, // Concepto
    { width: 20 }, // Loteo
    { width: 8 }, // Mza
    { width: 12 }, // Lote
    { width: 24 }, // Cliente
    { width: 10 }, // Mes de
    { width: 12 }, // Nro cuota
    { width: 14 }, // Monto
    { width: 10 }, // Moneda
    { width: 16 }, // Cotización del día
    { width: 34 }, // Detalle
  ]

  // ---------------------------------------------------------------- hoja 2
  const desde = `${mesDesde}-01`
  const hasta = `${mesHasta}-${String(ultimoDiaDelMes(mesHasta)).padStart(2, '0')}`

  const hojaProyeccion = workbook.addWorksheet('Proyección')
  hojaProyeccion.addRow(['Proyección de cobranza']).font = ESTILO_TITULO
  hojaProyeccion.addRow([`${etiquetaMesCorta(mesDesde)} a ${etiquetaMesCorta(mesHasta)}`])
  hojaProyeccion.addRow([
    'Lo que le toca cobrar a cada uno según los vencimientos ya cargados. No es plata cobrada: es lo que va a entrar si todos pagan en fecha.',
  ])
  hojaProyeccion.addRow([])

  // Las proyecciones se piden en paralelo: son N consultas independientes y
  // en serie el Excel de veinte acreedores tardaría veinte veces más.
  const proyecciones = await Promise.all(
    personas.map(async (persona: PersonaEnResumen) => ({
      persona,
      proyeccion: await obtenerProyeccionCobranza(supabase, persona.id, desde, hasta),
    }))
  )

  const meses = proyecciones.find(({ proyeccion }) => proyeccion.meses.length)?.proyeccion.meses ?? []

  encabezar(
    hojaProyeccion.addRow([
      'Acreedor',
      'Lote',
      'Comprador',
      'Moneda',
      ...meses.map(etiquetaMesCorta),
      'Total',
    ])
  )

  let hayProyeccion = false
  for (const { persona, proyeccion } of proyecciones) {
    for (const fila of proyeccion.filas) {
      hojaProyeccion.addRow([
        persona.nombre,
        fila.loteIdentificador,
        fila.compradorNombre ?? '',
        fila.moneda,
        ...meses.map((mes) => fila.porMes[mes] ?? 0),
        fila.total,
      ])
      hayProyeccion = true
    }
  }
  if (!hayProyeccion) {
    hojaProyeccion.addRow(['Nadie tiene cuotas por vencer en este rango.'])
  }

  hojaProyeccion.columns = [
    { width: 24 }, // Acreedor
    { width: 24 }, // Lote
    { width: 24 }, // Comprador
    { width: 10 }, // Moneda
    ...meses.map(() => ({ width: 12 })),
    { width: 14 }, // Total
  ]

  const buffer = await workbook.xlsx.writeBuffer()

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="resumen-transferencias-por-acreedor.xlsx"',
    },
  })
}
