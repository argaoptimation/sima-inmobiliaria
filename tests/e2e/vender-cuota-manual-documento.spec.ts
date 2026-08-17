import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

async function crearLoteReservadoListoParaVender(
  identificador: string,
  precioTotal: number,
  acreedorId: string
) {
  const admin = createAdminClient()
  const { data: lote, error } = await admin
    .from('lotes')
    .insert({
      identificador,
      moneda: 'USD',
      estado: 'reservado',
      precio_total: precioTotal,
      acreedor_id: acreedorId,
    })
    .select('id')
    .single()

  if (error || !lote) {
    throw new Error(`No se pudo crear el lote de prueba: ${error?.message}`)
  }

  return lote.id as string
}

function adjuntarDocumentoFirmado(page: import('@playwright/test').Page) {
  return page.setInputFiles('input[name="documentoFirmado"]', {
    name: `e2e-documento-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    buffer: COMPROBANTE_BYTES,
  })
}

test.describe('Vender — documento firmado y cuota manual', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('modo automático: vender con documento firmado adjunto crea las cuotas iguales', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const loteId = await crearLoteReservadoListoParaVender(
      `E2E Vender Auto Doc ${Date.now()}`,
      9000,
      fixtures.acreedorConDatos.id
    )
    const email = `comprador.auto.doc.${Date.now()}@sima-e2e.invalid`

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/vender`)
    await page.getByPlaceholder('Nombre completo del comprador').fill('Comprador Auto Doc')
    await page.getByPlaceholder('Email del comprador').fill(email)
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('3')
    await adjuntarDocumentoFirmado(page)
    await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
    await page.waitForURL('**/admin/lotes')

    const { data: lote } = await admin
      .from('lotes')
      .select('estado, documento_firmado_path, monto_cuota_base')
      .eq('id', loteId)
      .single()
    expect(lote?.estado).toBe('vendido')
    expect(lote?.documento_firmado_path).toBeTruthy()
    expect(lote?.monto_cuota_base).toBe(3000)

    const { data: cuotas } = await admin
      .from('cuotas')
      .select('monto_base')
      .eq('lote_id', loteId)
    expect(cuotas).toHaveLength(3)
  })

  test('modo manual: montos distintos, balance en vivo, confirmación crea cuotas exactas', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const loteId = await crearLoteReservadoListoParaVender(
      `E2E Vender Manual ${Date.now()}`,
      10000,
      fixtures.acreedorConDatos.id
    )
    const email = `comprador.manual.${Date.now()}@sima-e2e.invalid`

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/vender`)
    await page.getByPlaceholder('Nombre completo del comprador').fill('Comprador Manual')
    await page.getByPlaceholder('Email del comprador').fill(email)
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('3')
    await page.locator('input[name="modo"][value="manual"]').check()

    await page.locator('input[name="cuotaMonto1"]').fill('4000')
    await page.locator('input[name="cuotaMonto2"]').fill('4000')
    await page.locator('input[name="cuotaMonto3"]').fill('3000')

    await expect(page.getByText('Suma total de las cuotas cargadas: 11000')).toBeVisible()
    await expect(page.getByText(/Diferencia respecto al precio de lista: \+1000/)).toBeVisible()

    await adjuntarDocumentoFirmado(page)
    await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
    await page.waitForURL('**/admin/lotes')

    const { data: lote } = await admin
      .from('lotes')
      .select('monto_cuota_base, documento_firmado_path')
      .eq('id', loteId)
      .single()
    expect(lote?.monto_cuota_base).toBeNull()
    expect(lote?.documento_firmado_path).toBeTruthy()

    const { data: cuotas } = await admin
      .from('cuotas')
      .select('numero, monto_base')
      .eq('lote_id', loteId)
      .order('numero', { ascending: true })
    expect(cuotas).toEqual([
      { numero: 1, monto_base: 4000 },
      { numero: 2, monto_base: 4000 },
      { numero: 3, monto_base: 3000 },
    ])
  })

  test('modo manual + cliente existente: los montos ya tipeados se recuperan al volver de la confirmación', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const email = `cliente.manual.existente.${Date.now()}@sima-e2e.invalid`
    const { data: invited } = await admin.auth.admin.inviteUserByEmail(email)
    await admin.from('profiles').insert({
      id: invited!.user.id,
      role: 'cliente',
      full_name: 'Cliente Manual Existente',
      email,
    })

    const loteId = await crearLoteReservadoListoParaVender(
      `E2E Vender Manual Existente ${Date.now()}`,
      4000,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/vender`)
    await page.getByPlaceholder('Nombre completo del comprador').fill('Cliente Manual Existente')
    await page.getByPlaceholder('Email del comprador').fill(email)
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('2')
    await page.locator('input[name="modo"][value="manual"]').check()
    await page.locator('input[name="cuotaMonto1"]').fill('2500')
    await page.locator('input[name="cuotaMonto2"]').fill('1500')
    await adjuntarDocumentoFirmado(page)
    await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()

    // El email ya tiene cuenta -- vuelve mostrando el aviso, con los montos
    // manuales ya tipeados recuperados solos (el documento hay que
    // reponerlo, limitación del navegador con los inputs de archivo).
    await page.waitForURL((url) => url.searchParams.has('confirmarClienteId'))
    await expect(page.getByText('Ya existe una cuenta de cliente con ese email')).toBeVisible()
    await expect(page.locator('input[name="cuotaMonto1"]')).toHaveValue('2500')
    await expect(page.locator('input[name="cuotaMonto2"]')).toHaveValue('1500')

    await adjuntarDocumentoFirmado(page)
    await page.getByRole('button', { name: 'Confirmar venta con esta cuenta existente' }).click()
    await page.waitForURL('**/admin/lotes')

    const { data: lote } = await admin.from('lotes').select('cliente_id').eq('id', loteId).single()
    expect(lote?.cliente_id).toBe(invited!.user.id)

    const { data: cuotas } = await admin
      .from('cuotas')
      .select('numero, monto_base')
      .eq('lote_id', loteId)
      .order('numero', { ascending: true })
    expect(cuotas?.map((c) => c.monto_base)).toEqual([2500, 1500])
  })

  test('volver de Manual a Automático recalcula los montos sin perder nombre/email', async ({
    page,
  }) => {
    const loteId = await crearLoteReservadoListoParaVender(
      `E2E Vender Cambiar Modo ${Date.now()}`,
      9000,
      fixtures.acreedorConDatos.id
    )
    const email = `comprador.cambiar.modo.${Date.now()}@sima-e2e.invalid`

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/vender`)
    await page.getByPlaceholder('Nombre completo del comprador').fill('Comprador Cambiar Modo')
    await page.getByPlaceholder('Email del comprador').fill(email)
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('3')
    await page.locator('input[name="modo"][value="manual"]').check()
    await page.locator('input[name="cuotaMonto1"]').fill('5000')

    await page.locator('input[name="modo"][value="automatico"]').check()

    await expect(page.getByPlaceholder('Nombre completo del comprador')).toHaveValue(
      'Comprador Cambiar Modo'
    )
    await expect(page.getByPlaceholder('Email del comprador')).toHaveValue(email)
    await expect(page.locator('input[name="cuotaMonto1"]')).toHaveCount(0)

    await page.locator('input[name="modo"][value="manual"]').check()
    await expect(page.locator('input[name="cuotaMonto1"]')).toHaveValue('3000')
    await expect(page.locator('input[name="cuotaMonto2"]')).toHaveValue('3000')
    await expect(page.locator('input[name="cuotaMonto3"]')).toHaveValue('3000')
  })

  test('el detalle del lote muestra un link para ver el documento firmado', async ({ page }) => {
    const admin = createAdminClient()
    const loteId = await crearLoteReservadoListoParaVender(
      `E2E Ver Documento ${Date.now()}`,
      5000,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/vender`)
    await page.getByPlaceholder('Nombre completo del comprador').fill('Comprador Ver Documento')
    await page.getByPlaceholder('Email del comprador').fill(`ver.documento.${Date.now()}@sima-e2e.invalid`)
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('1')
    await adjuntarDocumentoFirmado(page)
    await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
    await page.waitForURL('**/admin/lotes')

    await page.goto(`/admin/lotes/${loteId}`)
    await expect(page.getByRole('link', { name: 'Ver documento firmado' })).toBeVisible()
  })
})
