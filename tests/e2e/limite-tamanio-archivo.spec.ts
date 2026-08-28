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

  // Este archivo deja dos tipos de basura sin este hook: los lotes
  // "E2E Lote Archivo..." creados sueltos por crearLoteDisponible (con sus
  // reservas), y el pago real que crea "Ya transferí" sobre
  // fixtures.cuotaIds[0] (pagos.lote_id no tiene "on delete cascade", puede
  // bloquear el DELETE de "E2E Test Lote" en otro spec corrido después).
  test.afterAll(async () => {
    const admin = createAdminClient()
    await admin.from('pagos').delete().eq('cliente_id', fixtures.cliente.id)

    const { data: lotesSueltos } = await admin
      .from('lotes')
      .select('id')
      .ilike('identificador', 'E2E Lote Archivo%')
    const idsLotesSueltos = (lotesSueltos ?? []).map((lote) => lote.id)
    if (idsLotesSueltos.length > 0) {
      await admin.from('reservas').delete().in('lote_id', idsLotesSueltos)
      await admin.from('lotes').delete().in('id', idsLotesSueltos)
    }
  })

  test('un comprobante de seña de más de 15 MB se rechaza al reservar', async ({ page }) => {
    const loteId = await crearLoteDisponible(`E2E Lote Archivo Grande ${Date.now()}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)

    await page.getByPlaceholder('Nombre completo').fill('Comprador E2E')
    await page.getByPlaceholder('DNI', { exact: true }).fill('30111222')
    await page.getByPlaceholder('Domicilio').fill('Calle Falsa 123')
    await page.getByPlaceholder('Email').fill('comprador.archivo.grande@sima-demo.invalid')
    await page.getByPlaceholder('9351234567').fill('3511234567')
    await page.selectOption('select[name="estadoCivil"]', 'soltero')
    await page.getByPlaceholder('Monto de la seña').fill('500')
    await page.setInputFiles('[data-testid="comprobante"]', {
      name: 'comprobante-grande.pdf',
      mimeType: 'application/pdf',
      buffer: ARCHIVO_GRANDE,
    })
    // La validación de tamaño ahora corre del lado del cliente (antes de
    // intentar subir nada) -- el error aparece apenas se elige el archivo,
    // no recién después de tocar "Confirmar reserva".
    await expect(
      page.getByText('El comprobante de la seña pesa más de 15 MB')
    ).toBeVisible()

    await page.setInputFiles('[data-testid="dniFrente"]', {
      name: 'dni-frente.pdf',
      mimeType: 'application/pdf',
      buffer: ARCHIVO_CHICO,
    })
    await page.setInputFiles('[data-testid="dniDorso"]', {
      name: 'dni-dorso.pdf',
      mimeType: 'application/pdf',
      buffer: ARCHIVO_CHICO,
    })
    await expect(page.locator('[data-testid="dniFrente"]')).toBeEnabled()
    await expect(page.locator('[data-testid="dniDorso"]')).toBeEnabled()

    // El campo oculto del comprobante quedó vacío (required) -- el navegador
    // bloquea el submit en silencio, nunca llega a pegarle al servidor.
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/lotes/${loteId}/reservar$`))

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

    await page.setInputFiles('[data-testid="comprobante"]', {
      name: 'comprobante-pago-grande.pdf',
      mimeType: 'application/pdf',
      buffer: ARCHIVO_GRANDE,
    })
    // Rechazado del lado del cliente apenas se elige -- "Finalizar" queda
    // bloqueado en silencio por el navegador (campo oculto vacío/required).
    await expect(page.getByText('El comprobante pesa más de 15 MB')).toBeVisible()
    await page.getByRole('button', { name: 'Finalizar' }).click()
    await expect(page).toHaveURL(new RegExp(`/portal-cliente/pagos/${pagoId}/comprobante$`))

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
    await page.getByPlaceholder('9351234567').fill('3511234567')
    await page.selectOption('select[name="estadoCivil"]', 'soltero')
    await page.getByPlaceholder('Monto de la seña').fill('500')
    await page.setInputFiles('[data-testid="comprobante"]', {
      name: 'comprobante-valido.pdf',
      mimeType: 'application/pdf',
      buffer: ARCHIVO_VALIDO,
    })
    await page.setInputFiles('[data-testid="dniFrente"]', {
      name: 'dni-frente.pdf',
      mimeType: 'application/pdf',
      buffer: ARCHIVO_CHICO,
    })
    await page.setInputFiles('[data-testid="dniDorso"]', {
      name: 'dni-dorso.pdf',
      mimeType: 'application/pdf',
      buffer: ARCHIVO_CHICO,
    })
    await expect(page.locator('[data-testid="comprobante"]')).toBeEnabled()
    await expect(page.locator('[data-testid="dniFrente"]')).toBeEnabled()
    await expect(page.locator('[data-testid="dniDorso"]')).toBeEnabled()
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: lote } = await admin.from('lotes').select('estado').eq('id', loteId).single()
    expect(lote?.estado).toBe('reservado')
  })
})
