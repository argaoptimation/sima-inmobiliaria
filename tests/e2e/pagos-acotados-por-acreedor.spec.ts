import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login, logout } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)
const NOMBRE_COMPROBANTE = `e2e-pagos-acotados-${Date.now()}.pdf`

// "E2E Test Lote" tiene acreedor_id = acreedorConDatos (ver test-data.ts).
// fixtures.acreedorSecundario es dueño de un lote distinto -- no tiene
// ninguna relación con "E2E Test Lote", así que no debería poder ver ni
// confirmar los pagos de ese cliente.
test.describe('Confirmación de pagos acotada al acreedor del lote', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('un acreedor sin relación con el lote no ve el pago del cliente en /admin/pagos', async ({
    page,
  }) => {
    await test.step('el cliente registra un pago y sube comprobante', async () => {
      await login(page, fixtures.cliente.email, fixtures.password)

      const filaCuota1 = page.locator('main table').nth(0).locator('tbody tr').nth(0)
      await filaCuota1.getByRole('link', { name: 'Pagar cuota' }).click()
      await page.waitForURL(/\/portal-cliente\/pagar\//)

      await page.getByPlaceholder('Monto transferido').fill('1')
      await page.selectOption('select[name="moneda"]', 'USD')
      await page.getByRole('button', { name: 'Ya transferí' }).click()
      await page.waitForURL(/\/portal-cliente\/pagos\/.+\/comprobante$/)

      await page.setInputFiles('input[name="comprobante"]', {
        name: NOMBRE_COMPROBANTE,
        mimeType: 'application/pdf',
        buffer: COMPROBANTE_BYTES,
      })
      await page.getByRole('button', { name: 'Finalizar' }).click()
      await page.waitForURL(/\/portal-cliente$/)
    })

    await test.step('acreedorConDatos (dueño real del lote) SÍ ve el pago', async () => {
      await logout(page)
      await login(page, fixtures.acreedorConDatos.email, fixtures.password)
      await page.goto('/admin/pagos')

      await expect(page.locator(`a[href*="${NOMBRE_COMPROBANTE}"]`)).toBeVisible()
    })

    await test.step('acreedorSecundario (sin relación con el lote) NO ve el pago', async () => {
      await logout(page)
      await login(page, fixtures.acreedorSecundario.email, fixtures.password)
      await page.goto('/admin/pagos')

      await expect(page.locator(`a[href*="${NOMBRE_COMPROBANTE}"]`)).toHaveCount(0)
    })
  })
})
