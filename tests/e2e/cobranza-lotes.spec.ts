import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

test.describe('Estado de cobranza en /admin/lotes', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('lote vendido con deuda muestra el estado y el botón de WhatsApp en la misma fila', async ({
    page,
  }) => {
    const admin = createAdminClient()
    await admin.from('profiles').update({ telefono: '5493511234567' }).eq('id', fixtures.cliente.id)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes')

    // "E2E Test Lote" arranca con sus 3 cuotas sin pagar y ninguna vencida
    // todavía (la primera vence hoy) -- estado "normal" pero con deuda.
    const fila = page.getByRole('row', { name: /E2E Test Lote/ })
    await expect(fila.getByText('Al día')).toBeVisible()

    const link = fila.getByRole('link', { name: 'WhatsApp' })
    await expect(link).toBeVisible()
    const href = await link.getAttribute('href')
    expect(href).toContain('https://wa.me/5493511234567')
  })

  test('lote vendido con cuota vencida muestra "Moroso" en rojo', async ({ page }) => {
    const admin = createAdminClient()
    await admin.from('profiles').update({ telefono: '5493511234567' }).eq('id', fixtures.cliente.id)
    await admin.from('cuotas').update({ fecha_vencimiento: '2020-01-01' }).eq('id', fixtures.cuotaIds[0])

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes')

    const fila = page.getByRole('row', { name: /E2E Test Lote/ })
    await expect(fila.getByText('Moroso')).toBeVisible()
  })

  test('un vendedor/cobrador (que solo ve lotes disponibles) no ve la columna Cobranza', async ({
    page,
  }) => {
    await login(page, fixtures.vendedorLoteA.email, fixtures.password)
    await page.goto('/admin/lotes')

    await expect(page.getByRole('columnheader', { name: 'Cobranza' })).toHaveCount(0)
  })

  test('el administrador tiene links rápidos a Cliente y Acreedor desde la fila del lote', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes')

    const fila = page.getByRole('row', { name: /E2E Test Lote/ })

    await fila.getByRole('link', { name: 'E2E Cliente' }).click()
    await page.waitForURL(new RegExp(`/admin/clientes/${fixtures.cliente.id}`))

    await page.goto('/admin/lotes')
    const filaOtraVez = page.getByRole('row', { name: /E2E Test Lote/ })
    await filaOtraVez.getByRole('link', { name: 'E2E Acreedor Con Datos' }).click()
    await page.waitForURL(/\/admin\/usuarios\?editar=/)
    await expect(page.getByRole('button', { name: 'Guardar nombre' })).toBeVisible()
  })

  test('un lote reservado (sin vendido) no muestra link a Cliente', async ({ page }) => {
    const admin = createAdminClient()
    await admin.from('lotes').delete().eq('identificador', 'E2E Lote Reservado Cobranza')
    const { data: nuevoLote } = await admin
      .from('lotes')
      .insert({
        identificador: 'E2E Lote Reservado Cobranza',
        moneda: 'USD',
        estado: 'reservado',
        acreedor_id: fixtures.acreedorConDatos.id,
      })
      .select('id')
      .single()

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes')

    const fila = page.getByRole('row', { name: /E2E Lote Reservado Cobranza/ })
    await expect(fila.getByRole('link', { name: /E2E Cliente/ })).toHaveCount(0)

    await admin.from('lotes').delete().eq('id', nuevoLote!.id)
  })
})
