import { test, expect } from '@playwright/test'
import { ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

test.describe('Buscador en /admin/clientes', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('buscar por nombre filtra la lista', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/clientes')

    await page.getByPlaceholder('Nombre o email').fill('E2E Cliente')
    await page.getByRole('button', { name: 'Filtrar' }).click()

    await expect(page.getByRole('row', { name: new RegExp(fixtures.cliente.email) })).toBeVisible()
  })

  test('buscar un texto que no matchea ningún cliente muestra la lista vacía', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/clientes')

    await page.getByPlaceholder('Nombre o email').fill('Zzzznadie Existe Zzzz')
    await page.getByRole('button', { name: 'Filtrar' }).click()

    await expect(page.getByText('Ningún cliente coincide con la búsqueda.')).toBeVisible()
  })
})
