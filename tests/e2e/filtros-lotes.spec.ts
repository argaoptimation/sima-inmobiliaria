import { test, expect, type Page } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

// Acreedor y Cliente viven detrás de "Filtros avanzados" desde el rediseño
// Stitch 2026-09 (MOCKUP 1): son cortes ocasionales y tenerlos siempre
// desplegados le comía una fila entera a la tabla. El <details> abre solo
// cuando el filtro ya viene puesto en la URL, así que en un /admin/lotes
// limpio hay que abrirlo. Reintenta porque un <summary> a veces se come el
// primer click si la página todavía está hidratando.
async function abrirFiltrosAvanzados(page: Page) {
  const campoCliente = page.getByPlaceholder('Nombre del cliente')
  await expect(async () => {
    if (!(await campoCliente.isVisible())) {
      await page.locator('summary', { hasText: 'Filtros avanzados' }).click()
    }
    await expect(campoCliente).toBeVisible()
  }).toPass({ timeout: 15_000 })
}

// Los filtros se aplican solos mientras se tipea (FiltroEnVivo, 25/08): el
// botón "Filtrar" dejó de existir, así que los tests solo llenan el campo y
// dejan que la aserción siguiente espere a que la lista se actualice.
test.describe('Filtros de Cliente, Loteo y Cobranza en /admin/lotes', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('filtrar por cliente muestra solo los lotes vendidos a ese cliente', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes')

    await abrirFiltrosAvanzados(page)
    await page.getByPlaceholder('Nombre del cliente').fill('E2E Cliente')

    await expect(page.getByRole('row', { name: /E2E Test Lote/ })).toBeVisible()
    // "DEMO Debe 1 cuota - sin teléfono" (ex "Lote1", renombrado 04/09) es de
    // otro cliente ("Juan Perez Comprador") -- no debería matchear.
    await expect(page.getByRole('row', { name: /^DEMO Debe 1 cuota - sin teléfono/ })).toHaveCount(0)
  })

  test('filtrar por cobranza "Al día" excluye un lote atrasado', async ({ page }) => {
    const admin = createAdminClient()
    await admin.from('cuotas').update({ fecha_vencimiento: '2020-01-01' }).eq('id', fixtures.cuotaIds[0])

    await login(page, fixtures.admin.email, fixtures.password)
    // Con el listado paginado (10/09) el buscador va SIEMPRE, incluso para
    // los toHaveCount(0): sin él, "no está" y "está en la página 3" se ven
    // exactamente igual y el test pasaría sin probar nada.
    await page.goto('/admin/lotes?cobranza=al_dia&q=E2E+Test+Lote')

    await expect(page.getByRole('row', { name: /E2E Test Lote/ })).toHaveCount(0)

    await page.goto('/admin/lotes?cobranza=atrasado&q=E2E+Test+Lote')
    await expect(page.getByRole('row', { name: /E2E Test Lote/ })).toBeVisible()
  })

  test('un lote sin coincidencias muestra el mensaje de "ningún lote"', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes')

    await abrirFiltrosAvanzados(page)
    await page.getByPlaceholder('Nombre del cliente').fill('Zzzznadie Existe Zzzz')

    await expect(page.getByText('Ningún lote coincide con los filtros.')).toBeVisible()
  })
})
