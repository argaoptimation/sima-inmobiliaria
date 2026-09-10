import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login, logout } from './utils/login'
import { hoyArgentina } from '../../lib/fecha/hoy-argentina'
import { sumarDias } from '../../lib/fecha/sumar-dias'
// El listado de lotes se pagina de a 30 desde el 10/09, asi que estos tests
// buscan el lote por el buscador en vez de esperar que aparezca solo. No es
// una concesion al test: con 322 lotes en la cartera de Nicolas, buscarlo es
// tambien lo que hace una persona. Y ademas arregla algo que ya estaba mal
// antes -- un `toHaveCount(0)` sobre una lista sin filtrar pasaba igual si
// la fila estaba, pero mas abajo.


// Prejudicial pasa a ser un paso MANUAL del admin (Nicolás: "es un caso
// importante"; reforzado 26/08 -- lo que calcula el sistema por cantidad de
// cuotas vencidas es apenas una señal de "posible prejudicial", nunca la
// marca real). Usa el lote fixture de 3 cuotas y las manda a las 3 vencidas
// (sin restaurar fecha_vencimiento al final -- mismo criterio que
// filtros-lotes.spec.ts, cada archivo arranca de un fixture fresco en su
// propio beforeAll).
test.describe('Prejudicial manual (26/08)', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()

    const admin = createAdminClient()
    const vencida = sumarDias(hoyArgentina(), -10)
    for (const cuotaId of fixtures.cuotaIds) {
      await admin.from('cuotas').update({ fecha_vencimiento: vencida }).eq('id', cuotaId)
    }
  })

  test('3+ cuotas vencidas se muestra como "Posible prejudicial", no "Prejudicial", hasta que el admin lo marca', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes?q=E2E+Test+Lote')

    const fila = page.getByRole('row', { name: /E2E Test Lote/ })
    await expect(fila).toContainText('Posible prejudicial')
    await expect(fila).not.toContainText(/(?<!Posible )Prejudicial/)

    // El filtro "Posible prejudicial" lo encuentra, "Prejudicial" (oficial) no.
    await page.goto('/admin/lotes?cobranza=posible_prejudicial&q=E2E+Test+Lote')
    await expect(page.getByRole('row', { name: /E2E Test Lote/ })).toBeVisible()

    await page.goto('/admin/lotes?cobranza=prejudicial&q=E2E+Test+Lote')
    await expect(page.getByRole('row', { name: /E2E Test Lote/ })).toHaveCount(0)

    // En el detalle del lote también dice "Posible prejudicial".
    await page.goto(`/admin/lotes/${fixtures.loteId}`)
    await expect(page.getByText('Posible prejudicial')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Marcar Prejudicial' })).toBeVisible()
  })

  test('el admin marca el lote como Prejudicial: badge, filtro e historial cambian; desmarcar revierte', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}`)

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Marcar Prejudicial' }).click()
    await page.waitForURL(`**/admin/lotes/${fixtures.loteId}**`)

    await expect(page.getByText('Lote marcado como Prejudicial')).toBeVisible()
    await expect(page.getByTestId('estado-cobranza')).toHaveText('Prejudicial')
    await expect(page.getByRole('button', { name: 'Sacar de Prejudicial' })).toBeVisible()

    await page.getByText(/Historial de estados del lote/).click()
    await expect(page.getByText('Pasó a Prejudicial')).toBeVisible()

    await page.goto('/admin/lotes?cobranza=prejudicial&q=E2E+Test+Lote')
    await expect(page.getByRole('row', { name: /E2E Test Lote/ })).toBeVisible()
    await page.goto('/admin/lotes?cobranza=posible_prejudicial&q=E2E+Test+Lote')
    await expect(page.getByRole('row', { name: /E2E Test Lote/ })).toHaveCount(0)

    // Desmarcar vuelve a "Posible prejudicial" (las cuotas siguen vencidas).
    await page.goto(`/admin/lotes/${fixtures.loteId}`)
    await page.getByRole('button', { name: 'Sacar de Prejudicial' }).click()
    await page.waitForURL(`**/admin/lotes/${fixtures.loteId}**`)

    await expect(page.getByText('Lote sacado de Prejudicial')).toBeVisible()
    await expect(page.getByTestId('estado-cobranza')).toHaveText('Posible prejudicial')

    await page.getByText(/Historial de estados del lote/).click()
    await expect(page.getByText('Salió de Prejudicial')).toBeVisible()
  })

  test('un acreedor no ve los botones de marcar/desmarcar Prejudicial', async ({ page }) => {
    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}`)

    await expect(page.getByRole('button', { name: 'Marcar Prejudicial' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Sacar de Prejudicial' })).toHaveCount(0)
    await logout(page)
  })
})
