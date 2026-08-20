import { test, expect, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

async function crearLoteDisponible(identificador: string, acreedorId: string) {
  const admin = createAdminClient()
  const { data: lote, error } = await admin
    .from('lotes')
    .insert({
      identificador,
      moneda: 'USD',
      estado: 'disponible',
      acreedor_id: acreedorId,
    })
    .select('id')
    .single()

  if (error || !lote) {
    throw new Error(`No se pudo crear el lote de prueba: ${error?.message}`)
  }

  return lote.id as string
}

function subirArchivo(page: Page, selector: string, nombre: string) {
  return page.setInputFiles(selector, {
    name: nombre,
    mimeType: 'application/pdf',
    buffer: COMPROBANTE_BYTES,
  })
}

async function completarCamposBasicos(page: Page, estadoCivil: string) {
  await page.getByPlaceholder('Nombre completo').fill('Comprador Fotos E2E')
  await page.getByPlaceholder('DNI', { exact: true }).fill('30111222')
  await page.getByPlaceholder('Domicilio').fill('Calle Falsa 123')
  await page.getByPlaceholder('Email').fill(`fotos.e2e.${Date.now()}@sima-e2e.invalid`)
  await page.getByPlaceholder('9351234567').fill('3511234567')
  await page.selectOption('select[name="estadoCivil"]', estadoCivil)
  await page.getByPlaceholder('Monto de la seña').fill('500')
  await subirArchivo(page, 'input[name="comprobante"]', `e2e-comprobante-${Date.now()}.pdf`)
}

test.describe('Fotos en la reserva', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('soltero: DNI frente y dorso alcanzan, no piden cónyuge ni sentencia', async ({ page }) => {
    const loteId = await crearLoteDisponible(
      `E2E Fotos Soltero ${Date.now()}`,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await completarCamposBasicos(page, 'soltero')
    await subirArchivo(page, 'input[name="dniFrente"]', `e2e-dni-frente-${Date.now()}.pdf`)
    await subirArchivo(page, 'input[name="dniDorso"]', `e2e-dni-dorso-${Date.now()}.pdf`)

    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: reserva } = await admin
      .from('reservas')
      .select('dni_frente_path, dni_dorso_path, dni_conyuge_path, sentencia_divorcio_path')
      .eq('lote_id', loteId)
      .single()

    expect(reserva?.dni_frente_path).toBeTruthy()
    expect(reserva?.dni_dorso_path).toBeTruthy()
    expect(reserva?.dni_conyuge_path).toBeNull()
    expect(reserva?.sentencia_divorcio_path).toBeNull()
  })

  test('reservar sin subir el DNI frente es rechazado, el lote sigue disponible', async ({
    page,
  }) => {
    const loteId = await crearLoteDisponible(
      `E2E Fotos Sin DNI Frente ${Date.now()}`,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await completarCamposBasicos(page, 'soltero')
    await subirArchivo(page, 'input[name="dniDorso"]', `e2e-dni-dorso-${Date.now()}.pdf`)
    // dniFrente NO se sube a propósito.

    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await expect(page.getByText('Subí las fotos del DNI (frente y dorso)')).toBeVisible()

    const admin = createAdminClient()
    const { data: lote } = await admin.from('lotes').select('estado').eq('id', loteId).single()
    expect(lote?.estado).toBe('disponible')
  })

  test('casado sin subir el DNI del cónyuge es rechazado', async ({ page }) => {
    const loteId = await crearLoteDisponible(
      `E2E Fotos Casado Sin Conyuge ${Date.now()}`,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await completarCamposBasicos(page, 'casado')
    await subirArchivo(page, 'input[name="dniFrente"]', `e2e-dni-frente-${Date.now()}.pdf`)
    await subirArchivo(page, 'input[name="dniDorso"]', `e2e-dni-dorso-${Date.now()}.pdf`)
    // dniConyuge NO se sube a propósito.

    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await expect(
      page.getByText('Subí el DNI del cónyuge (elegiste "Casado/a")')
    ).toBeVisible()

    const admin = createAdminClient()
    const { data: lote } = await admin.from('lotes').select('estado').eq('id', loteId).single()
    expect(lote?.estado).toBe('disponible')
  })

  test('divorciado sin subir la sentencia es rechazado', async ({ page }) => {
    const loteId = await crearLoteDisponible(
      `E2E Fotos Divorciado Sin Sentencia ${Date.now()}`,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await completarCamposBasicos(page, 'divorciado')
    await subirArchivo(page, 'input[name="dniFrente"]', `e2e-dni-frente-${Date.now()}.pdf`)
    await subirArchivo(page, 'input[name="dniDorso"]', `e2e-dni-dorso-${Date.now()}.pdf`)
    // sentenciaDivorcio NO se sube a propósito.

    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await expect(
      page.getByText('Subí la sentencia de divorcio (elegiste "Divorciado/a")')
    ).toBeVisible()

    const admin = createAdminClient()
    const { data: lote } = await admin.from('lotes').select('estado').eq('id', loteId).single()
    expect(lote?.estado).toBe('disponible')
  })

  test('casado subiendo todo lo requerido reserva con éxito', async ({ page }) => {
    const loteId = await crearLoteDisponible(
      `E2E Fotos Casado Completo ${Date.now()}`,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await completarCamposBasicos(page, 'casado')
    await subirArchivo(page, 'input[name="dniFrente"]', `e2e-dni-frente-${Date.now()}.pdf`)
    await subirArchivo(page, 'input[name="dniDorso"]', `e2e-dni-dorso-${Date.now()}.pdf`)
    await subirArchivo(page, 'input[name="dniConyuge"]', `e2e-dni-conyuge-${Date.now()}.pdf`)

    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: reserva } = await admin
      .from('reservas')
      .select('dni_conyuge_path')
      .eq('lote_id', loteId)
      .single()

    expect(reserva?.dni_conyuge_path).toBeTruthy()
  })

  test('el detalle del lote muestra los links de las fotos subidas', async ({ page }) => {
    const loteId = await crearLoteDisponible(
      `E2E Fotos Detalle ${Date.now()}`,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await completarCamposBasicos(page, 'casado')
    await subirArchivo(page, 'input[name="dniFrente"]', `e2e-dni-frente-${Date.now()}.pdf`)
    await subirArchivo(page, 'input[name="dniDorso"]', `e2e-dni-dorso-${Date.now()}.pdf`)
    await subirArchivo(page, 'input[name="dniConyuge"]', `e2e-dni-conyuge-${Date.now()}.pdf`)
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await page.waitForURL('**/admin/lotes')

    await page.goto(`/admin/lotes/${loteId}`)

    await expect(page.getByRole('link', { name: 'Ver DNI (frente)' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ver DNI (dorso)' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ver DNI del cónyuge' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ver sentencia de divorcio' })).toHaveCount(0)
  })
})
