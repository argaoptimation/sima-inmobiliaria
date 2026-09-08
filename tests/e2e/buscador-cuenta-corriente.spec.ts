import { test, expect } from '@playwright/test'
import { ensureTestFixtures, TestFixtures, TEST_USERS } from './fixtures/test-data'
import { login } from './utils/login'

// Los filtros se aplican solos mientras se tipea (FiltroEnVivo, 25/08): el
// botón "Filtrar" dejó de existir, así que los tests solo llenan el campo y
// dejan que la aserción siguiente espere a que la lista se actualice.
test.describe('Buscador en /admin/cuentas-corrientes', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('buscar por nombre filtra la lista de personas', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/cuentas-corrientes')

    await page.getByPlaceholder('Nombre').fill(TEST_USERS.acreedorConDatos.fullName)

    // `exact`: desde el 06/09 cada fila tiene además el ojito para entrar al
    // detalle, cuyo aria-label ("Ver la cuenta de <nombre>") contiene el
    // nombre -- sin exact, getByRole matchea los dos.
    await expect(
      page.getByRole('link', { name: TEST_USERS.acreedorConDatos.fullName, exact: true })
    ).toBeVisible()
  })

  test('buscar un texto que no matchea a nadie muestra el mensaje vacío', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/cuentas-corrientes')

    await page.getByPlaceholder('Nombre').fill('Zzzznadie Existe Zzzz')

    await expect(page.getByText('Nadie coincide con la búsqueda.')).toBeVisible()
  })
})
