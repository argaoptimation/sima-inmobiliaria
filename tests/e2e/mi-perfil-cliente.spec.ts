import { test, expect } from '@playwright/test'
import { ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

test.describe('Mi perfil (portal cliente)', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('el cliente puede entrar a Mi perfil desde el portal, cambiar su nombre y ver el link para cambiar contraseña', async ({
    page,
  }) => {
    await login(page, fixtures.cliente.email, fixtures.password)
    await page.goto('/portal-cliente')

    await page.getByRole('link', { name: 'Mi perfil' }).click()
    await expect(page).toHaveURL(/\/portal-cliente\/mi-perfil$/)
    await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible()

    const nombreNuevo = `Cliente E2E ${Date.now()}`
    await page.getByRole('textbox').first().fill(nombreNuevo)
    await page.getByRole('button', { name: 'Guardar' }).click()

    await expect(page.getByText('Guardado.')).toBeVisible()
    await expect(page.getByRole('textbox').first()).toHaveValue(nombreNuevo)

    await expect(page.getByRole('link', { name: 'Cambiar contraseña' })).toHaveAttribute(
      'href',
      '/set-password'
    )

    await page.getByRole('link', { name: '← Volver a tus lotes' }).click()
    await expect(page).toHaveURL(/\/portal-cliente$/)
  })

  test('un usuario de staff no puede entrar a /portal-cliente/mi-perfil (lo rebota a /mi-perfil)', async ({
    page,
  }) => {
    await login(page, fixtures.acreedor.email, fixtures.password)
    await page.goto('/portal-cliente/mi-perfil')
    await expect(page).toHaveURL(/\/mi-perfil$/)
  })
})
