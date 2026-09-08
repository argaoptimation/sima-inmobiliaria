import { test, expect } from '@playwright/test'
import { createAdminClient, ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

// La campana de la topbar (08/09, pedido de Gabriel: "poder mantener
// informado a Nicolás"). El aviso que da nombre a la pantalla es el que él
// puso de ejemplo: "Lote1 no tiene cargado quién cobra la cuota del próximo
// mes".
//
// El lote de estos tests es propio y no el de fixtures: la campana mira
// TODOS los lotes vendidos, así que tocarle el acreedor al lote compartido
// le cambiaría los avisos al resto del suite.
test.describe('Centro de notificaciones', () => {
  let fixtures: TestFixtures
  let loteId: string
  const identificador = `E2E Notif ${Date.now()}`

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
    const admin = createAdminClient()

    const { data: lote, error } = await admin
      .from('lotes')
      .insert({
        identificador,
        moneda: 'USD',
        estado: 'vendido',
        cliente_id: fixtures.cliente.id,
        // E2E Acreedor (a secas) no tiene alias/banco/titular cargados: sin
        // destino propio en la cuota, el cobro cae en él y el cliente se
        // queda sin nada a dónde transferir.
        acreedor_id: fixtures.acreedor.id,
        cantidad_cuotas: 1,
        monto_cuota_base: 1000,
        fecha_primera_cuota: '2020-01-10',
      })
      .select('id')
      .single()

    if (error || !lote) throw new Error(`No se pudo crear el lote de prueba: ${error?.message}`)

    loteId = lote.id

    // Vencimiento viejo a propósito: los avisos se ordenan por el
    // vencimiento más cercano, así que esto garantiza que el lote entre
    // dentro de los primeros aunque la base tenga otros casos abiertos.
    const { error: errorCuota } = await admin.from('cuotas').insert({
      lote_id: loteId,
      numero: 1,
      ciclo: 1,
      monto_base: 1000,
      saldo_pendiente: 1000,
      fecha_vencimiento: '2020-01-10',
    })

    if (errorCuota) throw new Error(`No se pudieron crear las cuotas: ${errorCuota.message}`)
  })

  test.afterAll(async () => {
    await createAdminClient().from('lotes').delete().eq('id', loteId)
  })

  test('avisa que una cuota que vence no tiene a dónde pagarse, y lleva a arreglarlo', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes')

    await expect(page.getByTestId('badge-notificaciones')).toBeVisible()

    await page.getByTestId('campana-notificaciones').click()
    const panel = page.getByTestId('panel-notificaciones')
    await expect(panel).toBeVisible()

    const aviso = panel.getByRole('link', { name: new RegExp(identificador) })
    await expect(aviso).toBeVisible()
    await expect(aviso).toContainText('no hay a dónde pagar la cuota 1')

    await aviso.click()
    await page.waitForURL(new RegExp(`/admin/lotes/${loteId}/distribucion`))
  })

  test('el aviso se va cuando la cuota ya tiene quién la cobre con datos cargados', async ({
    page,
  }) => {
    const admin = createAdminClient()

    // El acreedor con datos SÍ tiene alias, banco y titular.
    await admin
      .from('cuotas')
      .update({ cuenta_cobro_id: fixtures.acreedorConDatos.id })
      .eq('lote_id', loteId)

    try {
      await login(page, fixtures.admin.email, fixtures.password)
      await page.goto('/admin/lotes')
      await page.getByTestId('campana-notificaciones').click()

      const panel = page.getByTestId('panel-notificaciones')
      await expect(panel).toBeVisible()
      await expect(panel.getByText(identificador)).toHaveCount(0)
    } finally {
      await admin.from('cuotas').update({ cuenta_cobro_id: null }).eq('lote_id', loteId)
    }
  })

  test('el panel se cierra con Escape', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes')

    await page.getByTestId('campana-notificaciones').click()
    await expect(page.getByTestId('panel-notificaciones')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('panel-notificaciones')).toHaveCount(0)
  })

  test('un vendedor no ve avisos: no administra cobranza', async ({ page }) => {
    await login(page, fixtures.vendedorLoteA.email, fixtures.password)
    await page.goto('/admin/lotes')

    await expect(page.getByTestId('badge-notificaciones')).toHaveCount(0)

    await page.getByTestId('campana-notificaciones').click()
    await expect(page.getByTestId('panel-notificaciones')).toContainText('No hay nada pendiente')
  })
})
