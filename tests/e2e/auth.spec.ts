import { test, expect } from '@playwright/test'
import { ensureTestFixtures, TEST_USERS, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

// Verifica el login real (form de /login) para los 3 roles de prueba y el
// redirect esperado según el rol del perfil (ver app/page.tsx).
test.describe('Login por rol', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('administrador loguea y termina en /admin', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await expect(page).toHaveURL(/\/admin/)
  })

  test('acreedor loguea y termina en /admin', async ({ page }) => {
    await login(page, fixtures.acreedor.email, fixtures.password)
    await expect(page).toHaveURL(/\/admin/)
  })

  test('cliente loguea y termina en /portal-cliente', async ({ page }) => {
    await login(page, TEST_USERS.cliente.email, fixtures.password)
    await expect(page).toHaveURL(/\/portal-cliente/)
  })
})
