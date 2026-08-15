import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

async function crearLoteDisponible(identificador: string) {
  const admin = createAdminClient()
  const { data: lote, error } = await admin
    .from('lotes')
    .insert({ identificador, moneda: 'USD', estado: 'disponible' })
    .select('id')
    .single()

  if (error || !lote) {
    throw new Error(`No se pudo crear el lote de prueba: ${error?.message}`)
  }

  return lote.id as string
}

test.describe('Preservar datos tipeados si falta un campo obligatorio al reservar', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('si falta un campo obligatorio, los demás campos tipeados no se pierden', async ({ page }) => {
    const loteId = await crearLoteDisponible(`E2E Preservar Datos ${Date.now()}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)

    await page.getByPlaceholder('Nombre completo').fill('Comprador Preservado')
    await page.getByPlaceholder('DNI', { exact: true }).fill('30222333')
    await page.getByPlaceholder('Domicilio').fill('Calle Preservada 456')
    // Deliberadamente sin completar el email -- falta un campo obligatorio.
    await page.getByPlaceholder('Teléfono', { exact: true }).fill('3511112222')
    await page.selectOption('select[name="estadoCivil"]', 'soltero')
    await page.getByPlaceholder('Monto de la seña').fill('750')
    await page.setInputFiles('input[name="comprobante"]', {
      name: `e2e-comprobante-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      buffer: COMPROBANTE_BYTES,
    })
    await page.setInputFiles('input[name="dniFrente"]', {
      name: `e2e-dni-frente-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      buffer: COMPROBANTE_BYTES,
    })
    await page.setInputFiles('input[name="dniDorso"]', {
      name: `e2e-dni-dorso-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      buffer: COMPROBANTE_BYTES,
    })

    await page.getByRole('button', { name: 'Confirmar reserva' }).click()

    await expect(page.getByText('Completá todos los campos obligatorios')).toBeVisible()
    await expect(page.getByPlaceholder('Nombre completo')).toHaveValue('Comprador Preservado')
    await expect(page.getByPlaceholder('DNI', { exact: true })).toHaveValue('30222333')
    await expect(page.getByPlaceholder('Domicilio')).toHaveValue('Calle Preservada 456')
    await expect(page.getByPlaceholder('Teléfono', { exact: true })).toHaveValue('3511112222')
    await expect(page.getByPlaceholder('Monto de la seña')).toHaveValue('750')
  })

  test('los datos precargados por el buscador de DNI se preservan si después falta un campo obligatorio', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const dni = `${Date.now()}`.slice(-8)
    const email = `cliente.preservar.${Date.now()}@sima-e2e.invalid`

    const { data: invited } = await admin.auth.admin.inviteUserByEmail(email)
    await admin.from('profiles').insert({
      id: invited!.user.id,
      role: 'cliente',
      full_name: 'Cliente Preservado',
      email,
      dni,
      domicilio: 'Domicilio Precargado 999',
      telefono: '3518888888',
    })

    const loteId = await crearLoteDisponible(`E2E Preservar Con Buscador ${Date.now()}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await page.getByPlaceholder('Buscar cliente por DNI').fill(dni)
    await page.getByRole('button', { name: 'Buscar' }).click()

    await expect(page.getByPlaceholder('Nombre completo')).toHaveValue('Cliente Preservado')

    // Sin subir el comprobante -- dispara el primer error real del
    // formulario sin haber tocado ningún otro campo.
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()

    await expect(page.getByText('Subí el comprobante de la seña')).toBeVisible()
    await expect(page.getByPlaceholder('Nombre completo')).toHaveValue('Cliente Preservado')
    await expect(page.getByPlaceholder('DNI', { exact: true })).toHaveValue(dni)
    await expect(page.getByPlaceholder('Domicilio')).toHaveValue('Domicilio Precargado 999')
    await expect(page.getByPlaceholder('Email')).toHaveValue(email)
    await expect(page.getByPlaceholder('Teléfono', { exact: true })).toHaveValue('3518888888')
  })
})
