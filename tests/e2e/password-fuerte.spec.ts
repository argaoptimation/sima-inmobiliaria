import { test, expect } from '@playwright/test'
import { ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

test.describe('Contraseña fuerte obligatoria', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('resetear la contraseña de un cliente con una débil (sin signo) es rechazado', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/clientes/${fixtures.cliente.id}`)

    // Pasa el minLength del navegador (8) pero no tiene ningún signo, asi
    // que el chequeo del servidor tiene que rechazarla igual.
    await page.getByPlaceholder('Nueva contraseña').fill('abcdefgh')
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()

    await expect(page.getByText(/al menos 8 caracteres.*signo/)).toBeVisible()
  })
})
