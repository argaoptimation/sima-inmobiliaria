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

async function venderConInteres(
  page: import('@playwright/test').Page,
  loteId: string,
  datos: { email: string; fullName: string; interesMoratorioDiario?: string }
) {
  await page.goto(`/admin/lotes/${loteId}/vender`)
  await page.getByPlaceholder('Nombre completo del comprador').fill(datos.fullName)
  await page.getByPlaceholder('Email del comprador').fill(datos.email)
  await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
  await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('1')
  if (datos.interesMoratorioDiario !== undefined) {
    const inputInteres = page.getByPlaceholder('Interés moratorio diario')
    // El input tiene min="0" del lado del cliente (UX): con un valor
    // negativo el browser bloquea el submit nativo antes de llegar al
    // server action, igual que ya se documentó para "Entrega" en
    // vender-entrega.spec.ts. Se saca el atributo para poder ejercitar de
    // verdad la validación server-side, que es el guardrail real.
    await inputInteres.evaluate((el) => el.removeAttribute('min'))
    await inputInteres.fill(datos.interesMoratorioDiario)
  }
  await page.setInputFiles('input[name="documentoFirmado"]', {
    name: `e2e-documento-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    buffer: COMPROBANTE_BYTES,
  })
  await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
}

test.describe('Interés moratorio diario por lote', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('vender con interés moratorio válido lo guarda en el lote', async ({ page }) => {
    const admin = createAdminClient()
    const loteId = await crearLoteReservadoListoParaVender(
      `E2E Vender Interes ${Date.now()}`,
      10000,
      fixtures.acreedorConDatos.id
    )
    const email = `comprador.interes.${Date.now()}@sima-e2e.invalid`

    await login(page, fixtures.admin.email, fixtures.password)
    await venderConInteres(page, loteId, {
      email,
      fullName: 'Comprador Con Interés',
      interesMoratorioDiario: '1.5',
    })
    await page.waitForURL('**/admin/lotes')

    const { data: lote } = await admin
      .from('lotes')
      .select('interes_moratorio_diario')
      .eq('id', loteId)
      .single()

    expect(lote?.interes_moratorio_diario).toBe(1.5)
  })

  test('vender sin cargar interés moratorio deja el campo en null', async ({ page }) => {
    const admin = createAdminClient()
    const loteId = await crearLoteReservadoListoParaVender(
      `E2E Vender Sin Interes ${Date.now()}`,
      5000,
      fixtures.acreedorConDatos.id
    )
    const email = `comprador.sin.interes.${Date.now()}@sima-e2e.invalid`

    await login(page, fixtures.admin.email, fixtures.password)
    await venderConInteres(page, loteId, { email, fullName: 'Comprador Sin Interés' })
    await page.waitForURL('**/admin/lotes')

    const { data: lote } = await admin
      .from('lotes')
      .select('interes_moratorio_diario')
      .eq('id', loteId)
      .single()

    expect(lote?.interes_moratorio_diario).toBeNull()
  })

  test('interés moratorio inválido (negativo) corta sin completar la venta', async ({ page }) => {
    const loteId = await crearLoteReservadoListoParaVender(
      `E2E Vender Interes Invalido ${Date.now()}`,
      5000,
      fixtures.acreedorConDatos.id
    )
    const email = `comprador.interes.invalido.${Date.now()}@sima-e2e.invalid`

    await login(page, fixtures.admin.email, fixtures.password)
    await venderConInteres(page, loteId, {
      email,
      fullName: 'Comprador Interés Inválido',
      interesMoratorioDiario: '-5',
    })

    await expect(
      page.getByText(/interés moratorio diario tiene que ser un porcentaje válido/)
    ).toBeVisible()

    const admin = createAdminClient()
    const { data: lote } = await admin.from('lotes').select('estado').eq('id', loteId).single()
    expect(lote?.estado).toBe('reservado')
  })

  test('una cuota vencida con pago parcial muestra el interés moratorio acumulado en el detalle del lote', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const loteId = await crearLoteReservadoListoParaVender(
      `E2E Interes Acumulado ${Date.now()}`,
      100,
      fixtures.acreedorConDatos.id
    )
    const email = `comprador.interes.acumulado.${Date.now()}@sima-e2e.invalid`

    await login(page, fixtures.admin.email, fixtures.password)
    await venderConInteres(page, loteId, {
      email,
      fullName: 'Comprador Interés Acumulado',
      interesMoratorioDiario: '1',
    })
    await page.waitForURL('**/admin/lotes')

    // Simula el ejemplo real de Nicolás: cuota de $100, vencida hace 4 días,
    // con $20 de saldo impago tras un pago parcial de $80 -- 1%/día sobre
    // $20 durante 4 días = $0.80 de interés acumulado a hoy.
    const haceCuatroDias = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)

    const { data: cuota } = await admin
      .from('cuotas')
      .select('id')
      .eq('lote_id', loteId)
      .single()

    await admin
      .from('cuotas')
      .update({ saldo_pendiente: 20, fecha_vencimiento: haceCuatroDias })
      .eq('id', cuota!.id)

    await page.goto(`/admin/lotes/${loteId}`)
    await expect(page.getByText('+0.8 USD')).toBeVisible()
  })
})
