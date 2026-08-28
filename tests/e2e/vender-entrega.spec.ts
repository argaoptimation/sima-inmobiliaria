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

async function crearReservaConSena(loteId: string, montoSena: number, adminId: string) {
  const admin = createAdminClient()
  const { error } = await admin.from('reservas').insert({
    lote_id: loteId,
    nombre_completo: 'Comprador Con Seña',
    dni: `${Date.now()}`.slice(-8),
    domicilio: 'Domicilio E2E',
    email: `sena.${Date.now()}@sima-e2e.invalid`,
    telefono_numero: '3510000000',
    estado_civil: 'soltero',
    monto_sena: montoSena,
    moneda_sena: 'USD',
    recibido_por: adminId,
    comprobante_sena_path: 'reservas/e2e-comprobante-fake.pdf',
    created_by: adminId,
  })

  if (error) {
    throw new Error(`No se pudo crear la reserva de prueba: ${error.message}`)
  }
}

async function adjuntarDocumentoFirmado(page: import('@playwright/test').Page) {
  await page.setInputFiles('[data-testid="documentoFirmado"]', {
    name: `e2e-documento-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    buffer: COMPROBANTE_BYTES,
  })
  // Sube directo a Storage en cuanto se elige -- esperar a que termine o
  // el submit se bloquea en silencio (campo oculto todavía vacío).
  await expect(page.locator('[data-testid="documentoFirmado"]')).toBeEnabled()
}

async function venderConEntrega(
  page: import('@playwright/test').Page,
  loteId: string,
  datos: { email: string; fullName: string; entregaMonto?: string }
) {
  await page.goto(`/admin/lotes/${loteId}/vender`)
  await page.getByPlaceholder('Nombre completo del comprador').fill(datos.fullName)
  await page.getByPlaceholder('Email del comprador').fill(datos.email)
  await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
  await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('1')
  if (datos.entregaMonto !== undefined) {
    const inputEntrega = page.getByPlaceholder('Entrega')
    // El input tiene min="0" en el cliente (UX), lo que bloquearía el
    // submit nativo del browser para un valor negativo antes de llegar al
    // server action. Se lo saca acá para poder ejercitar la validación del
    // lado del servidor (el guardrail real: el cliente es solo UX, nunca
    // hay que confiar en él, ni siquiera desde un test).
    await inputEntrega.evaluate((el) => el.removeAttribute('min'))
    await inputEntrega.fill(datos.entregaMonto)
  }
  await adjuntarDocumentoFirmado(page)
  await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
}

test.describe('Vender — entrega (anticipo al boleto)', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('venta con entrega en modo manual: se crea el pago sin imputaciones', async ({ page }) => {
    const admin = createAdminClient()
    const loteId = await crearLoteReservadoListoParaVender(
      `E2E Vender Entrega ${Date.now()}`,
      10000,
      fixtures.acreedorConDatos.id
    )
    const email = `comprador.entrega.${Date.now()}@sima-e2e.invalid`

    await login(page, fixtures.admin.email, fixtures.password)
    await venderConEntrega(page, loteId, { email, fullName: 'Comprador Con Entrega', entregaMonto: '2000' })
    await page.waitForURL('**/admin/lotes')

    const { data: pagos } = await admin
      .from('pagos')
      .select('id, monto, motivo, estado')
      .eq('lote_id', loteId)
      .eq('motivo', 'entrega')

    expect(pagos).toHaveLength(1)
    expect(pagos![0].monto).toBe(2000)
    expect(pagos![0].estado).toBe('confirmado')

    const { data: imputaciones } = await admin
      .from('pago_imputaciones')
      .select('id')
      .eq('pago_id', pagos![0].id)
    expect(imputaciones).toHaveLength(0)
  })

  test('venta sin entrega: no se crea ningún pago con motivo entrega', async ({ page }) => {
    const admin = createAdminClient()
    const loteId = await crearLoteReservadoListoParaVender(
      `E2E Vender Sin Entrega ${Date.now()}`,
      5000,
      fixtures.acreedorConDatos.id
    )
    const email = `comprador.sin.entrega.${Date.now()}@sima-e2e.invalid`

    await login(page, fixtures.admin.email, fixtures.password)
    await venderConEntrega(page, loteId, { email, fullName: 'Comprador Sin Entrega' })
    await page.waitForURL('**/admin/lotes')

    const { data: pagos } = await admin
      .from('pagos')
      .select('id')
      .eq('lote_id', loteId)
      .eq('motivo', 'entrega')
    expect(pagos).toHaveLength(0)
  })

  test('venta con entrega + seña ya registrada: quedan como dos pagos separados', async ({ page }) => {
    const admin = createAdminClient()
    const { data: adminProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('email', fixtures.admin.email)
      .single()
    const loteId = await crearLoteReservadoListoParaVender(
      `E2E Vender Entrega Y Sena ${Date.now()}`,
      10000,
      fixtures.acreedorConDatos.id
    )
    await crearReservaConSena(loteId, 100, adminProfile!.id)
    const email = `comprador.entrega.sena.${Date.now()}@sima-e2e.invalid`

    await login(page, fixtures.admin.email, fixtures.password)
    await venderConEntrega(page, loteId, { email, fullName: 'Comprador Entrega Y Seña', entregaMonto: '1900' })
    await page.waitForURL('**/admin/lotes')

    const { data: pagoSena } = await admin
      .from('pagos')
      .select('id, monto')
      .eq('lote_id', loteId)
      .eq('motivo', 'sena')
      .single()
    const { data: pagoEntrega } = await admin
      .from('pagos')
      .select('id, monto')
      .eq('lote_id', loteId)
      .eq('motivo', 'entrega')
      .single()

    expect(pagoSena!.monto).toBe(100)
    expect(pagoEntrega!.monto).toBe(1900)

    const { data: imputacionesSena } = await admin
      .from('pago_imputaciones')
      .select('id')
      .eq('pago_id', pagoSena!.id)
    expect(imputacionesSena!.length).toBeGreaterThan(0)

    const { data: imputacionesEntrega } = await admin
      .from('pago_imputaciones')
      .select('id')
      .eq('pago_id', pagoEntrega!.id)
    expect(imputacionesEntrega).toHaveLength(0)
  })

  test('entrega inválida (negativa) corta sin completar la venta, preservando el resto del formulario', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const loteId = await crearLoteReservadoListoParaVender(
      `E2E Vender Entrega Invalida ${Date.now()}`,
      5000,
      fixtures.acreedorConDatos.id
    )
    const email = `comprador.entrega.invalida.${Date.now()}@sima-e2e.invalid`

    await login(page, fixtures.admin.email, fixtures.password)
    await venderConEntrega(page, loteId, { email, fullName: 'Comprador Entrega Inválida', entregaMonto: '-50' })

    await expect(page.getByText(/monto de la entrega tiene que ser un número válido/)).toBeVisible()
    await expect(page.getByPlaceholder('Nombre completo del comprador')).toHaveValue(
      'Comprador Entrega Inválida'
    )
    await expect(page.getByPlaceholder('Email del comprador')).toHaveValue(email)

    const { data: lote } = await admin.from('lotes').select('estado').eq('id', loteId).single()
    expect(lote?.estado).toBe('reservado')
  })
})
