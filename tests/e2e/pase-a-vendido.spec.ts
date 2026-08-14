import { test, expect, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login, logout } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

async function crearLoteDisponibleConPrecio(identificador: string, precioTotal: number) {
  const admin = createAdminClient()
  const { data: lote, error } = await admin
    .from('lotes')
    .insert({
      identificador,
      moneda: 'USD',
      estado: 'disponible',
      ubicacion: 'Ubicación E2E',
      precio_total: precioTotal,
    })
    .select('id')
    .single()

  if (error || !lote) {
    throw new Error(`No se pudo crear el lote de prueba: ${error?.message}`)
  }

  return lote.id as string
}

async function reservarLotePorUI(
  page: Page,
  loteId: string,
  datos: { nombreCompleto: string; email: string; montoSena: string; monedaSena?: string }
) {
  await page.goto(`/admin/lotes/${loteId}/reservar`)
  await page.getByPlaceholder('Nombre completo').fill(datos.nombreCompleto)
  await page.getByPlaceholder('DNI').fill('30111222')
  await page.getByPlaceholder('Domicilio').fill('Calle Falsa 123')
  await page.getByPlaceholder('Email').fill(datos.email)
  await page.getByPlaceholder('Teléfono', { exact: true }).fill('3511234567')
  await page.selectOption('select[name="estadoCivil"]', 'soltero')
  await page.getByPlaceholder('Monto de la seña').fill(datos.montoSena)
  await page.selectOption('select[name="monedaSena"]', datos.monedaSena ?? 'USD')
  await page.setInputFiles('input[name="comprobante"]', {
    name: `e2e-vender-${Date.now()}.pdf`,
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
  await page.waitForURL('**/admin/lotes')
}

test.describe('Pase a vendido (fase 2)', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('crear lote ya no pide cuotas', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes/nuevo')
    await expect(page.getByPlaceholder('Cantidad de cuotas')).toHaveCount(0)
    await expect(page.getByPlaceholder('Monto de cada cuota')).toHaveCount(0)
  })

  test('vender sin reservar antes es rechazado, con cartel amarillo', async ({ page }) => {
    const loteId = await crearLoteDisponibleConPrecio(`E2E Vender Sin Reserva ${Date.now()}`, 10000)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/vender`)

    await expect(page.getByText(/no está en estado reservado/)).toBeVisible()
    await expect(page.getByPlaceholder('Nombre completo del comprador')).toHaveCount(0)
  })

  test('acreedor no puede vender ni su propio lote (exclusivo del administrador)', async ({
    page,
  }) => {
    const loteId = await crearLoteDisponibleConPrecio(
      `E2E Vender Acreedor Propio ${Date.now()}`,
      10000
    )
    await createAdminClient()
      .from('lotes')
      .update({ acreedor_id: fixtures.acreedorConDatos.id, estado: 'reservado' })
      .eq('id', loteId)

    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/vender`)
    await page.waitForURL('**/admin/lotes')
    await expect(page).toHaveURL(/\/admin\/lotes$/)
  })

  test('vender tras reservar: formulario precargado, cuotas generadas con monto calculado', async ({
    page,
  }) => {
    const loteId = await crearLoteDisponibleConPrecio(`E2E Vender Completo ${Date.now()}`, 10000)
    // Email único por corrida: `venderLote` invita este email vía
    // `inviteUserByEmail` y crea un `profiles` con ese id. Contra la base
    // compartida y persistente de e2e, un email fijo colisiona (duplicate
    // key en profiles_pkey) al correr la suite una segunda vez, porque
    // Supabase devuelve el mismo usuario ya existente de la corrida
    // anterior. Los identificadores de lote ya usan Date.now() por el mismo
    // motivo; acá se aplica el mismo criterio al email del comprador.
    const emailComprador = `juan.perez.${Date.now()}@sima-e2e.invalid`

    await login(page, fixtures.vendedorSinLotes.email, fixtures.password)
    await reservarLotePorUI(page, loteId, {
      nombreCompleto: 'Juan Pérez',
      email: emailComprador,
      montoSena: '500',
    })
    await logout(page)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/vender`)

    await expect(page.getByPlaceholder('Nombre completo del comprador')).toHaveValue('Juan Pérez')
    await expect(page.getByPlaceholder('Email del comprador')).toHaveValue(emailComprador)

    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('3')
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
    await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: lote } = await admin
      .from('lotes')
      .select('estado, cantidad_cuotas')
      .eq('id', loteId)
      .single()
    expect(lote?.estado).toBe('vendido')
    expect(lote?.cantidad_cuotas).toBe(3)

    const { data: cuotas } = await admin
      .from('cuotas')
      .select('numero, monto_base')
      .eq('lote_id', loteId)
      .order('numero', { ascending: true })
    expect(cuotas).toHaveLength(3)
    const suma = (cuotas ?? []).reduce((acc, c) => acc + Number(c.monto_base), 0)
    expect(Math.round(suma * 100) / 100).toBe(10000)
  })

  test('comprador distinto de quien reservó: se puede sobrescribir nombre y email', async ({
    page,
  }) => {
    const loteId = await crearLoteDisponibleConPrecio(`E2E Vender Comprador Distinto ${Date.now()}`, 6000)

    await login(page, fixtures.admin.email, fixtures.password)
    await reservarLotePorUI(page, loteId, {
      nombreCompleto: 'Pepe (reservó)',
      email: 'pepe@sima-e2e.invalid',
      montoSena: '100',
    })

    // Email único por corrida: ver comentario equivalente en el test
    // "vender tras reservar" más arriba (evita duplicate key en
    // profiles_pkey al correr la suite dos veces contra la base compartida).
    const emailCompradorReal = `juan.real.${Date.now()}@sima-e2e.invalid`

    await page.goto(`/admin/lotes/${loteId}/vender`)
    await page.getByPlaceholder('Nombre completo del comprador').fill('Juan (comprador real)')
    await page.getByPlaceholder('Email del comprador').fill(emailCompradorReal)
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('1')
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
    await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: lote } = await admin.from('lotes').select('cliente_id').eq('id', loteId).single()
    const { data: cliente } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', lote!.cliente_id)
      .single()
    expect(cliente?.full_name).toBe('Juan (comprador real)')
  })

  test('reservar con seña en $0 es aceptado (venta al contado inmediata)', async ({ page }) => {
    const loteId = await crearLoteDisponibleConPrecio(`E2E Reserva Contado ${Date.now()}`, 5000)

    await login(page, fixtures.admin.email, fixtures.password)
    await reservarLotePorUI(page, loteId, {
      nombreCompleto: 'Comprador Contado',
      email: 'contado@sima-e2e.invalid',
      montoSena: '0',
    })

    const admin = createAdminClient()
    const { data: lote } = await admin.from('lotes').select('estado').eq('id', loteId).single()
    expect(lote?.estado).toBe('reservado')
  })

  test('listado de lotes: "Vender" solo aparece para lotes reservados, no disponibles', async ({
    page,
  }) => {
    const identificadorDisponible = `E2E Listado Disponible ${Date.now()}`
    const loteId = await crearLoteDisponibleConPrecio(identificadorDisponible, 5000)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes')

    const fila = page.locator('table').last().getByRole('row', { name: identificadorDisponible })
    await expect(fila.getByRole('link', { name: 'Vender / asignar cliente' })).toHaveCount(0)

    await createAdminClient().from('lotes').update({ estado: 'reservado' }).eq('id', loteId)
    await page.goto('/admin/lotes')
    const filaReservada = page.locator('table').last().getByRole('row', { name: identificadorDisponible })
    await expect(filaReservada.getByRole('link', { name: 'Vender / asignar cliente' })).toBeVisible()
  })

  test('vender con seña menor a la primera cuota: se descuenta del saldo_pendiente', async ({
    page,
  }) => {
    const loteId = await crearLoteDisponibleConPrecio(`E2E Seña Menor ${Date.now()}`, 10000)

    await login(page, fixtures.admin.email, fixtures.password)
    await reservarLotePorUI(page, loteId, {
      nombreCompleto: 'Comprador Seña Menor',
      email: `sena.menor.${Date.now()}@sima-e2e.invalid`,
      montoSena: '500',
    })

    await page.goto(`/admin/lotes/${loteId}/vender`)
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('10')
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
    await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: lote } = await admin.from('lotes').select('cliente_id').eq('id', loteId).single()
    const { data: cuotas } = await admin
      .from('cuotas')
      .select('id, numero, monto_base, saldo_pendiente')
      .eq('lote_id', loteId)
      .order('numero', { ascending: true })

    expect(cuotas?.[0].monto_base).toBe(1000)
    expect(cuotas?.[0].saldo_pendiente).toBe(500)
    expect(cuotas?.[1].saldo_pendiente).toBe(1000)

    const { data: pagos } = await admin
      .from('pagos')
      .select('id, monto, estado')
      .eq('cliente_id', lote!.cliente_id)
    expect(pagos).toHaveLength(1)
    expect(pagos![0].monto).toBe(500)
    expect(pagos![0].estado).toBe('confirmado')

    const { data: imputaciones } = await admin
      .from('pago_imputaciones')
      .select('cuota_id, monto_imputado')
      .eq('pago_id', pagos![0].id)
    expect(imputaciones).toHaveLength(1)
    expect(imputaciones?.[0].cuota_id).toBe(cuotas![0].id)
    expect(imputaciones?.[0].monto_imputado).toBe(500)
  })

  test('vender con seña mayor a la primera cuota: cascadea a la segunda', async ({ page }) => {
    const loteId = await crearLoteDisponibleConPrecio(`E2E Seña Cascada ${Date.now()}`, 10000)

    await login(page, fixtures.admin.email, fixtures.password)
    await reservarLotePorUI(page, loteId, {
      nombreCompleto: 'Comprador Seña Cascada',
      email: `sena.cascada.${Date.now()}@sima-e2e.invalid`,
      montoSena: '1500',
    })

    await page.goto(`/admin/lotes/${loteId}/vender`)
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('10')
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
    await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: cuotas } = await admin
      .from('cuotas')
      .select('numero, saldo_pendiente')
      .eq('lote_id', loteId)
      .order('numero', { ascending: true })

    expect(cuotas?.[0].saldo_pendiente).toBe(0)
    expect(cuotas?.[1].saldo_pendiente).toBe(500)
    expect(cuotas?.[2].saldo_pendiente).toBe(1000)
  })

  test('vender con seña en moneda distinta a la del lote: no se descuenta nada', async ({
    page,
  }) => {
    const loteId = await crearLoteDisponibleConPrecio(`E2E Seña Moneda Distinta ${Date.now()}`, 10000)

    await login(page, fixtures.admin.email, fixtures.password)
    await reservarLotePorUI(page, loteId, {
      nombreCompleto: 'Comprador Seña Moneda Distinta',
      email: `sena.moneda.${Date.now()}@sima-e2e.invalid`,
      montoSena: '500',
      monedaSena: 'ARS',
    })

    await page.goto(`/admin/lotes/${loteId}/vender`)
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('10')
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
    await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: lote } = await admin.from('lotes').select('cliente_id').eq('id', loteId).single()
    const { data: cuotas } = await admin
      .from('cuotas')
      .select('monto_base, saldo_pendiente')
      .eq('lote_id', loteId)

    for (const cuota of cuotas ?? []) {
      expect(cuota.saldo_pendiente).toBe(cuota.monto_base)
    }

    const { data: pagos } = await admin.from('pagos').select('id').eq('cliente_id', lote!.cliente_id)
    expect(pagos).toHaveLength(0)
  })

  test('venta al contado (seña $0): no se crea ningún pago', async ({ page }) => {
    const loteId = await crearLoteDisponibleConPrecio(`E2E Seña Cero Vendido ${Date.now()}`, 5000)

    await login(page, fixtures.admin.email, fixtures.password)
    await reservarLotePorUI(page, loteId, {
      nombreCompleto: 'Comprador Contado Vendido',
      email: `contado.vendido.${Date.now()}@sima-e2e.invalid`,
      montoSena: '0',
    })

    await page.goto(`/admin/lotes/${loteId}/vender`)
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('1')
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
    await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: lote } = await admin.from('lotes').select('cliente_id').eq('id', loteId).single()
    const { data: pagos } = await admin.from('pagos').select('id').eq('cliente_id', lote!.cliente_id)
    expect(pagos).toHaveLength(0)

    const { data: cuotas } = await admin
      .from('cuotas')
      .select('monto_base, saldo_pendiente')
      .eq('lote_id', loteId)
    expect(cuotas?.[0].saldo_pendiente).toBe(cuotas?.[0].monto_base)
  })
})
