import { test, expect, type Page } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'
import { hoyArgentina } from '../../lib/fecha/hoy-argentina'
import { sumarDias } from '../../lib/fecha/sumar-dias'

// La matriz de distribución de a 15 cuotas (15/09, mockup 6).
//
// Lo que más importa acá no es que se vean 15: es que guardar desde la
// página 1 NO borre el reparto de una cuota de la página 2. El guardado es
// un reemplazo completo del lote, así que una cuota que no viajara en el
// formulario perdería lo que tenía.
test.describe('Distribución de cuotas paginada', () => {
  let fixtures: TestFixtures
  let loteId: string
  const cuotaIdPorNumero = new Map<number, string>()

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
    const admin = createAdminClient()
    const hoy = hoyArgentina()

    const { data: lote, error } = await admin
      .from('lotes')
      .insert({
        identificador: `E2E Distribucion paginada ${Date.now()}`,
        moneda: 'USD',
        estado: 'vendido',
        cliente_id: fixtures.cliente.id,
        acreedor_id: fixtures.acreedorConDatos.id,
      })
      .select('id')
      .single()
    if (error || !lote) throw new Error(`No se pudo crear el lote: ${error?.message}`)
    loteId = lote.id

    const { data: cuotas, error: errorCuotas } = await admin
      .from('cuotas')
      .insert(
        Array.from({ length: 20 }, (_, i) => ({
          lote_id: loteId,
          numero: i + 1,
          monto_base: 1000,
          saldo_pendiente: 1000,
          fecha_vencimiento: sumarDias(hoy, (i + 1) * 30),
        }))
      )
      .select('id, numero')
    if (errorCuotas || !cuotas) throw new Error(`No se pudieron crear las cuotas: ${errorCuotas?.message}`)
    for (const cuota of cuotas) cuotaIdPorNumero.set(cuota.numero, cuota.id)

    // La 1 repartida a medias; la 20 (página 2) entera y con destino.
    const { error: errorRepartos } = await admin.from('cuota_distribuciones').insert([
      { cuota_id: cuotaIdPorNumero.get(1), profile_id: fixtures.acreedorConDatos.id, monto: 400 },
      { cuota_id: cuotaIdPorNumero.get(20), profile_id: fixtures.acreedorConDatos.id, monto: 1000 },
    ])
    if (errorRepartos) throw new Error(`No se pudieron crear los repartos: ${errorRepartos.message}`)
    await admin
      .from('cuotas')
      .update({ cuenta_cobro_id: fixtures.acreedorConDatos.id })
      .eq('id', cuotaIdPorNumero.get(20)!)
  })

  test.afterAll(async () => {
    const admin = createAdminClient()
    if (!loteId) return
    await admin.from('cuota_distribuciones').delete().in('cuota_id', [...cuotaIdPorNumero.values()])
    await admin.from('lotes').delete().eq('id', loteId)
  })

  const cuotasVisibles = (page: Page) =>
    page
      .locator('tr[data-cuota]:visible')
      .evaluateAll((filas) => filas.map((fila) => Number((fila as HTMLElement).dataset.cuota)))

  test('se ven de a 15, se pasa de página y se pueden ver todas', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/distribucion`)

    await expect.poll(() => cuotasVisibles(page)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1))
    await expect(page.getByText('Mostrando cuotas 1–15 de 20')).toBeVisible()

    // El control de suma de cada cuota: la 1 tiene 400 de 1000.
    const cuota1 = page.locator('tr[data-cuota="1"]')
    await expect(cuota1).toContainText('Faltan 600 USD (60%)')
    await expect(cuota1).toContainText('Asignado: 400 / 1000 USD')
    await expect(page.locator('tr[data-cuota="2"]')).toContainText('Sin repartir')

    await page.getByRole('navigation', { name: 'Páginas de cuotas' }).getByRole('button', { name: '2', exact: true }).click()
    await expect.poll(() => cuotasVisibles(page)).toEqual([16, 17, 18, 19, 20])
    await expect(page.locator('tr[data-cuota="20"]')).toContainText('Repartida completa')

    await page.getByRole('button', { name: 'Ver todas las 20 cuotas' }).click()
    await expect.poll(async () => (await cuotasVisibles(page)).length).toBe(20)
  })

  test('guardar desde la página 1 no le borra el reparto a una cuota de la página 2', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/distribucion`)
    await expect.poll(() => cuotasVisibles(page)).toHaveLength(15)
    await expect(page.locator('tr[data-cuota="20"]')).toBeHidden()

    await page.getByRole('button', { name: 'Guardar distribución' }).first().click()
    await page.waitForURL(/ok=1/)

    const admin = createAdminClient()
    const { data: repartos } = await admin
      .from('cuota_distribuciones')
      .select('profile_id, monto')
      .eq('cuota_id', cuotaIdPorNumero.get(20)!)
    expect(repartos).toEqual([{ profile_id: fixtures.acreedorConDatos.id, monto: 1000 }])

    const { data: cuota20 } = await admin
      .from('cuotas')
      .select('cuenta_cobro_id')
      .eq('id', cuotaIdPorNumero.get(20)!)
      .single()
    expect(cuota20?.cuenta_cobro_id).toBe(fixtures.acreedorConDatos.id)
  })
})
