import { test, expect } from '@playwright/test'
import { ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

// Los filtros se aplican solos mientras se tipea (FiltroEnVivo, 25/08): el
// botón "Filtrar" dejó de existir, así que los tests solo llenan el campo y
// dejan que la aserción siguiente espere a que la lista se actualice.
test.describe('Buscador en /admin/usuarios', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('buscar por nombre filtra la tabla de staff', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/usuarios')

    await page.getByPlaceholder('Nombre o email').fill(fixtures.acreedorConDatos.email)

    await expect(page.getByRole('row', { name: new RegExp(fixtures.acreedorConDatos.email) })).toBeVisible()
  })

  test('buscar un texto que no matchea a nadie muestra la lista vacía', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/usuarios')

    await page.getByPlaceholder('Nombre o email').fill('Zzzznadie Existe Zzzz')

    await expect(page.getByText('Ningún usuario coincide con la búsqueda.')).toBeVisible()
  })
})
