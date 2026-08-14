import { test, expect } from '@playwright/test'
import { createAdminClient, ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

test.describe('Eliminar un lote con reserva activa', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('un lote reservado no se puede eliminar, la reserva sigue intacta', async ({ page }) => {
    const admin = createAdminClient()
    const identificador = `E2E Eliminar Reservado ${Date.now()}`

    const { data: lote, error: errorLote } = await admin
      .from('lotes')
      .insert({
        identificador,
        moneda: 'USD',
        estado: 'reservado',
        ubicacion: 'Ubicación E2E',
        precio_total: 5000,
        acreedor_id: fixtures.acreedorConDatos.id,
      })
      .select('id')
      .single()
    if (errorLote || !lote) throw new Error(`No se pudo crear el lote: ${errorLote?.message}`)

    const { error: errorReserva } = await admin.from('reservas').insert({
      lote_id: lote.id,
      nombre_completo: 'Comprador E2E',
      dni: '30111222',
      domicilio: 'Calle Falsa 123',
      email: 'comprador.e2e.eliminar@sima-e2e.invalid',
      telefono: '3511234567',
      estado_civil: 'soltero',
      monto_sena: 500,
      moneda_sena: 'USD',
      comprobante_sena_path: `reservas/${lote.id}/comprobante-e2e.pdf`,
      recibido_por: fixtures.admin.id,
      created_by: fixtures.admin.id,
    })
    if (errorReserva) throw new Error(`No se pudo crear la reserva: ${errorReserva.message}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${lote.id}`)

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Eliminar lote' }).click()

    await expect(page.getByText('No se puede eliminar: este lote tiene una reserva activa')).toBeVisible()

    const { data: loteTrasIntento } = await admin
      .from('lotes')
      .select('id')
      .eq('id', lote.id)
      .maybeSingle()
    expect(loteTrasIntento).not.toBeNull()

    const { data: reservaTrasIntento } = await admin
      .from('reservas')
      .select('id')
      .eq('lote_id', lote.id)
      .maybeSingle()
    expect(reservaTrasIntento).not.toBeNull()
  })

  test('un lote disponible sin reserva se puede eliminar con normalidad', async ({ page }) => {
    const admin = createAdminClient()
    const identificador = `E2E Eliminar Disponible ${Date.now()}`

    const { data: lote, error: errorLote } = await admin
      .from('lotes')
      .insert({
        identificador,
        moneda: 'USD',
        estado: 'disponible',
        ubicacion: 'Ubicación E2E',
        precio_total: 5000,
        acreedor_id: fixtures.acreedorConDatos.id,
      })
      .select('id')
      .single()
    if (errorLote || !lote) throw new Error(`No se pudo crear el lote: ${errorLote?.message}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${lote.id}`)

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Eliminar lote' }).click()
    await page.waitForURL('**/admin/lotes')

    const { data: loteTrasEliminar } = await admin
      .from('lotes')
      .select('id')
      .eq('id', lote.id)
      .maybeSingle()
    expect(loteTrasEliminar).toBeNull()
  })
})
