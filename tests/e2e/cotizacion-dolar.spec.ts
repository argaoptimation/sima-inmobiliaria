import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

test.describe('Cotización del dólar', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test.afterEach(async () => {
    // La cotización de hoy es un registro global compartido por todo el
    // suite (una fila por fecha) -- se borra al final de cada test para no
    // dejar "ya cargada" pisando la corrida de otro spec el mismo día.
    const admin = createAdminClient()
    const hoy = new Date().toISOString().slice(0, 10)
    await admin.from('cotizaciones_dolar').delete().eq('fecha', hoy)
  })

  test('cargar la cotización de hoy muestra la leyenda de "ya cargada"', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes')

    await expect(page.getByText(/Todavía no cargaste la cotización/)).toBeVisible()

    await page.getByPlaceholder('Ej: 1500').fill('1500.50')
    await page.getByRole('button', { name: 'Cargar' }).click()
    await page.waitForURL('**/admin/lotes')

    await expect(page.getByText(/Cotización de hoy .* ya cargada: 1500\.5/)).toBeVisible()
  })

  test('cargarla dos veces el mismo día corrige el valor anterior (upsert, no error) y no duplica la fila', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes')

    await page.getByPlaceholder('Ej: 1500').fill('1500')
    await page.getByRole('button', { name: 'Cargar' }).click()
    await page.waitForURL('**/admin/lotes')
    await expect(page.getByText(/ya cargada: 1500\b/)).toBeVisible()

    // Segunda carga del mismo día: el botón ahora dice "Corregir" y el
    // input viene precargado con el valor ya guardado.
    await expect(page.getByPlaceholder('Ej: 1500')).toHaveValue('1500')
    await page.getByPlaceholder('Ej: 1500').fill('1600')
    await page.getByRole('button', { name: 'Corregir' }).click()
    await page.waitForURL('**/admin/lotes')
    await expect(page.getByText(/ya cargada: 1600\b/)).toBeVisible()

    const admin = createAdminClient()
    const hoy = new Date().toISOString().slice(0, 10)
    const { data: cotizaciones } = await admin.from('cotizaciones_dolar').select('id, valor').eq('fecha', hoy)
    expect(cotizaciones).toHaveLength(1)
    expect(cotizaciones![0].valor).toBe(1600)
  })

  test('en la pantalla de pago de una cuota en USD se muestra el equivalente en pesos', async ({ page }) => {
    const admin = createAdminClient()

    const hoy = new Date().toISOString().slice(0, 10)
    await admin.from('cotizaciones_dolar').upsert(
      { fecha: hoy, valor: 1000, cargado_por: fixtures.admin.id },
      { onConflict: 'fecha' }
    )

    const { data: lote, error: errorLote } = await admin
      .from('lotes')
      .insert({
        identificador: `E2E Pagar Dolar ${Date.now()}`,
        moneda: 'USD',
        estado: 'vendido',
        precio_total: 1000,
        acreedor_id: fixtures.acreedorConDatos.id,
        cliente_id: fixtures.cliente.id,
      })
      .select('id')
      .single()

    if (errorLote || !lote) {
      throw new Error(`No se pudo crear el lote de prueba: ${errorLote?.message}`)
    }

    const { data: cuota, error: errorCuota } = await admin
      .from('cuotas')
      .insert({
        lote_id: lote.id,
        numero: 1,
        monto_base: 100,
        saldo_pendiente: 100,
        fecha_vencimiento: '2027-01-01',
      })
      .select('id')
      .single()

    if (errorCuota || !cuota) {
      throw new Error(`No se pudo crear la cuota de prueba: ${errorCuota?.message}`)
    }

    await login(page, fixtures.cliente.email, fixtures.password)
    await page.goto(`/portal-cliente/pagar/${cuota.id}`)

    await expect(page.getByText(/Equivalente en pesos: 100000 ARS/)).toBeVisible()

    await admin.from('cuotas').delete().eq('id', cuota.id)
    await admin.from('lotes').delete().eq('id', lote.id)
  })
})
