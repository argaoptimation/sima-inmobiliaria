import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

test.describe('Vista de clientes desde Admin', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('el administrador ve el listado de clientes con su cantidad de lotes', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/clientes')

    const fila = page.getByRole('row', { name: new RegExp(fixtures.cliente.email) })
    await expect(fila).toBeVisible()
    // fixtures.cliente es dueño de "E2E Test Lote" -- al menos 1 lote.
    await expect(fila.locator('td').nth(2)).not.toHaveText('0')
  })

  test('un acreedor no puede abrir /admin/clientes navegando directo por URL', async ({ page }) => {
    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto('/admin/clientes')

    await expect(page).toHaveURL(/\/admin\/lotes/)
  })
})
