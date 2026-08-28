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

  test('si falta un campo obligatorio al reservar (sin adjuntar fotos de DNI), los demás campos tipeados no se pierden', async ({ page }) => {
    const loteId = await crearLoteDisponible(`E2E Preservar Datos ${Date.now()}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)

    await page.getByPlaceholder('Nombre completo').fill('Comprador Preservado')
    await page.getByPlaceholder('DNI', { exact: true }).fill('30222333')
    await page.getByPlaceholder('Domicilio').fill('Calle Preservada 456')
    await page.getByPlaceholder('Email').fill('comprador.preservado@sima-e2e.invalid')
    await page.getByPlaceholder('9351234567').fill('3511112222')
    await page.selectOption('select[name="estadoCivil"]', 'soltero')
    await page.getByPlaceholder('Monto de la seña').fill('750')
    await page.setInputFiles('[data-testid="comprobante"]', {
      name: `e2e-comprobante-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      buffer: COMPROBANTE_BYTES,
    })
    // Deliberadamente NO adjunta dniFrente/dniDorso -- no tienen `required`
    // en el HTML (no se puede expresar "obligatorio salvo..." sin JS), así
    // que el navegador deja enviar el formulario y el error lo tira el
    // servidor -- el escenario real que dispara la preservación.
    await expect(page.locator('[data-testid="comprobante"]')).toBeEnabled()

    await page.getByRole('button', { name: 'Confirmar reserva' }).click()

    await expect(page.getByText('Subí las fotos del DNI (frente y dorso)')).toBeVisible()
    await expect(page.getByPlaceholder('Nombre completo')).toHaveValue('Comprador Preservado')
    await expect(page.getByPlaceholder('DNI', { exact: true })).toHaveValue('30222333')
    await expect(page.getByPlaceholder('Domicilio')).toHaveValue('Calle Preservada 456')
    await expect(page.getByPlaceholder('Email')).toHaveValue('comprador.preservado@sima-e2e.invalid')
    await expect(page.getByPlaceholder('9351234567')).toHaveValue('3511112222')
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
      telefono_numero: '3518888888',
    })

    const loteId = await crearLoteDisponible(`E2E Preservar Con Buscador ${Date.now()}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await page.getByPlaceholder('Buscar cliente por DNI').fill(dni)
    await page.getByRole('button', { name: 'Buscar' }).click()

    await expect(page.getByPlaceholder('Nombre completo')).toHaveValue('Cliente Preservado')

    // Completa lo mínimo que falta para que sea un submit real, sin
    // adjuntar las fotos de DNI (no tienen `required` -- el navegador deja
    // enviar, y el error lo tira el servidor).
    await page.selectOption('select[name="estadoCivil"]', 'soltero')
    await page.getByPlaceholder('Monto de la seña').fill('300')
    await page.setInputFiles('[data-testid="comprobante"]', {
      name: `e2e-comprobante-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      buffer: COMPROBANTE_BYTES,
    })
    await expect(page.locator('[data-testid="comprobante"]')).toBeEnabled()
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()

    await expect(page.getByText('Subí las fotos del DNI (frente y dorso)')).toBeVisible()
    await expect(page.getByPlaceholder('Nombre completo')).toHaveValue('Cliente Preservado')
    await expect(page.getByPlaceholder('DNI', { exact: true })).toHaveValue(dni)
    await expect(page.getByPlaceholder('Domicilio')).toHaveValue('Domicilio Precargado 999')
    await expect(page.getByPlaceholder('Email')).toHaveValue(email)
    await expect(page.getByPlaceholder('9351234567')).toHaveValue('3518888888')

    // El propio motivo de que dniPreservado exista (en vez de reusar el
    // param `dni` del buscador): un error de validación NO debe volver a
    // disparar el bloque de búsqueda con su aviso "Encontramos a...".
    await expect(page.getByText(/Encontramos a/)).toHaveCount(0)
  })
})
