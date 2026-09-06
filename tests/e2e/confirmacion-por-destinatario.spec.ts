import { test, expect, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createAdminClient, ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login, logout } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

/** El cliente paga la cuota 1 del lote de prueba y sube un comprobante propio. */
async function pagarCuota1(page: Page, fixtures: TestFixtures, nombreArchivo: string) {
  await login(page, fixtures.cliente.email, fixtures.password)
  await page.goto(`/portal-cliente/lotes/${fixtures.loteId}`)

  const filaCuota1 = page.locator('main table').nth(0).locator('tbody tr').nth(0)
  await filaCuota1.getByRole('link', { name: 'Pagar cuota' }).click()
  await page.waitForURL(/\/portal-cliente\/pagar\//)

  await page.getByPlaceholder('Monto transferido').fill('1')
  await page.selectOption('select[name="moneda"]', 'USD')
  await page.getByRole('button', { name: 'Ya transferí' }).click()
  await page.waitForURL(/\/portal-cliente\/pagos\/.+\/comprobante$/)

  await page.setInputFiles('[data-testid="comprobante"]', {
    name: nombreArchivo,
    mimeType: 'application/pdf',
    buffer: COMPROBANTE_BYTES,
  })
  await expect(page.locator('[data-testid="comprobante"]')).toBeEnabled()
  await page.getByRole('button', { name: 'Finalizar' }).click()
  await page.waitForURL(/\/portal-cliente$/)
}

function tarjetaPorComprobante(page: Page, nombreArchivo: string) {
  return page
    .locator('[data-testid="tarjeta-pago"]')
    .filter({ has: page.locator(`a[href*="${nombreArchivo}"]`) })
}

// Regla del 06/09 (Gabriel, hablando por Nicolás): quien confirma un pago en
// primera instancia es el DESTINATARIO de esa cuota -- el dueño del alias que
// el cliente vio al transferir -- y recién después Nicolás hace el segundo
// check. Antes esa primera firma era siempre del acreedor del lote, aunque la
// plata no le hubiera entrado a él.
test.describe('Confirmación por el destinatario de la cuota', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test.afterAll(async () => {
    const admin = createAdminClient()
    await admin.from('pagos').delete().eq('cliente_id', fixtures.cliente.id)
  })

  test('la cuota que cobra un vendedor la confirma ese vendedor, y después el admin', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const nombreComprobante = `e2e-destinatario-${Date.now()}.pdf`

    const { data: cuota1 } = await admin
      .from('cuotas')
      .select('id')
      .eq('lote_id', fixtures.loteId)
      .eq('numero', 1)
      .single()

    try {
      // La cuota 1 se cobra en la cuenta del vendedor A. Además hay que
      // sumarlo como participante del lote: sin eso RLS no le deja ni ver el
      // pago (y es también lo que exige la pantalla de distribución).
      await admin
        .from('cuotas')
        .update({ cuenta_cobro_id: fixtures.vendedorLoteA.id })
        .eq('id', cuota1!.id)

      await admin
        .from('lote_participantes')
        .insert({ lote_id: fixtures.loteId, profile_id: fixtures.vendedorLoteA.id })

      await test.step('el cliente paga esa cuota y sube el comprobante', async () => {
        await pagarCuota1(page, fixtures, nombreComprobante)
      })

      // El pago quedó atado a la cuota que el cliente estaba pagando: sin eso
      // no habría forma de saber quién es el destinatario, porque la
      // imputación es FIFO y puede tocar otras cuotas.
      const { data: pagoCreado } = await admin
        .from('pagos')
        .select('id, cuota_origen_id')
        .eq('cliente_id', fixtures.cliente.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      expect(pagoCreado!.cuota_origen_id).toBe(cuota1!.id)

      await test.step('el vendedor que cobra la cuota lo ve esperando su confirmación', async () => {
        await logout(page)
        await login(page, fixtures.vendedorLoteA.email, fixtures.password)
        await page.goto('/admin/pagos?estado=por-confirmar')

        const tarjeta = tarjetaPorComprobante(page, nombreComprobante)
        await expect(tarjeta).toBeVisible()
        await tarjeta.getByRole('button', { name: 'Confirmar mi parte' }).click()
      })

      await test.step('con una sola firma el pago sigue pendiente: falta el doble check', async () => {
        await expect
          .poll(async () => {
            const { data } = await admin
              .from('pagos')
              .select('confirmado_acreedor_por')
              .eq('id', pagoCreado!.id)
              .single()
            return data?.confirmado_acreedor_por
          })
          .toBe(fixtures.vendedorLoteA.id)

        const { data } = await admin
          .from('pagos')
          .select('estado, confirmado_admin_por')
          .eq('id', pagoCreado!.id)
          .single()

        expect(data!.estado).toBe('pendiente')
        expect(data!.confirmado_admin_por).toBeNull()
      })

      await test.step('el admin hace el segundo check y ahí sí queda confirmado', async () => {
        await logout(page)
        await login(page, fixtures.admin.email, fixtures.password)
        await page.goto('/admin/pagos?estado=por-confirmar')

        const tarjeta = tarjetaPorComprobante(page, nombreComprobante)
        await expect(tarjeta).toBeVisible()
        await tarjeta.getByRole('button', { name: 'Confirmar mi parte' }).click()

        await expect
          .poll(async () => {
            const { data } = await admin
              .from('pagos')
              .select('estado')
              .eq('id', pagoCreado!.id)
              .single()
            return data?.estado
          })
          .toBe('confirmado')
      })

      await test.step('la plata que cobró directo queda como Haber en su cuenta corriente', async () => {
        // El Haber se postea DESPUÉS del claim que deja el pago en
        // 'confirmado', así que esperar el estado no alcanza: hay que
        // esperar la fila.
        const leerMovimientos = async () => {
          const { data } = await admin
            .from('movimientos_cuenta_corriente')
            .select('tipo, monto, origen, profile_id')
            .eq('cuota_id', cuota1!.id)
            .eq('origen', 'pago_directo_cliente')
          return data ?? []
        }

        await expect.poll(async () => (await leerMovimientos()).length).toBe(1)

        expect((await leerMovimientos())[0]).toMatchObject({
          tipo: 'haber',
          monto: 1,
          profile_id: fixtures.vendedorLoteA.id,
        })
      })
    } finally {
      await admin
        .from('movimientos_cuenta_corriente')
        .delete()
        .eq('cuota_id', cuota1!.id)
        .eq('origen', 'pago_directo_cliente')
      await admin.from('cuotas').update({ cuenta_cobro_id: null }).eq('id', cuota1!.id)
      await admin
        .from('lote_participantes')
        .delete()
        .eq('lote_id', fixtures.loteId)
        .eq('profile_id', fixtures.vendedorLoteA.id)
    }
  })

  test('un vendedor que no cobra esa cuota no la ve como suya para confirmar', async ({ page }) => {
    const admin = createAdminClient()
    const nombreComprobante = `e2e-no-destinatario-${Date.now()}.pdf`

    const { data: cuota1 } = await admin
      .from('cuotas')
      .select('id')
      .eq('lote_id', fixtures.loteId)
      .eq('numero', 1)
      .single()

    try {
      // La cuota la cobra el vendedor A, pero el que va a mirar es el
      // vendedor B: participante del lote (así RLS lo deja ver el pago), pero
      // no destinatario de este cobro.
      await admin
        .from('cuotas')
        .update({ cuenta_cobro_id: fixtures.vendedorLoteA.id })
        .eq('id', cuota1!.id)

      await admin
        .from('lote_participantes')
        .insert({ lote_id: fixtures.loteId, profile_id: fixtures.vendedorLoteB.id })

      await pagarCuota1(page, fixtures, nombreComprobante)

      const { data: pagoCreado } = await admin
        .from('pagos')
        .select('id')
        .eq('cliente_id', fixtures.cliente.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      await logout(page)
      await login(page, fixtures.vendedorLoteB.email, fixtures.password)
      await page.goto('/admin/pagos?estado=por-confirmar')

      // Ni siquiera se le ofrece: "Esperando mi confirmación" solo trae lo
      // que se cobra en su propia cuenta.
      await expect(tarjetaPorComprobante(page, nombreComprobante)).toHaveCount(0)

      const { data: sigueSinFirmar } = await admin
        .from('pagos')
        .select('confirmado_acreedor_por')
        .eq('id', pagoCreado!.id)
        .single()

      expect(sigueSinFirmar!.confirmado_acreedor_por).toBeNull()
    } finally {
      await admin.from('cuotas').update({ cuenta_cobro_id: null }).eq('id', cuota1!.id)
      await admin
        .from('lote_participantes')
        .delete()
        .eq('lote_id', fixtures.loteId)
        .eq('profile_id', fixtures.vendedorLoteB.id)
    }
  })
})
