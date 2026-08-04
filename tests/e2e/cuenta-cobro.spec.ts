import { test, expect } from '@playwright/test'
import { ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login, logout } from './utils/login'

// Igual que en pago-flujo-completo.spec.ts: la base es compartida con datos
// reales creados a mano por fuera de estos tests, así que ubicamos "el" lote
// de prueba por su identificador único en vez de asumir que es el primero
// de la lista.
function filaDelLoteDePrueba(page: import('@playwright/test').Page) {
  return page.getByRole('row', { name: /E2E Test Lote/ })
}

test.describe('Cuenta de cobro por lote', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('admin asigna una cuenta de cobro y el cliente ve esos datos al pagar', async ({ page }) => {
    await test.step('login como admin y entra al detalle del lote de prueba', async () => {
      await login(page, fixtures.admin.email, fixtures.password)
      await page.goto('/admin/lotes')
      await filaDelLoteDePrueba(page).getByRole('link', { name: 'Ver detalle' }).click()
      await page.waitForURL(/\/admin\/lotes\/.+$/)
    })

    await test.step('asigna al acreedor con datos como cuenta de cobro', async () => {
      // Playwright's selectOption `label` requiere un string exacto (no
      // acepta RegExp): el option de acreedorId muestra el full_name a
      // secas, mientras que el de cuentaCobroId le agrega " (role)".
      await page.selectOption('select[name="acreedorId"]', { label: 'E2E Acreedor Con Datos' })
      await page.selectOption('select[name="cuentaCobroId"]', {
        label: 'E2E Acreedor Con Datos (acreedor)',
      })
      await page.getByRole('button', { name: 'Guardar cobro' }).click()
      // El submit redirige al admin de vuelta a esta misma URL (misma ruta,
      // no cambia), así que `waitForURL` con este regex resolvería de
      // inmediato sin esperar nada (ya matchea la URL actual antes del
      // click). Esperamos a que la Server Action realmente complete su
      // round-trip antes de leer el estado del <select>.
      await page.waitForLoadState('networkidle')
      await page.waitForURL(/\/admin\/lotes\/.+$/)
      await expect(page.locator('select[name="cuentaCobroId"]')).toHaveValue(
        fixtures.acreedorConDatos.id
      )
    })

    await test.step('el cliente ve los datos de transferencia del acreedor asignado al pagar', async () => {
      await logout(page)
      await login(page, fixtures.cliente.email, fixtures.password)
      await page.goto('/portal-cliente')

      const filaCuota1 = page.locator('main table').nth(0).locator('tbody tr').nth(0)
      await filaCuota1.getByRole('link', { name: 'Pagar cuota' }).click()
      await page.waitForURL(/\/portal-cliente\/pagar\//)

      await expect(page.getByText('acreedor.cobro')).toBeVisible()
      await expect(page.getByText('E2E Acreedor Con Datos SA')).toBeVisible()
    })
  })

  test('una persona sin datos de transferencia no aparece como opción de cuenta de cobro', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes')
    await filaDelLoteDePrueba(page).getByRole('link', { name: 'Ver detalle' }).click()
    await page.waitForURL(/\/admin\/lotes\/.+$/)

    const opcionesCuentaCobro = await page
      .locator('select[name="cuentaCobroId"] option')
      .allTextContents()

    // El acreedor de prueba "de a secas" (sin datos de transferencia
    // cargados) nunca puede figurar como opción de cuenta de cobro, aunque
    // sí pueda elegirse como acreedor del lote.
    expect(opcionesCuentaCobro.some((texto) => texto.trim() === 'E2E Acreedor (acreedor)')).toBe(
      false
    )
  })
})
