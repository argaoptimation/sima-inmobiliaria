import { test, expect } from '@playwright/test'
import { ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

// Los filtros se aplican solos mientras se tipea (FiltroEnVivo, 25/08): el
// botón "Filtrar" dejó de existir, así que los tests solo llenan el campo y
// dejan que la aserción siguiente espere a que la lista se actualice.
test.describe('Buscador en /admin/clientes', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('buscar por nombre filtra la lista', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/clientes')

    await page.getByPlaceholder('Nombre o email').fill('E2E Cliente')

    await expect(page.getByRole('row', { name: new RegExp(fixtures.cliente.email) })).toBeVisible()
  })

  test('buscar un texto que no matchea ningún cliente muestra la lista vacía', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/clientes')

    await page.getByPlaceholder('Nombre o email').fill('Zzzznadie Existe Zzzz')

    await expect(page.getByText('Ningún cliente coincide con la búsqueda.')).toBeVisible()
  })
})
