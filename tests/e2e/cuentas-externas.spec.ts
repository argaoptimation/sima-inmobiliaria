import { test, expect } from '@playwright/test'
import { ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

test.describe('Cuentas externas', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('crear una cuenta externa con deuda inicial y verla en el listado con el saldo correcto', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/cuentas-externas/nuevo')

    const nombre = `E2E Corralón ${Date.now()}`
    await page.getByLabel('Nombre del destinatario').fill(nombre)
    await page.getByLabel('Titular de la cuenta').fill('Materiales del Centro SRL')
    await page.getByLabel('Alias').fill('materiales.centro')
    await page.getByLabel('Banco').fill('Banco Test')
    await page.getByLabel('Monto').fill('2000')
    await page.getByLabel('Concepto').fill('Materiales de construcción')
    await page.getByRole('button', { name: 'Crear cuenta externa' }).click()

    await page.waitForURL(/\/admin\/cuentas-externas\/.+$/)

    await page.goto('/admin/cuentas-externas')
    const fila = page.getByRole('row', { name: new RegExp(nombre) })
    await expect(fila).toContainText('2000 USD')
  })

  test('crear una cuenta externa sin banco es rechazado', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/cuentas-externas/nuevo')

    await page.getByLabel('Nombre del destinatario').fill(`E2E Sin Banco ${Date.now()}`)
    await page.getByLabel('Titular de la cuenta').fill('Alguien')
    await page.getByLabel('Alias').fill('alguien.alias')
    // Banco NO se completa a propósito.
    await page.getByRole('button', { name: 'Crear cuenta externa' }).click()

    await expect(page.getByText('Titular, alias y banco son obligatorios')).toBeVisible()
  })

  test('un acreedor no puede acceder a /admin/cuentas-externas navegando directo por URL', async ({
    page,
  }) => {
    await login(page, fixtures.acreedor.email, fixtures.password)
    await page.goto('/admin/cuentas-externas')
    await expect(page).toHaveURL(/\/admin\/lotes$/)
  })
})
