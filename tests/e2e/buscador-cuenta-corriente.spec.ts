import { test, expect } from '@playwright/test'
import { ensureTestFixtures, TestFixtures, TEST_USERS } from './fixtures/test-data'
import { login } from './utils/login'

test.describe('Buscador en /admin/cuentas-corrientes', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('buscar por nombre filtra la lista de personas', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/cuentas-corrientes')

    await page.getByPlaceholder('Nombre').fill(TEST_USERS.acreedorConDatos.fullName)
    await page.getByRole('button', { name: 'Filtrar' }).click()

    await expect(page.getByRole('link', { name: TEST_USERS.acreedorConDatos.fullName })).toBeVisible()
  })

  test('buscar un texto que no matchea a nadie muestra el mensaje vacío', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/cuentas-corrientes')

    await page.getByPlaceholder('Nombre').fill('Zzzznadie Existe Zzzz')
    await page.getByRole('button', { name: 'Filtrar' }).click()

    await expect(page.getByText('Nadie coincide con la búsqueda.')).toBeVisible()
  })
})
