import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

async function crearPago(nombreArchivo: string, motivo: 'cuota' | 'sena') {
  const admin = createAdminClient()
  const fixtures = await ensureTestFixtures()

  const bucketPath = `pagos/${fixtures.loteId}/${Date.now()}-${nombreArchivo}`
  const { error: errorUpload } = await admin.storage
    .from('comprobantes')
    .upload(bucketPath, COMPROBANTE_BYTES, { contentType: 'application/pdf' })
  if (errorUpload) {
    throw new Error(`No se pudo subir el comprobante de prueba: ${errorUpload.message}`)
  }

  const { data: pago, error } = await admin
    .from('pagos')
    .insert({
      cliente_id: fixtures.cliente.id,
      lote_id: fixtures.loteId,
      monto: 100,
      moneda: 'USD',
      comprobante_path: bucketPath,
      motivo,
      estado: 'pendiente',
    })
    .select('id')
    .single()

  if (error || !pago) {
    throw new Error(`No se pudo crear el pago de prueba: ${error?.message}`)
  }

  return pago.id as string
}

test.describe('Motivo del pago (seña / cuota) en /admin/pagos', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('un pago de cuota normal muestra "Cuota" en la columna Motivo', async ({ page }) => {
    const nombreArchivo = `e2e-motivo-cuota-${Date.now()}.pdf`
    await crearPago(nombreArchivo, 'cuota')

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')

    const fila = page
      .locator('main table tbody tr')
      .filter({ has: page.locator(`a[href*="${nombreArchivo}"]`) })
    await expect(fila.locator('td').nth(2)).toHaveText('Cuota')
  })

  test('un pago de seña muestra "Seña" en la columna Motivo', async ({ page }) => {
    const nombreArchivo = `e2e-motivo-sena-${Date.now()}.pdf`
    await crearPago(nombreArchivo, 'sena')

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')

    const fila = page
      .locator('main table tbody tr')
      .filter({ has: page.locator(`a[href*="${nombreArchivo}"]`) })
    await expect(fila.locator('td').nth(2)).toHaveText('Seña')
  })
})
