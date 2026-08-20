import { test, expect } from '@playwright/test'
import { ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

test.describe('Buscador en /admin/usuarios', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('buscar por nombre filtra la tabla de staff', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/usuarios')

    await page.getByPlaceholder('Nombre o email').fill(fixtures.acreedorConDatos.email)
    await page.getByRole('button', { name: 'Filtrar' }).click()

    await expect(page.getByRole('row', { name: new RegExp(fixtures.acreedorConDatos.email) })).toBeVisible()
  })

  test('buscar un texto que no matchea a nadie muestra la lista vacía', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/usuarios')

    await page.getByPlaceholder('Nombre o email').fill('Zzzznadie Existe Zzzz')
    await page.getByRole('button', { name: 'Filtrar' }).click()

    await expect(page.getByText('Ningún usuario coincide con la búsqueda.')).toBeVisible()
  })
})
