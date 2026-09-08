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

  // El panel dejó de ser una tabla con el rediseño del 03/09: son 6 KPIs
  // que filtran y una lista agrupada de <div>. Los selectores van por
  // data-testid, no por role=row ni por headings, que ya no existen.
  function kpi(page: import('@playwright/test').Page, tab: string) {
    return page.getByTestId(`kpi-${tab}`)
  }

  // El KPI son dos <span>: la etiqueta y el número. Se lee el último.
  async function contadorKpi(page: import('@playwright/test').Page, tab: string) {
    const texto = await kpi(page, tab).locator('span').last().innerText()
    return Number(texto.trim())
  }

  function filaDelLote(page: import('@playwright/test').Page, grupo: string) {
    return page
      .getByTestId(`grupo-${grupo}`)
      .getByTestId('fila-moroso')
      .filter({ hasText: 'E2E Test Lote' })
  }

  test('el lote con 3 cuotas vencidas aparece en "Posible prejudicial" y se puede marcar desde ahí', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/panel-morosos')

    // La base es compartida y tiene lotes DEMO en varios tramos, así que no
    // se puede asumir un total: se comparan deltas del propio lote.
    const fila = filaDelLote(page, 'posible')
    await expect(fila).toBeVisible()
    await expect(fila).toContainText('3 cuotas')

    const posiblesAntes = await contadorKpi(page, 'posible')
    const oficialesAntes = await contadorKpi(page, 'prejudicial')

    page.once('dialog', (dialog) => dialog.accept())
    await fila.getByRole('button', { name: 'Marcar Prejudicial' }).click()
    await page.waitForURL('**/admin/panel-morosos**')
    await expect(page.getByText('Lote marcado como Prejudicial')).toBeVisible()

    // Se queda en el panel (no navega al detalle del lote) para poder marcar
    // varios candidatos seguidos. El lote pasa de un tramo al otro.
    await expect(filaDelLote(page, 'prejudicial')).toBeVisible()
    await expect(filaDelLote(page, 'posible')).toHaveCount(0)

    await expect.poll(() => contadorKpi(page, 'posible')).toBe(posiblesAntes - 1)
    expect(await contadorKpi(page, 'prejudicial')).toBe(oficialesAntes + 1)

    // Se limpia la marca para no dejar el fixture en un estado distinto al
    // que esperan otros archivos de test (mismo criterio que
    // prejudicial-manual.spec.ts: no se restaura fecha_vencimiento, pero acá
    // sí hace falta desmarcar porque esta marca persiste entre archivos).
    const admin = createAdminClient()
    await admin.from('lotes').update({ marcado_prejudicial: false }).eq('id', fixtures.loteId)
  })

  test('los KPI filtran la lista al tramo elegido', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/panel-morosos')

    await kpi(page, 'posible').click()

    await expect(page.getByTestId('grupo-posible')).toBeVisible()
    await expect(page.getByTestId('grupo-alDia')).toHaveCount(0)
    await expect(filaDelLote(page, 'posible')).toBeVisible()
  })
})
