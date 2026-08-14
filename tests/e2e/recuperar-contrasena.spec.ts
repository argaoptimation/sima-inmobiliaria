import { test, expect } from '@playwright/test'
import { ensureTestFixtures, TestFixtures } from './fixtures/test-data'

test.describe('Recuperar contraseña (olvidé mi contraseña)', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('el link "¿Olvidaste tu contraseña?" del login lleva al formulario', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click()
    await expect(page).toHaveURL(/\/login\/recuperar-contrasena$/)
    await expect(page.getByRole('heading', { name: 'Recuperar contraseña' })).toBeVisible()
  })

  test('pedir recuperación con un email que SÍ existe muestra el mensaje de éxito', async ({
    page,
  }) => {
    await page.goto('/login/recuperar-contrasena')
    await page.getByPlaceholder('Email').fill(fixtures.cliente.email)
    await page.getByRole('button', { name: 'Enviar link' }).click()

    await expect(page).toHaveURL(/ok=1/)
    await expect(page.getByText(/te va a llegar un mail/)).toBeVisible()
  })

  test('pedir recuperación con un email que NO existe muestra el mismo mensaje (no filtra cuentas)', async ({
    page,
  }) => {
    await page.goto('/login/recuperar-contrasena')
    await page.getByPlaceholder('Email').fill('no-existe-nunca@sima-e2e.invalid')
    await page.getByRole('button', { name: 'Enviar link' }).click()

    await expect(page).toHaveURL(/ok=1/)
    await expect(page.getByText(/te va a llegar un mail/)).toBeVisible()
  })

  test('sin estar logueado, la pantalla es accesible (no rebota a /login)', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/login/recuperar-contrasena')
    await expect(page).toHaveURL(/\/login\/recuperar-contrasena$/)
  })
})
