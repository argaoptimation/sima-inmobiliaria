import { test, expect } from '@playwright/test'
import ExcelJS from 'exceljs'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'
import { etiquetaMes } from '../../lib/fecha/meses'

// LA TERCERA COLUMNA (10/09). Lo que Nicolás pidió en la llamada y la
// plataforma no sabía contestar: cuánto le ASIGNÓ a alguien para cobrar,
// contra cuánto le CORRESPONDE de verdad.
//
// Su ejemplo textual fue "le asignaste 900 y en realidad debería cobrar
// 510, por lo tanto le estás dando 390 de más". Estos tests arman ese mismo
// caso con números redondos y verifican que la pantalla lo diga con
// palabras, no que dibuje una tabla.

test.describe('Mes a mes de un acreedor', () => {
  let fixtures: TestFixtures

  test.beforeEach(async () => {
    fixtures = await ensureTestFixtures()

    // Arranque determinístico: las distribuciones y los destinos de cobro
    // los deja cada test, y los movimientos manuales no cuelgan de ningún
    // lote, así que la limpieza en cascada de ensureTestFixtures no los
    // alcanza (mismo motivo que en cuenta-corriente.spec.ts).
    const admin = createAdminClient()
    await admin.from('cuota_distribuciones').delete().in('cuota_id', fixtures.cuotaIds)
    await admin
      .from('cuotas')
      .update({ cuenta_cobro_id: null, cuenta_cobro_externa_id: null })
      .in('id', fixtures.cuotaIds)
    await admin
      .from('movimientos_cuenta_corriente')
      .delete()
      .eq('profile_id', fixtures.acreedorConDatos.id)
  })

  async function mesDeLaCuota(cuotaId: string) {
    const { data } = await createAdminClient()
      .from('cuotas')
      .select('fecha_vencimiento')
      .eq('id', cuotaId)
      .single()
    return etiquetaMes(data!.fecha_vencimiento.slice(0, 7))
  }

  test('la cuota que cobra él entera contra la parte que le toca: la diferencia sale en castellano', async ({
    page,
  }) => {
    const admin = createAdminClient()

    // Cuota 1 (de 1.000): le corresponden 600 y además la cobra él entera.
    // Le van a entrar 1.000 cuando en realidad le tocaban 600.
    await admin.from('cuota_distribuciones').insert({
      cuota_id: fixtures.cuotaIds[0],
      profile_id: fixtures.acreedorConDatos.id,
      monto: 600,
    })
    await admin
      .from('cuotas')
      .update({ cuenta_cobro_id: fixtures.acreedorConDatos.id })
      .eq('id', fixtures.cuotaIds[0])

    // Cuota 2: le corresponden 600 pero la cobra la empresa. Le falta.
    await admin.from('cuota_distribuciones').insert({
      cuota_id: fixtures.cuotaIds[1],
      profile_id: fixtures.acreedorConDatos.id,
      monto: 600,
    })

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/cuentas-corrientes/${fixtures.acreedorConDatos.id}`)

    const filaPrimerMes = page.getByRole('row', {
      name: new RegExp(await mesDeLaCuota(fixtures.cuotaIds[0])),
    })
    await expect(filaPrimerMes).toContainText('Va a cobrar 400 USD de más')
    await expect(filaPrimerMes).toContainText('1.000')

    const filaSegundoMes = page.getByRole('row', {
      name: new RegExp(await mesDeLaCuota(fixtures.cuotaIds[1])),
    })
    await expect(filaSegundoMes).toContainText('Le falta cobrar 600 USD')

    // El detalle cuota por cuota tiene que explicar de dónde salen esos dos
    // números: es la tabla a la que se baja cuando el total no cierra.
    // El <summary>, no el <details>: clickear el contenedor no lo abre.
    await page.locator('summary', { hasText: 'Ver el detalle' }).click()
    await expect(page.getByRole('cell', { name: 'Él', exact: true })).toHaveCount(1)
  })

  test('el rango de meses y el filtro de movimientos no se pisan entre sí', async ({ page }) => {
    // Un movimiento cualquiera, solo para que exista la barra de filtros de
    // la tabla de movimientos (sin movimientos no se renderiza).
    const { error } = await createAdminClient().from('movimientos_cuenta_corriente').insert({
      profile_id: fixtures.acreedorConDatos.id,
      tipo: 'haber',
      monto: 100,
      moneda: 'USD',
      origen: 'transferencia_empresa',
      fecha_evento: '2026-09-01',
      detalle: 'E2E mes a mes',
      cargado_por: fixtures.admin.id,
    })
    if (error) throw new Error(`No se pudo cargar el movimiento: ${error.message}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/cuentas-corrientes/${fixtures.acreedorConDatos.id}`)

    // Filtrar los movimientos por origen no puede borrar el rango de meses
    // de la proyección, que está en otro form de la misma pantalla.
    // El form de los filtros, no el de "Registrar movimiento manual": los
    // dos tienen un select llamado `origen`, y solo el de filtros tiene el
    // botón "Filtrar".
    await page
      .locator('form')
      .filter({ hasText: 'Filtrar' })
      .locator('select[name="origen"]')
      .selectOption('transferencia_empresa')
    await page.waitForURL(/origen=transferencia_empresa/)
    expect(page.url()).toMatch(/desde=\d{4}-\d{2}/)

    // Y al revés: cambiar el mes no puede borrar el filtro de origen.
    await page.locator('input[type="month"][name="desde"]').fill('2026-01')
    await page.waitForURL(/desde=2026-01/)
    expect(page.url()).toMatch(/origen=transferencia_empresa/)
  })

  test('una sola descarga trae las cuatro hojas: mes a mes, proyección, órdenes de pago y movimientos', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/cuentas-corrientes/${fixtures.acreedorConDatos.id}`)

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Descargar Excel' }).click(),
    ])

    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream!) {
      chunks.push(chunk as Buffer)
    }

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Buffer.concat(chunks))

    expect(workbook.worksheets.map((hoja) => hoja.name)).toEqual([
      'Mes a mes',
      'Proyección',
      'Órdenes de pago',
      'Cuenta corriente',
    ])
  })

  test('el link viejo de la proyección sigue andando: ahora lleva a la pantalla unificada', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(
      `/admin/cuentas-corrientes/${fixtures.acreedorConDatos.id}/proyeccion?desde=2026-03&hasta=2026-05`
    )

    await expect(page).toHaveURL(
      new RegExp(`/admin/cuentas-corrientes/${fixtures.acreedorConDatos.id}\\?desde=2026-03&hasta=2026-05`)
    )
    await expect(page.getByRole('heading', { name: 'Mes a mes' })).toBeVisible()
  })
})
