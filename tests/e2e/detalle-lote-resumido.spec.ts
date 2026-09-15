import { test, expect, type Page } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'
import { hoyArgentina } from '../../lib/fecha/hoy-argentina'
import { sumarDias } from '../../lib/fecha/sumar-dias'

// El detalle del lote resumido (14/09, pedido de Gabriel): "si hay 60
// cuotas, se visualizan las 60 [...] tendríamos que hacer un scroll muy
// largo para recién ir y modificar todos los datos del lote".
//
// Se ven 5 cuotas (las 2 últimas pagadas, la próxima a cobrar y las 2 que
// siguen), 5 pagos y un botón para desplegar el resto. Lo que cuida el
// último test no es el botón sino el motivo del pedido: que "Datos del lote"
// quede de verdad más cerca.
test.describe('Detalle del lote resumido', () => {
  let fixtures: TestFixtures
  const lotesCreados: string[] = []
  const pagosCreados: string[] = []
  let loteLargo: string
  let loteRefinanciado: string

  async function insertar(tabla: string, fila: Record<string, unknown>): Promise<string> {
    const { data, error } = await createAdminClient().from(tabla).insert(fila).select('id').single()
    if (error || !data) throw new Error(`No se pudo crear ${tabla}: ${error?.message}`)
    return data.id as string
  }

  async function crearLote(identificador: string): Promise<string> {
    const id = await insertar('lotes', {
      identificador,
      moneda: 'USD',
      estado: 'vendido',
      cliente_id: fixtures.cliente.id,
      acreedor_id: fixtures.acreedorConDatos.id,
    })
    lotesCreados.push(id)
    return id
  }

  async function crearPago(loteId: string, datos: Record<string, unknown>): Promise<string> {
    const id = await insertar('pagos', {
      cliente_id: fixtures.cliente.id,
      lote_id: loteId,
      moneda: 'USD',
      motivo: 'cuota',
      medio_pago: 'efectivo',
      ...datos,
    })
    pagosCreados.push(id)
    return id
  }

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
    const admin = createAdminClient()
    const hoy = hoyArgentina()
    const marca = Date.now()

    // 60 cuotas: 1 a 10 pagadas, 11 y 12 vencidas, 13 a 60 por vencer.
    loteLargo = await crearLote(`E2E Resumen 60 cuotas ${marca}`)
    const { error: errorCuotas } = await admin.from('cuotas').insert(
      Array.from({ length: 60 }, (_, i) => {
        const numero = i + 1
        const fecha =
          numero === 11 ? sumarDias(hoy, -40) : numero === 12 ? sumarDias(hoy, -10) : sumarDias(hoy, (numero - 12) * 30)
        return {
          lote_id: loteLargo,
          numero,
          monto_base: 1000,
          saldo_pendiente: numero <= 10 ? 0 : 1000,
          fecha_vencimiento: numero <= 10 ? sumarDias(hoy, (numero - 13) * 30) : fecha,
        }
      })
    )
    if (errorCuotas) throw new Error(`No se pudieron crear las cuotas: ${errorCuotas.message}`)

    // 7 pagos confirmados, uno por día, y uno sin confirmar de hace un mes:
    // el más viejo de todos, pero tiene que verse igual.
    for (let dia = 0; dia < 7; dia++) {
      await crearPago(loteLargo, {
        monto: 1000 + dia,
        estado: 'confirmado',
        confirmado_admin_por: fixtures.admin.id,
        confirmado_admin_at: new Date(Date.now() - dia * 86_400_000).toISOString(),
        created_at: new Date(Date.now() - dia * 86_400_000).toISOString(),
      })
    }
    await crearPago(loteLargo, {
      monto: 777,
      estado: 'pendiente',
      created_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    })

    // 3 cuotas de 1000: la 1 pagada, la 2 con 300 pagados antes de
    // refinanciar, la 3 sin nada. Los 1700 que faltaban se refinanciaron en
    // 2 cuotas de 850.
    loteRefinanciado = await crearLote(`E2E Resumen refinanciado ${marca}`)
    // Todas las filas con las mismas columnas: en un insert de varias filas,
    // PostgREST manda null en la que le falta a una, no el default.
    const { data: cuotasRefi, error: errorRefi } = await admin
      .from('cuotas')
      .insert(
        [
          { numero: 1, plan: 1, monto_base: 1000, saldo_pendiente: 0, refinanciada: false, dias: -90 },
          { numero: 2, plan: 1, monto_base: 1000, saldo_pendiente: 0, refinanciada: true, dias: -60 },
          { numero: 3, plan: 1, monto_base: 1000, saldo_pendiente: 0, refinanciada: true, dias: -30 },
          { numero: 4, plan: 2, monto_base: 850, saldo_pendiente: 850, refinanciada: false, dias: 30 },
          { numero: 5, plan: 2, monto_base: 850, saldo_pendiente: 850, refinanciada: false, dias: 60 },
        ].map(({ dias, ...cuota }) => ({
          ...cuota,
          lote_id: loteRefinanciado,
          fecha_vencimiento: sumarDias(hoy, dias),
        }))
      )
      .select('id, numero')
    if (errorRefi || !cuotasRefi) throw new Error(`No se pudieron crear las cuotas: ${errorRefi?.message}`)

    const pagoRefi = await crearPago(loteRefinanciado, {
      monto: 1300,
      estado: 'confirmado',
      confirmado_admin_por: fixtures.admin.id,
      confirmado_admin_at: new Date().toISOString(),
    })
    const cuotaId = (numero: number) => cuotasRefi.find((cuota) => cuota.numero === numero)!.id
    await insertar('pago_imputaciones', { pago_id: pagoRefi, cuota_id: cuotaId(1), monto_imputado: 1000 })
    await insertar('pago_imputaciones', { pago_id: pagoRefi, cuota_id: cuotaId(2), monto_imputado: 300 })
  })

  test.afterAll(async () => {
    const admin = createAdminClient()
    if (pagosCreados.length > 0) {
      await admin.from('pago_imputaciones').delete().in('pago_id', pagosCreados)
      await admin.from('pagos').delete().in('id', pagosCreados)
    }
    if (lotesCreados.length > 0) {
      await admin.from('lotes').delete().in('id', lotesCreados)
    }
  })

  const cuotasVisibles = (page: Page) =>
    page
      .getByTestId('tabla-cuotas')
      .locator('tbody tr:visible')
      .evaluateAll((filas) => filas.map((fila) => Number((fila as HTMLElement).dataset.cuota)))

  test('se ven 5 cuotas alrededor de la próxima a cobrar, y el botón despliega las 60', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteLargo}`)

    await expect.poll(() => cuotasVisibles(page)).toEqual([9, 10, 11, 12, 13])

    const resumen = page.getByTestId('resumen-cuotas')
    await expect(resumen).toContainText('10 pagadas')
    await expect(resumen).toContainText('2 vencidas')
    await expect(resumen).toContainText('48 por vencer')
    await expect(page.getByText('10 / 60 pagadas')).toBeVisible()

    const fila = (numero: number) => page.locator(`[data-testid="tabla-cuotas"] tr[data-cuota="${numero}"]`)
    await expect(fila(10)).toContainText('Pagada')
    await expect(fila(11)).toContainText('Vencida')
    await expect(fila(13)).toContainText('Por vencer')
    await expect(
      page.getByText('Se ven 5 de 60, alrededor de la cuota 11, que es la próxima a cobrar.')
    ).toBeVisible()

    const verTodas = page.getByRole('button', { name: 'Ver las 60 cuotas' })
    await expect(verTodas).toHaveAttribute('aria-expanded', 'false')
    await verTodas.click()
    await expect.poll(async () => (await cuotasVisibles(page)).length).toBe(60)

    const verMenos = page.getByRole('button', { name: 'Ver solo el resumen' })
    await expect(verMenos).toHaveAttribute('aria-expanded', 'true')
    await verMenos.click()
    await expect.poll(() => cuotasVisibles(page)).toEqual([9, 10, 11, 12, 13])
  })

  test('se ven los 5 pagos más recientes, y el que falta confirmar aunque sea el más viejo', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteLargo}`)

    const pagosVisibles = page.locator('[data-testid="pago-lote"]:visible')
    await expect(pagosVisibles).toHaveCount(5)
    await expect(pagosVisibles.filter({ hasText: '777 USD' })).toBeVisible()
    await expect(pagosVisibles.filter({ hasText: '1000 USD' })).toBeVisible()
    await expect(pagosVisibles.filter({ hasText: '1006 USD' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Ver los 8 pagos' }).click()
    await expect(pagosVisibles).toHaveCount(8)
  })

  test('"Datos del lote" queda cerca: desplegar las listas lo aleja más de 2500px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteLargo}`)

    const datosDelLote = page.getByRole('heading', { name: 'Datos del lote' })
    await expect.poll(() => cuotasVisibles(page)).toHaveLength(5)
    const resumido = (await datosDelLote.boundingBox())!.y

    await page.getByRole('button', { name: 'Ver las 60 cuotas' }).click()
    await page.getByRole('button', { name: 'Ver los 8 pagos' }).click()
    await expect.poll(async () => (await cuotasVisibles(page)).length).toBe(60)
    const desplegado = (await datosDelLote.boundingBox())!.y

    expect(desplegado - resumido).toBeGreaterThan(2500)
  })

  test('refinanciado: las pagadas no cuentan las refinanciadas, y el cobrado tampoco', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteRefinanciado}`)

    // Antes: "3 / 5 pagadas" y "Cobrado 3.000 de 4.700", un 64%.
    await expect(page.getByText('1 / 3 pagadas')).toBeVisible()
    await expect(page.getByText('Cobrado 1.300 de 3.000')).toBeVisible()
    await expect(page.getByText('43%')).toBeVisible()

    const resumen = page.getByTestId('resumen-cuotas')
    await expect(resumen).toContainText('1 pagada')
    await expect(resumen).toContainText('0 vencidas')
    await expect(resumen).toContainText('2 por vencer')
    await expect(resumen).toContainText('2 refinanciadas')

    // Con 5 cuotas no hay nada que resumir: se ven todas, sin botón.
    await expect.poll(() => cuotasVisibles(page)).toEqual([1, 2, 3, 4, 5])
    await expect(page.getByRole('button', { name: /^Ver las \d+ cuotas$/ })).toHaveCount(0)
  })
})
