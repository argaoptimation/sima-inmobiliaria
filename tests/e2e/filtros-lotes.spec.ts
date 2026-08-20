import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

test.describe('Filtros de Cliente, Loteo y Cobranza en /admin/lotes', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('filtrar por cliente muestra solo los lotes vendidos a ese cliente', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes')

    await page.getByPlaceholder('Nombre del cliente').fill('E2E Cliente')
    await page.getByRole('button', { name: 'Filtrar' }).click()

    await expect(page.getByRole('row', { name: /E2E Test Lote/ })).toBeVisible()
    // "Lote1" es de otro cliente ("Juan Perez Comprador") -- no debería matchear.
    await expect(page.getByRole('row', { name: /^Lote1/ })).toHaveCount(0)
  })

  test('filtrar por cobranza "Al día" excluye un lote moroso', async ({ page }) => {
    const admin = createAdminClient()
    await admin.from('cuotas').update({ fecha_vencimiento: '2020-01-01' }).eq('id', fixtures.cuotaIds[0])

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes?cobranza=al_dia')

    await expect(page.getByRole('row', { name: /E2E Test Lote/ })).toHaveCount(0)

    await page.goto('/admin/lotes?cobranza=moroso')
    await expect(page.getByRole('row', { name: /E2E Test Lote/ })).toBeVisible()
  })

  test('un lote sin coincidencias muestra el mensaje de "ningún lote"', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes')

    await page.getByPlaceholder('Nombre del cliente').fill('Zzzznadie Existe Zzzz')
    await page.getByRole('button', { name: 'Filtrar' }).click()

    await expect(page.getByText('Ningún lote coincide con los filtros.')).toBeVisible()
  })
})
