import { test, expect, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'
import { hoyArgentina } from '../../lib/fecha/hoy-argentina'
import { etiquetaMesCorta } from '../../lib/fecha/meses'

// LOS CUATRO EXCEL HABLAN IGUAL (11/09, pedido de Gabriel: "debe usar la
// misma estructura de columnas en todos, para no tener que estar entendiendo
// todos los excels", y "siempre que diga fechas hay que usar el formato
// DD/MM/AA").
//
// No se revisa hoja por hoja dónde está cada columna. Se bajan los cuatro
// Excel de la plataforma y la regla de Gabriel se aplica a TODAS sus hojas y
// a todas sus celdas: así una hoja que se agregue mañana queda cubierta sin
// tocar este test. Y un mismo lote, con loteo, manzana y número cargados,
// tiene que leerse igual en cada hoja que lo nombra.

function sumarMeses(fechaISO: string, meses: number): string {
  const [anio, mes, dia] = fechaISO.split('-').map(Number)
  return new Date(Date.UTC(anio, mes - 1 + meses, dia)).toISOString().slice(0, 10)
}

async function bajarExcel(page: Page, url: string) {
  const respuesta = await page.request.get(url)
  expect(respuesta.ok(), `${url} respondió ${respuesta.status()}`).toBe(true)
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(await respuesta.body())
  return libro
}

test.describe('Los Excel de la plataforma', () => {
  let fixtures: TestFixtures
  const marca = Date.now()
  const nombreLoteo = `E2E Loteo Planillas ${marca}`
  const creados = {
    loteoId: '',
    loteId: '',
    cuotaIds: [] as string[],
    pagoId: '',
    cuentaExternaId: '',
  }
  let primerVencimiento = ''

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
    const admin = createAdminClient()
    const hoy = hoyArgentina()

    async function crear(tabla: string, fila: Record<string, unknown>) {
      const { data, error } = await admin.from(tabla).insert(fila).select('id').single()
      if (error || !data) throw new Error(`No se pudo crear la fila de ${tabla}: ${error?.message}`)
      return data.id as string
    }

    creados.loteoId = await crear('loteos', { nombre: nombreLoteo })
    creados.loteId = await crear('lotes', {
      identificador: `E2E Planillas ${marca}`,
      loteo_id: creados.loteoId,
      manzana: '4',
      numero_lote: '12',
      moneda: 'USD',
      estado: 'vendido',
      cliente_id: fixtures.cliente.id,
      acreedor_id: fixtures.acreedorConDatos.id,
      cantidad_cuotas: 3,
      monto_cuota_base: 1000,
    })

    // Vencen el mes que viene y los dos siguientes: adentro del rango que
    // los Excel proyectan si no se elige otro (este mes y los cinco que
    // siguen).
    primerVencimiento = sumarMeses(`${hoy.slice(0, 7)}-10`, 1)
    const { data: cuotas, error: errorCuotas } = await admin
      .from('cuotas')
      .insert(
        [1, 2, 3].map((numero) => ({
          lote_id: creados.loteId,
          numero,
          monto_base: 1000,
          saldo_pendiente: 1000,
          fecha_vencimiento: sumarMeses(primerVencimiento, numero - 1),
        }))
      )
      .select('id, numero')
    if (errorCuotas || !cuotas) {
      throw new Error(`No se pudieron crear las cuotas: ${errorCuotas?.message}`)
    }
    creados.cuotaIds = cuotas.map((cuota) => cuota.id)
    const cuota1 = cuotas.find((cuota) => cuota.numero === 1)!.id

    // La cuota 1 le toca entera al acreedor y la cobra él: sale en su
    // proyección y en sus órdenes de pago.
    await crear('cuota_distribuciones', {
      cuota_id: cuota1,
      profile_id: fixtures.acreedorConDatos.id,
      monto: 1000,
    })
    await admin
      .from('cuotas')
      .update({ cuenta_cobro_id: fixtures.acreedorConDatos.id })
      .eq('id', cuota1)

    // Un movimiento de esa cuota: sale en su cuenta corriente y en el
    // resumen de transferencias.
    await crear('movimientos_cuenta_corriente', {
      profile_id: fixtures.acreedorConDatos.id,
      tipo: 'debe',
      monto: 1000,
      moneda: 'USD',
      origen: 'debe_manual',
      fecha_evento: hoy,
      detalle: `E2E planillas ${marca}`,
      lote_id: creados.loteId,
      cuota_id: cuota1,
      cargado_por: fixtures.admin.id,
    })

    // Un pago en efectivo confirmado hoy e imputado a la cuota 1: sale en
    // el cierre de caja.
    creados.pagoId = await crear('pagos', {
      cliente_id: fixtures.cliente.id,
      lote_id: creados.loteId,
      monto: 1000,
      moneda: 'USD',
      motivo: 'cuota',
      medio_pago: 'efectivo',
      estado: 'confirmado',
      confirmado_admin_por: fixtures.admin.id,
      confirmado_admin_at: new Date().toISOString(),
    })
    await crear('pago_imputaciones', {
      pago_id: creados.pagoId,
      cuota_id: cuota1,
      monto_imputado: 1000,
    })

    // Y el cobro de ese pago en una cuenta externa: sale en la suya.
    creados.cuentaExternaId = await crear('cuentas_externas', {
      nombre: `E2E Planillas ${marca}`,
      titular: 'E2E Planillas',
      alias: 'e2e.planillas',
      banco: 'Banco Test',
    })
    await crear('cuentas_externas_movimientos', {
      cuenta_externa_id: creados.cuentaExternaId,
      tipo: 'credito',
      monto: 1000,
      moneda: 'USD',
      concepto: `E2E planillas ${marca}`,
      fecha_evento: hoy,
      lote_id: creados.loteId,
      pago_id: creados.pagoId,
      cargado_por: fixtures.admin.id,
    })
  })

  test.afterAll(async () => {
    const admin = createAdminClient()
    if (creados.cuentaExternaId) {
      await admin
        .from('cuentas_externas_movimientos')
        .delete()
        .eq('cuenta_externa_id', creados.cuentaExternaId)
      await admin.from('cuentas_externas').delete().eq('id', creados.cuentaExternaId)
    }
    if (creados.pagoId) {
      await admin.from('pago_imputaciones').delete().eq('pago_id', creados.pagoId)
      await admin.from('pagos').delete().eq('id', creados.pagoId)
    }
    if (creados.loteId) {
      await admin.from('movimientos_cuenta_corriente').delete().eq('lote_id', creados.loteId)
      if (creados.cuotaIds.length > 0) {
        await admin.from('cuota_distribuciones').delete().in('cuota_id', creados.cuotaIds)
      }
      await admin.from('lotes').delete().eq('id', creados.loteId)
    }
    if (creados.loteoId) {
      await admin.from('loteos').delete().eq('id', creados.loteoId)
    }
  })

  test('los cuatro identifican el lote con las mismas columnas y escriben las fechas DD/MM/AA', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    const hoy = hoyArgentina()

    const libros: [string, ExcelJS.Workbook][] = [
      [
        'Acreedor',
        await bajarExcel(page, `/admin/cuentas-corrientes/${fixtures.acreedorConDatos.id}/export`),
      ],
      ['Resumen de transferencias', await bajarExcel(page, '/admin/cuentas-corrientes/export')],
      [
        'Cuenta externa',
        await bajarExcel(page, `/admin/cuentas-externas/${creados.cuentaExternaId}/export`),
      ],
      ['Cierre de caja', await bajarExcel(page, `/admin/cierre-caja/export?fecha=${hoy}`)],
    ]

    const mesDeLaCuota = etiquetaMesCorta(primerVencimiento.slice(0, 7))
    const hojasQueNombranElLote = new Set<string>()
    let fechas = 0

    for (const [nombreDelLibro, libro] of libros) {
      libro.eachSheet((hoja) => {
        const donde = `${nombreDelLibro} → ${hoja.name}`
        // Los encabezados de la última tabla que empezó: una hoja puede
        // tener dos (el resumen y el detalle), cada una con los suyos.
        let encabezados: unknown[] = []

        hoja.eachRow((fila) => {
          const celdas = (fila.values as unknown[]).slice(1)
          const enEstaFila = `${donde}, fila ${fila.number}`

          if (celdas.includes('Moneda')) encabezados = celdas

          celdas.forEach((valor, indice) => {
            // Toda fecha es una fecha de verdad, guardada como DD/MM/AA.
            if (valor instanceof Date) {
              fechas += 1
              expect(fila.getCell(indice + 1).numFmt, enEstaFila).toBe('dd/mm/yy')
            }

            // Ninguna fecha escrita como la guarda la base, ni en las
            // columnas ni en los títulos. El "Detalle" queda afuera: es texto
            // que escribió una persona, y si puso una fecha es suya.
            if (typeof valor === 'string' && encabezados[indice] !== 'Detalle') {
              expect(valor, `${enEstaFila}: fecha con el formato de la base`).not.toMatch(
                /\d{4}-\d{2}-\d{2}/
              )
            }

            expect(valor, `${enEstaFila}: es "Cliente" en todos los Excel`).not.toBe('Comprador')

            // Donde hay una columna "Lote", está en el bloque de siempre.
            if (valor === 'Lote') {
              expect(celdas.slice(indice - 2, indice + 2), enEstaFila).toEqual([
                'Loteo',
                'Mza',
                'Lote',
                'Cliente',
              ])
            }
          })

          const inicioDelLote = celdas.indexOf(nombreLoteo)
          if (inicioDelLote === -1) return

          hojasQueNombranElLote.add(donde)
          expect(celdas.slice(inicioDelLote, inicioDelLote + 4), enEstaFila).toEqual([
            nombreLoteo,
            '4',
            '12',
            'E2E Cliente',
          ])

          const columnaNroCuota = encabezados.indexOf('Nro cuota')
          if (columnaNroCuota !== -1) {
            expect(celdas.slice(columnaNroCuota - 1, columnaNroCuota + 1), enEstaFila).toEqual([
              mesDeLaCuota,
              '1/3',
            ])
          }
        })
      })
    }

    // Que las reglas de arriba hayan tenido algo que revisar: sin fechas ni
    // filas del lote, el test pasaría sin probar nada.
    expect(fechas).toBeGreaterThan(0)
    expect([...hojasQueNombranElLote].sort()).toEqual(
      [
        'Acreedor → Proyección',
        'Acreedor → Órdenes de pago',
        'Acreedor → Cuenta corriente',
        'Resumen de transferencias → A transferir',
        'Resumen de transferencias → Proyección',
        'Cuenta externa → Cuenta externa',
        'Cierre de caja → Cierre de caja',
      ].sort()
    )
  })
})
