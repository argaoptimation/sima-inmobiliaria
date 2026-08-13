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

  test('el detalle de un cliente muestra sus lotes con saldo pendiente', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/clientes')

    const fila = page.getByRole('row', { name: new RegExp(fixtures.cliente.email) })
    await fila.getByRole('link', { name: 'Ver detalle' }).click()
    await page.waitForURL(/\/admin\/clientes\/.+$/)

    await expect(page.getByRole('heading', { name: 'E2E Cliente' })).toBeVisible()
    await expect(page.getByRole('row', { name: /E2E Test Lote/ })).toBeVisible()
  })
})
