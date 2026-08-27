import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'
import { hoyArgentina } from '../../lib/fecha/hoy-argentina'
import { sumarDias } from '../../lib/fecha/sumar-dias'

// Panel de Morosos (26/08, pedido de Nicolás vía Gabriel): agrupa a todos los
// clientes vendidos con cuotas vencidas en tramos de 1 / 2 / 3+ (posible
// prejudicial) / prejudicial oficial, con el botón de marcar disponible
// directamente en el tramo de 3+ para no tener que entrar al lote.
test.describe('Panel de Morosos (26/08)', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()

    const admin = createAdminClient()
    const vencida = sumarDias(hoyArgentina(), -10)
    for (const cuotaId of fixtures.cuotaIds) {
      await admin.from('cuotas').update({ fecha_vencimiento: vencida }).eq('id', cuotaId)
    }
  })

  test('el lote con 3 cuotas vencidas aparece en "Posible prejudicial" y se puede marcar desde ahí', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/panel-morosos')

    const seccionPosiblePrejudicial = page.getByRole('heading', { name: /Posible prejudicial/ })
    await expect(seccionPosiblePrejudicial).toContainText('(1)')

    const fila = page.getByRole('row', { name: /E2E Test Lote/ })
    await expect(fila).toBeVisible()
    await expect(fila).toContainText('3')

    page.once('dialog', (dialog) => dialog.accept())
    await fila.getByRole('button', { name: 'Marcar Prejudicial' }).click()
    await page.waitForURL('**/admin/panel-morosos**')
    await expect(page.getByText('Lote marcado como Prejudicial')).toBeVisible()

    // Se queda en el panel (no navega al detalle del lote) para poder marcar
    // varios candidatos seguidos.
    // Ya marcado: sale de "Posible prejudicial" y entra a "Prejudicial (ya marcado)".
    await expect(page.getByRole('heading', { name: /Posible prejudicial/ })).toContainText('(0)')
    const seccionPrejudicialOficial = page.getByRole('heading', { name: /Prejudicial \(ya marcado\)/ })
    await expect(seccionPrejudicialOficial).toContainText('(1)')
    await expect(page.getByRole('row', { name: /E2E Test Lote/ })).toBeVisible()

    // Se limpia la marca para no dejar el fixture en un estado distinto al
    // que esperan otros archivos de test (mismo criterio que
    // prejudicial-manual.spec.ts: no se restaura fecha_vencimiento, pero acá
    // sí hace falta desmarcar porque esta marca persiste entre archivos).
    const admin = createAdminClient()
    await admin.from('lotes').update({ marcado_prejudicial: false }).eq('id', fixtures.loteId)
  })
})
