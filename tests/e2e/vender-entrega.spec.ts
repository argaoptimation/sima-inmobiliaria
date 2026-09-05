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
    await page.waitForURL(/\/distribucion/)

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
    await page.waitForURL(/\/distribucion/)

    const { data: pagos } = await admin
      .from('pagos')
      .select('id')
      .eq('lote_id', loteId)
      .eq('motivo', 'entrega')
    expect(pagos).toHaveLength(0)
  })

  test('venta con entrega + seña: las cuotas se calculan sobre lo que queda a financiar', async ({
    page,
  }) => {
    // Caso exacto que reportó Gabriel el 05/09 con "DEMO Prueba de 1ra
    // entrega y resta FIFO": lote de 10.000, seña 500, entrega 5.000, 10
    // cuotas. Antes generaba 10 cuotas de 1.000 (el precio de lista
    // dividido 10) y la entrega no se descontaba de ningún lado.
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
    await crearReservaConSena(loteId, 500, adminProfile!.id)
    const email = `comprador.entrega.sena.${Date.now()}@sima-e2e.invalid`

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/vender`)
    await page.getByPlaceholder('Nombre completo del comprador').fill('Comprador Entrega Y Seña')
    await page.getByPlaceholder('Email del comprador').fill(email)
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('10')
    await page.getByPlaceholder('Entrega').fill('5000')

    // El balance en pantalla ya tiene que mostrar la cuenta neta antes de
    // confirmar, no el precio de lista dividido 10.
    await expect(page.getByText('= Queda a financiar en cuotas: 4500 USD')).toBeVisible()
    await expect(page.getByText('10 cuotas de 450')).toBeVisible()

    await adjuntarDocumentoFirmado(page)
    await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
    await page.waitForURL(/\/distribucion/)

    const { data: cuotas } = await admin
      .from('cuotas')
      .select('numero, monto_base, saldo_pendiente')
      .eq('lote_id', loteId)
      .order('numero')

    expect(cuotas).toHaveLength(10)
    expect(cuotas!.every((cuota) => cuota.monto_base === 450)).toBe(true)
    // Ninguna cuota quedó "comida" por la seña: todas arrancan con su
    // saldo completo, que es justamente lo que Gabriel quería ver.
    expect(cuotas!.every((cuota) => cuota.saldo_pendiente === 450)).toBe(true)

    const suma = cuotas!.reduce((acc, cuota) => acc + cuota.monto_base, 0)
    expect(suma).toBe(4500)
    expect(suma + 500 + 5000).toBe(10000)

    // Seña y entrega quedan como pagos confirmados del lote (aparecen en el
    // historial y en la caja) pero sin imputar contra ninguna cuota: ya
    // están descontados del total a financiar.
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

    expect(pagoSena!.monto).toBe(500)
    expect(pagoEntrega!.monto).toBe(5000)

    const { data: imputaciones } = await admin
      .from('pago_imputaciones')
      .select('id')
      .in('pago_id', [pagoSena!.id, pagoEntrega!.id])
    expect(imputaciones).toHaveLength(0)
  })

  test('el documento firmado se conserva al rebotar por cliente existente', async ({ page }) => {
    // Bug reportado por Gabriel el 05/09: cuando el comprador ya tenía
    // cuenta (segundo lote del mismo cliente), el aviso de "ya existe una
    // cuenta" volvía al formulario perdiendo el documento ya adjuntado, y
    // había que subirlo de nuevo para poder confirmar la venta.
    const admin = createAdminClient()
    const emailRepetido = `comprador.repetido.${Date.now()}@sima-e2e.invalid`

    // Primera venta: crea la cuenta del cliente.
    const primerLoteId = await crearLoteReservadoListoParaVender(
      `E2E Doc Preservado A ${Date.now()}`,
      5000,
      fixtures.acreedorConDatos.id
    )
    await login(page, fixtures.admin.email, fixtures.password)
    await venderConEntrega(page, primerLoteId, { email: emailRepetido, fullName: 'Comprador Repetido' })
    await page.waitForURL(/\/distribucion/)

    // Segunda venta con el MISMO email: acá aparece el aviso.
    const segundoLoteId = await crearLoteReservadoListoParaVender(
      `E2E Doc Preservado B ${Date.now()}`,
      6000,
      fixtures.acreedorConDatos.id
    )
    await venderConEntrega(page, segundoLoteId, { email: emailRepetido, fullName: 'Comprador Repetido' })

    await expect(page.getByText('Ya existe una cuenta de cliente con ese email')).toBeVisible()

    // El path del documento sigue en el formulario: se puede confirmar sin
    // volver a adjuntar nada.
    const pathConservado = await page
      .locator('input[type="hidden"][name="documentoFirmado"]')
      .inputValue()
    expect(pathConservado).toContain(`ventas/${segundoLoteId}/`)

    await page.getByRole('button', { name: 'Confirmar venta con esta cuenta existente' }).click()
    await page.waitForURL(/\/distribucion/)

    const { data: lote } = await admin
      .from('lotes')
      .select('estado, documento_firmado_path')
      .eq('id', segundoLoteId)
      .single()
    expect(lote!.estado).toBe('vendido')
    expect(lote!.documento_firmado_path).toBe(pathConservado)
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
