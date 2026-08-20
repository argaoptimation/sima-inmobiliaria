import { test, expect } from '@playwright/test'
import { ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

test.describe('Visibilidad acotada acreedor-vendedor', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('el acreedor ve solo al vendedor de sus propios lotes, no al de otro acreedor', async ({
    page,
  }) => {
    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto('/admin/usuarios')

    // `exact: true` porque la celda de datos de transferencia también
    // contiene el nombre como parte del titular (p.ej. "E2E Vendedor A SA
    // · vendedor.a · Banco A"), lo que generaría un strict-mode violation
    // con un match por substring.
    await expect(page.getByText('E2E Vendedor A', { exact: true })).toBeVisible()
    await expect(page.getByText('vendedor.a')).toBeVisible()

    await expect(page.getByText('E2E Vendedor B', { exact: true })).not.toBeVisible()
    await expect(page.getByText('vendedor.a')).toBeVisible()
    await expect(page.getByText('vendedor.b')).not.toBeVisible()

    // La vista acotada no tiene links de "Editar" (es de solo lectura).
    await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0)
  })

  test('el administrador sigue viendo a todo el staff, incluidos ambos vendedores', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/usuarios')

    await expect(page.getByText('E2E Vendedor A', { exact: true })).toBeVisible()
    await expect(page.getByText('E2E Vendedor B', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Editar' }).first()).toBeVisible()
  })

  test('el acreedor no puede vender un lote ajeno navegando directo por URL', async ({ page }) => {
    await login(page, fixtures.acreedorConDatos.email, fixtures.password)

    await page.goto(`/admin/lotes/${fixtures.loteSecundarioId}/vender`)
    await page.waitForURL('**/admin/lotes')
    await expect(page).toHaveURL(/\/admin\/lotes$/)
  })

  test('el acreedor no puede invitar nuevas cuentas de staff (exclusivo del administrador)', async ({
    page,
  }) => {
    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto('/admin/usuarios')

    await expect(page.getByRole('button', { name: 'Invitar' })).toHaveCount(0)
  })
})
