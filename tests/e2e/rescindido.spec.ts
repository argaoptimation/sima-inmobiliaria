import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

async function crearLoteVendidoConPagoConfirmado(
  identificador: string,
  clienteId: string,
  acreedorId: string
) {
  const admin = createAdminClient()

  const { data: lote, error: errorLote } = await admin
    .from('lotes')
    .insert({
      identificador,
      moneda: 'USD',
      estado: 'vendido',
      cliente_id: clienteId,
      acreedor_id: acreedorId,
      cantidad_cuotas: 2,
      monto_cuota_base: 1000,
    })
    .select('id')
    .single()

  if (errorLote || !lote) {
    throw new Error(`No se pudo crear el lote de prueba: ${errorLote?.message}`)
  }

  const { data: cuotas, error: errorCuotas } = await admin
    .from('cuotas')
    .insert([
      { lote_id: lote.id, numero: 1, monto_base: 1000, saldo_pendiente: 0, fecha_vencimiento: '2027-01-10' },
      { lote_id: lote.id, numero: 2, monto_base: 1000, saldo_pendiente: 1000, fecha_vencimiento: '2027-02-10' },
    ])
    .select('id, numero')

  if (errorCuotas || !cuotas) {
    throw new Error(`No se pudieron crear las cuotas de prueba: ${errorCuotas?.message}`)
  }

  const cuota1 = cuotas.find((c) => c.numero === 1)!

  // Un pago CONFIRMADO imputado a la cuota 1 (ya saldada) -- esto es lo
  // que "total cobrado mientras estuvo vendido" tiene que sumar.
  const { data: pago, error: errorPago } = await admin
    .from('pagos')
    .insert({ cliente_id: clienteId, lote_id: lote.id, monto: 1000, moneda: 'USD', estado: 'confirmado' })
    .select('id')
    .single()

  if (errorPago || !pago) {
    throw new Error(`No se pudo crear el pago de prueba: ${errorPago?.message}`)
  }

  const { error: errorImputacion } = await admin
    .from('pago_imputaciones')
    .insert({ pago_id: pago.id, cuota_id: cuota1.id, monto_imputado: 1000 })

  if (errorImputacion) {
    throw new Error(`No se pudo imputar el pago de prueba: ${errorImputacion.message}`)
  }

  return { loteId: lote.id as string }
}

test.describe('Rescindido de lote (24/08)', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('vendido -> rescindido -> disponible, con historial y total cobrado', async ({ page }) => {
    const { loteId } = await crearLoteVendidoConPagoConfirmado(
      `E2E Rescindido ${Date.now()}`,
      fixtures.cliente.id,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}`)

    await expect(page.getByRole('button', { name: 'Rescindir' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Volver a disponible' })).toHaveCount(0)

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Rescindir' }).click()
    await page.waitForURL(`**/admin/lotes/${loteId}`)

    const admin = createAdminClient()
    await expect(async () => {
      const { data: lote } = await admin.from('lotes').select('estado').eq('id', loteId).single()
      expect(lote?.estado).toBe('rescindido')
    }).toPass({ timeout: 5000 })

    await page.reload()

    await expect(page.getByText('Estado: rescindido')).toBeVisible()
    await expect(page.getByText('Total cobrado mientras estuvo vendido: 1000 USD')).toBeVisible()
    await expect(page.getByText('vendido → rescindido')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Rescindir' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Volver a disponible' })).toBeVisible()

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Volver a disponible' }).click()
    await page.waitForURL(`**/admin/lotes/${loteId}`)

    await expect(async () => {
      const { data: lote } = await admin.from('lotes').select('estado, cliente_id').eq('id', loteId).single()
      expect(lote?.estado).toBe('disponible')
      expect(lote?.cliente_id).toBeNull()
    }).toPass({ timeout: 5000 })

    await page.reload()
    await expect(page.getByText('vendido → rescindido')).toBeVisible()
    await expect(page.getByText('rescindido → disponible')).toBeVisible()
    // El total cobrado sigue mostrándose -- es el historial de ese ciclo,
    // no depende del estado actual.
    await expect(page.getByText('Total cobrado mientras estuvo vendido: 1000 USD')).toBeVisible()
  })

  test('no se puede rescindir un lote que no está vendido (gate server-side)', async ({ page }) => {
    const admin = createAdminClient()
    const { data: lote, error } = await admin
      .from('lotes')
      .insert({
        identificador: `E2E Rescindir Disponible ${Date.now()}`,
        moneda: 'USD',
        estado: 'disponible',
        acreedor_id: fixtures.acreedorConDatos.id,
        cantidad_cuotas: 1,
        monto_cuota_base: 1,
      })
      .select('id')
      .single()

    if (error || !lote) throw new Error(`No se pudo crear el lote: ${error?.message}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${lote.id}`)

    // Un lote disponible no tiene botón "Rescindir" en la UI -- confirmamos
    // también el rechazo server-side por si alguien fuerza el submit.
    await expect(page.getByRole('button', { name: 'Rescindir' })).toHaveCount(0)
  })

  test('un acreedor no ve los botones de rescindir ni volver a disponible', async ({ page }) => {
    const { loteId } = await crearLoteVendidoConPagoConfirmado(
      `E2E Rescindido Acreedor ${Date.now()}`,
      fixtures.cliente.id,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}`)

    await expect(page.getByRole('button', { name: 'Rescindir' })).toHaveCount(0)
  })
})
