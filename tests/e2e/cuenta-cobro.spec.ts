import { test, expect } from '@playwright/test'
import { createAdminClient, ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login, logout } from './utils/login'

// A quién se le transfiere una cuota se elige cuota por cuota, en
// /distribucion. Hasta el 08/09 había además una "cuenta de cobro actual" a
// nivel lote; se sacó por redundante (pedido de Gabriel), así que estos
// tests ejercitan el único lugar que quedó.
test.describe('A quién se le transfiere cada cuota', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test.afterEach(async () => {
    // El lote es compartido con el resto del suite: se deja sin destino por
    // cuota, que es el estado del que parten los demás specs.
    const admin = createAdminClient()
    await admin
      .from('cuotas')
      .update({ cuenta_cobro_id: null, cuenta_cobro_externa_id: null })
      .eq('lote_id', fixtures.loteId)
  })

  test('el admin manda una cuota a cobrar al acreedor y el cliente ve esos datos al pagar', async ({
    page,
  }) => {
    await test.step('login como admin y entra a la distribución del lote de prueba', async () => {
      await login(page, fixtures.admin.email, fixtures.password)
      await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)
    })

    await test.step('le asigna la cuota 1 al acreedor con datos', async () => {
      // El option de la cuota muestra el papel que la persona tiene EN ESTE
      // lote, no su role global: "(acreedor)" porque es el acreedor del lote.
      await page.selectOption('select[name="cuota1CuentaCobro"]', {
        label: 'E2E Acreedor Con Datos (acreedor)',
      })
      await page.getByRole('button', { name: 'Guardar distribución' }).click()

      // Se espera el aviso que devuelve el server action, no el valor del
      // <select>: ese valor lo acaba de poner el propio test, así que leerlo
      // pasaría igual aunque el guardado no hubiera llegado nunca al
      // servidor -- y el paso siguiente hace logout, que le corta las
      // cookies a un submit todavía en vuelo.
      await expect(page.getByText('Distribución guardada.')).toBeVisible()
      await expect(page.locator('select[name="cuota1CuentaCobro"]')).toHaveValue(
        `profile:${fixtures.acreedorConDatos.id}`
      )
    })

    await test.step('el cliente ve los datos de transferencia del acreedor asignado al pagar', async () => {
      await logout(page)
      await login(page, fixtures.cliente.email, fixtures.password)
      await page.goto(`/portal-cliente/lotes/${fixtures.loteId}`)

      const filaCuota1 = page.locator('main table').nth(0).locator('tbody tr').nth(0)
      await filaCuota1.getByRole('link', { name: 'Pagar cuota' }).click()
      await page.waitForURL(/\/portal-cliente\/pagar\//)

      await expect(page.getByText('acreedor.cobro')).toBeVisible()
      await expect(page.getByText('E2E Acreedor Con Datos SA')).toBeVisible()
    })
  })

  test('a alguien sin datos de transferencia se le puede asignar la cuota, pero avisado', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)

    // El admin del lote (E2E Admin) no tiene alias/banco/titular cargados.
    // Antes quedaba directamente afuera del selector; desde el 08/09 se
    // ofrece igual --  es normal asignarle la cuota y cargarle los datos
    // después -- pero el option viene marcado.
    const opciones = await page
      .locator('select[name="cuota1CuentaCobro"] option')
      .allTextContents()

    const opcionDelAdmin = opciones.find((texto) => texto.includes('E2E Admin'))
    expect(opcionDelAdmin).toBeDefined()
    expect(opcionDelAdmin).toContain('sin datos de transferencia')
  })

  test('el lote ya no tiene una cuenta de cobro propia, aparte de la de cada cuota', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)

    // La sección "Cobro" quedó solo con los roles del lote: el destino del
    // dinero se define abajo, cuota por cuota (08/09, pedido de Gabriel).
    await expect(page.getByText('Cuenta de cobro actual')).toHaveCount(0)
    await expect(page.locator('select[name="cuentaCobroId"]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Guardar cobro' })).toBeVisible()
  })

  test('el atajo "todas las cuotas" le pone el mismo destino a todo el lote', async ({ page }) => {
    const admin = createAdminClient()

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)

    // Es lo que reemplazó a la cuenta de cobro del lote: un solo click para
    // el caso normal de que cobre siempre el mismo.
    await page.selectOption('[data-testid="cuenta-cobro-todas"]', {
      label: 'E2E Vendedor A (vendedor)',
    })
    await page.getByRole('button', { name: 'Guardar distribución' }).click()
    await expect(page.getByText('Distribución guardada.')).toBeVisible()

    const { data: cuotas } = await admin
      .from('cuotas')
      .select('numero, cuenta_cobro_id')
      .eq('lote_id', fixtures.loteId)
      .order('numero')

    expect(cuotas!.length).toBeGreaterThan(1)
    expect(cuotas!.every((cuota) => cuota.cuenta_cobro_id === fixtures.vendedorLoteA.id)).toBe(true)
  })
})
