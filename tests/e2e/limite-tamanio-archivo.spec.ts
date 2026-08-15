import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

const ARCHIVO_GRANDE = Buffer.alloc(16 * 1024 * 1024)
const ARCHIVO_CHICO = Buffer.from('contenido de prueba chico')
const ARCHIVO_VALIDO = Buffer.alloc(5 * 1024 * 1024)

async function crearLoteDisponible(identificador: string) {
  const admin = createAdminClient()
  const { data: lote, error } = await admin
    .from('lotes')
    .insert({
      identificador,
      moneda: 'USD',
      estado: 'disponible',
      cantidad_cuotas: 1,
      monto_cuota_base: 1,
    })
    .select('id')
    .single()

  if (error || !lote) {
    throw new Error(`No se pudo crear el lote disponible de prueba: ${error?.message}`)
  }

  return lote.id as string
}

test.describe('Límite de tamaño de archivo en subidas', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('un comprobante de seña de más de 15 MB se rechaza al reservar', async ({ page }) => {
    const loteId = await crearLoteDisponible(`E2E Lote Archivo Grande ${Date.now()}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)

    await page.getByPlaceholder('Nombre completo').fill('Comprador E2E')
    await page.getByPlaceholder('DNI', { exact: true }).fill('30111222')
    await page.getByPlaceholder('Domicilio').fill('Calle Falsa 123')
    await page.getByPlaceholder('Email').fill('comprador.archivo.grande@sima-demo.invalid')
    await page.getByPlaceholder('Teléfono', { exact: true }).fill('3511234567')
    await page.selectOption('select[name="estadoCivil"]', 'soltero')
    await page.getByPlaceholder('Monto de la seña').fill('500')
    await page.setInputFiles('input[name="comprobante"]', {
      name: 'comprobante-grande.pdf',
      mimeType: 'application/pdf',
      buffer: ARCHIVO_GRANDE,
    })
    await page.setInputFiles('input[name="dniFrente"]', {
      name: 'dni-frente.pdf',
      mimeType: 'application/pdf',
      buffer: ARCHIVO_CHICO,
    })
    await page.setInputFiles('input[name="dniDorso"]', {
      name: 'dni-dorso.pdf',
      mimeType: 'application/pdf',
      buffer: ARCHIVO_CHICO,
    })
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()

    await expect(
      page.getByText('El comprobante de la seña pesa más de 15 MB')
    ).toBeVisible()

    const admin = createAdminClient()
    const { data: lote } = await admin.from('lotes').select('estado').eq('id', loteId).single()
    expect(lote?.estado).toBe('disponible')
  })

  test('un comprobante de pago de más de 15 MB se rechaza en el portal del cliente', async ({
    page,
  }) => {
    await login(page, fixtures.cliente.email, fixtures.password)

    const cuotaId = fixtures.cuotaIds[0]
    await page.goto(`/portal-cliente/pagar/${cuotaId}`)
    await page.getByPlaceholder('Monto transferido').fill('1000')
    await page.getByRole('button', { name: 'Ya transferí' }).click()
    await page.waitForURL('**/portal-cliente/pagos/**/comprobante')

    const pagoId = new URL(page.url()).pathname.match(/\/pagos\/([^/]+)\/comprobante/)?.[1]
    if (!pagoId) {
      throw new Error(`No se pudo extraer el id del pago de la URL: ${page.url()}`)
    }

    await page.setInputFiles('input[name="comprobante"]', {
      name: 'comprobante-pago-grande.pdf',
      mimeType: 'application/pdf',
      buffer: ARCHIVO_GRANDE,
    })
    await page.getByRole('button', { name: 'Finalizar' }).click()

    await expect(page.getByText('El comprobante pesa más de 15 MB')).toBeVisible()

    const admin = createAdminClient()
    const { data: pago } = await admin
      .from('pagos')
      .select('comprobante_path')
      .eq('id', pagoId)
      .single()
    expect(pago?.comprobante_path).toBeNull()
  })

  test('un comprobante de seña de 5 MB (por debajo del límite) se acepta y la reserva se completa', async ({
    page,
  }) => {
    const loteId = await crearLoteDisponible(`E2E Lote Archivo Valido ${Date.now()}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)

    await page.getByPlaceholder('Nombre completo').fill('Comprador E2E')
    await page.getByPlaceholder('DNI', { exact: true }).fill('30111222')
    await page.getByPlaceholder('Domicilio').fill('Calle Falsa 123')
    await page.getByPlaceholder('Email').fill('comprador.archivo.valido@sima-demo.invalid')
    await page.getByPlaceholder('Teléfono', { exact: true }).fill('3511234567')
    await page.selectOption('select[name="estadoCivil"]', 'soltero')
    await page.getByPlaceholder('Monto de la seña').fill('500')
    await page.setInputFiles('input[name="comprobante"]', {
      name: 'comprobante-valido.pdf',
      mimeType: 'application/pdf',
      buffer: ARCHIVO_VALIDO,
    })
    await page.setInputFiles('input[name="dniFrente"]', {
      name: 'dni-frente.pdf',
      mimeType: 'application/pdf',
      buffer: ARCHIVO_CHICO,
    })
    await page.setInputFiles('input[name="dniDorso"]', {
      name: 'dni-dorso.pdf',
      mimeType: 'application/pdf',
      buffer: ARCHIVO_CHICO,
    })
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: lote } = await admin.from('lotes').select('estado').eq('id', loteId).single()
    expect(lote?.estado).toBe('reservado')
  })
})
