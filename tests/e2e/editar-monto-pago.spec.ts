import { test, expect, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { imputarPagoFIFO } from '@/lib/pagos/imputar-fifo'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

function filaPorComprobante(page: Page, nombreArchivo: string) {
  return page
    .locator('main table tbody tr')
    .filter({ has: page.locator(`a[href*="${nombreArchivo}"]`) })
}

/**
 * Crea un pago YA confirmado (ambos lados) e imputado vía FIFO, igual que
 * dejaría `confirmarPago` en producción -- pero sin pasar por el browser,
 * para que cada test arranque de un estado conocido sin gastar pasos en
 * repetir el flujo de confirmación cruzada (ya cubierto por
 * pago-flujo-completo.spec.ts).
 */
async function crearPagoConfirmado(fixtures: TestFixtures, nombreArchivo: string, monto: number) {
  const admin = createAdminClient()

  const bucketPath = `pagos/${fixtures.loteId}/${Date.now()}-${nombreArchivo}`
  const { error: errorUpload } = await admin.storage
    .from('comprobantes')
    .upload(bucketPath, COMPROBANTE_BYTES, { contentType: 'application/pdf' })
  if (errorUpload) {
    throw new Error(`No se pudo subir el comprobante de prueba: ${errorUpload.message}`)
  }

  const { data: pago, error } = await admin
    .from('pagos')
    .insert({
      cliente_id: fixtures.cliente.id,
      lote_id: fixtures.loteId,
      monto,
      moneda: 'USD',
      comprobante_path: bucketPath,
      motivo: 'cuota',
      estado: 'confirmado',
      confirmado_admin_por: fixtures.admin.id,
      confirmado_admin_at: new Date().toISOString(),
      confirmado_acreedor_por: fixtures.acreedorConDatos.id,
      confirmado_acreedor_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error || !pago) {
    throw new Error(`No se pudo crear el pago de prueba: ${error?.message}`)
  }

  const { data: cuotas } = await admin
    .from('cuotas')
    .select('id, saldo_pendiente')
    .eq('lote_id', fixtures.loteId)
    .gt('saldo_pendiente', 0)
    .order('numero', { ascending: true })

  const resultado = imputarPagoFIFO(
    monto,
    (cuotas ?? []).map((cuota) => ({ id: cuota.id, saldoPendiente: cuota.saldo_pendiente }))
  )

  for (const imputacion of resultado.imputaciones) {
    await admin.from('pago_imputaciones').insert({
      pago_id: pago.id,
      cuota_id: imputacion.cuotaId,
      monto_imputado: imputacion.montoImputado,
    })

    const cuota = cuotas!.find((c) => c.id === imputacion.cuotaId)!
    await admin
      .from('cuotas')
      .update({ saldo_pendiente: cuota.saldo_pendiente - imputacion.montoImputado })
      .eq('id', imputacion.cuotaId)
  }

  return pago.id as string
}

test.describe('Editar el monto de un pago ya confirmado', () => {
  let fixtures: TestFixtures

  test.beforeEach(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('corrección hacia arriba: la diferencia se imputa a la próxima cuota pendiente', async ({
    page,
  }) => {
    const nombreArchivo = `e2e-ajuste-arriba-${Date.now()}.pdf`
    const pagoId = await crearPagoConfirmado(fixtures, nombreArchivo, 1000) // cubre cuota 1 entera

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')

    const fila = filaPorComprobante(page, nombreArchivo)
    await fila.locator('input[name="montoNuevo"]').fill('1100')
    await fila.getByRole('button', { name: 'Editar monto' }).click()
    // El submit exitoso no redirige (solo revalida la misma ruta), así que
    // esperar la URL no alcanza -- se espera a que la etiqueta refleje el
    // monto efectivo nuevo, señal de que el server action ya terminó.
    await expect(fila.getByText('Corregir monto (actual: 1100 USD)')).toBeVisible()

    const admin = createAdminClient()

    const { data: ajuste } = await admin
      .from('pagos')
      .select('monto, motivo, estado, corrige_pago_id')
      .eq('corrige_pago_id', pagoId)
      .single()
    expect(ajuste?.monto).toBe(100)
    expect(ajuste?.motivo).toBe('ajuste')
    expect(ajuste?.estado).toBe('confirmado')

    const { data: pagoOriginal } = await admin.from('pagos').select('monto').eq('id', pagoId).single()
    expect(pagoOriginal?.monto).toBe(1000) // el original nunca se toca

    const { data: cuotas } = await admin
      .from('cuotas')
      .select('numero, saldo_pendiente')
      .eq('lote_id', fixtures.loteId)
      .order('numero', { ascending: true })
    expect(cuotas?.[0].saldo_pendiente).toBe(0) // cuota 1, ya estaba en 0
    expect(cuotas?.[1].saldo_pendiente).toBe(900) // cuota 2, absorbe los 100 extra
    expect(cuotas?.[2].saldo_pendiente).toBe(1000) // cuota 3, intacta
  })

  test('corrección hacia abajo con una sola cuota afectada: se revierte esa cuota', async ({
    page,
  }) => {
    const nombreArchivo = `e2e-ajuste-abajo-simple-${Date.now()}.pdf`
    const pagoId = await crearPagoConfirmado(fixtures, nombreArchivo, 800) // cuota 1: saldo 1000 -> 200

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')

    const fila = filaPorComprobante(page, nombreArchivo)
    await fila.locator('input[name="montoNuevo"]').fill('700')
    await fila.getByRole('button', { name: 'Editar monto' }).click()
    await expect(fila.getByText('Corregir monto (actual: 700 USD)')).toBeVisible()

    const admin = createAdminClient()

    const { data: ajuste } = await admin
      .from('pagos')
      .select('monto')
      .eq('corrige_pago_id', pagoId)
      .single()
    expect(ajuste?.monto).toBe(-100)

    const { data: cuotas } = await admin
      .from('cuotas')
      .select('numero, saldo_pendiente')
      .eq('lote_id', fixtures.loteId)
      .order('numero', { ascending: true })
    expect(cuotas?.[0].saldo_pendiente).toBe(300) // 200 + 100 revertidos
  })

  test('corrección hacia abajo en cascada: revierte primero la cuota más reciente', async ({
    page,
  }) => {
    const nombreArchivo = `e2e-ajuste-abajo-cascada-${Date.now()}.pdf`
    // 1500 sobre cuotas de 1000: cuota 1 llena (1000), cuota 2 recibe 500.
    const pagoId = await crearPagoConfirmado(fixtures, nombreArchivo, 1500)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')

    const fila = filaPorComprobante(page, nombreArchivo)
    await fila.locator('input[name="montoNuevo"]').fill('800') // delta -700
    await fila.getByRole('button', { name: 'Editar monto' }).click()
    await expect(fila.getByText('Corregir monto (actual: 800 USD)')).toBeVisible()

    const admin = createAdminClient()

    const { data: cuotas } = await admin
      .from('cuotas')
      .select('numero, saldo_pendiente')
      .eq('lote_id', fixtures.loteId)
      .order('numero', { ascending: true })
    // Se revierten primero los 500 de cuota 2 (la imputación más reciente),
    // y con los 200 que faltan se toca recién cuota 1.
    expect(cuotas?.[1].saldo_pendiente).toBe(1000) // cuota 2: 500 + 500 revertidos
    expect(cuotas?.[0].saldo_pendiente).toBe(200) // cuota 1: 0 + 200 revertidos

    const { data: ajuste } = await admin
      .from('pagos')
      .select('id')
      .eq('corrige_pago_id', pagoId)
      .single()
    const { data: imputacionesAjuste } = await admin
      .from('pago_imputaciones')
      .select('cuota_id, monto_imputado')
      .eq('pago_id', ajuste!.id)
    expect(imputacionesAjuste).toHaveLength(2)
    expect(imputacionesAjuste?.reduce((acc, i) => acc + i.monto_imputado, 0)).toBe(-700)
  })

  test('corrección hacia abajo después de una corrección hacia arriba revierte la imputación del ajuste, no la del pago original', async ({
    page,
  }) => {
    const nombreArchivo = `e2e-ajuste-abajo-tras-arriba-${Date.now()}.pdf`
    // 1000 llena la cuota 1 entera. La corrección hacia arriba (+200) cae
    // sobre la cuota 2, en una fila de pago_imputaciones que cuelga del
    // AJUSTE, no del pago original.
    const pagoId = await crearPagoConfirmado(fixtures, nombreArchivo, 1000)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')

    let fila = filaPorComprobante(page, nombreArchivo)
    await fila.locator('input[name="montoNuevo"]').fill('1200') // delta +200, cae en cuota 2
    await fila.getByRole('button', { name: 'Editar monto' }).click()
    await expect(fila.getByText('Corregir monto (actual: 1200 USD)')).toBeVisible()

    // Corrección hacia abajo (-150) sobre el mismo pago original. Tiene que
    // revertir la imputación de 200 que dejó el AJUSTE anterior en cuota 2
    // -- no la imputación de 1000 del pago original en cuota 1, que nunca
    // debería tocarse porque no es el movimiento más reciente.
    fila = filaPorComprobante(page, nombreArchivo)
    await fila.locator('input[name="montoNuevo"]').fill('1050') // delta -150 sobre el efectivo (1200)
    await fila.getByRole('button', { name: 'Editar monto' }).click()
    await expect(fila.getByText('Corregir monto (actual: 1050 USD)')).toBeVisible()

    const admin = createAdminClient()

    const { data: cuotas } = await admin
      .from('cuotas')
      .select('numero, saldo_pendiente')
      .eq('lote_id', fixtures.loteId)
      .order('numero', { ascending: true })
    expect(cuotas?.[0].saldo_pendiente).toBe(0) // cuota 1: nunca se toca por esta reversión
    expect(cuotas?.[1].saldo_pendiente).toBe(950) // cuota 2: 800 (1000-200) + 150 revertidos

    const { data: ajustes } = await admin
      .from('pagos')
      .select('id, monto')
      .eq('corrige_pago_id', pagoId)
      .order('created_at', { ascending: true })
    expect(ajustes).toHaveLength(2)
    expect(ajustes?.[0].monto).toBe(200)
    expect(ajustes?.[1].monto).toBe(-150)

    const { data: imputacionesReversion } = await admin
      .from('pago_imputaciones')
      .select('cuota_id')
      .eq('pago_id', ajustes![1].id)
    expect(imputacionesReversion).toHaveLength(1)

    // La cuota que recibió la reversión es la 2 -- la que tocó el ajuste
    // anterior -- no la 1, que es la del pago original.
    const { data: cuotaIdsPorNumero } = await admin
      .from('cuotas')
      .select('id, numero')
      .eq('lote_id', fixtures.loteId)
    const idCuota2 = cuotaIdsPorNumero!.find((c) => c.numero === 2)!.id
    expect(imputacionesReversion?.[0].cuota_id).toBe(idCuota2)
  })

  test('segunda corrección sobre el mismo pago parte del monto efectivo, no del original', async ({
    page,
  }) => {
    const nombreArchivo = `e2e-ajuste-doble-${Date.now()}.pdf`
    const pagoId = await crearPagoConfirmado(fixtures, nombreArchivo, 1000)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')

    let fila = filaPorComprobante(page, nombreArchivo)
    await fila.locator('input[name="montoNuevo"]').fill('1100')
    await fila.getByRole('button', { name: 'Editar monto' }).click()
    await expect(fila.getByText('Corregir monto (actual: 1100 USD)')).toBeVisible()

    await page.goto('/admin/pagos')
    fila = filaPorComprobante(page, nombreArchivo)
    // El input tiene que precargar el monto EFECTIVO (1100), no el original (1000).
    await expect(fila.locator('input[name="montoNuevo"]')).toHaveValue('1100')

    await fila.locator('input[name="montoNuevo"]').fill('1150')
    await fila.getByRole('button', { name: 'Editar monto' }).click()
    await expect(fila.getByText('Corregir monto (actual: 1150 USD)')).toBeVisible()

    const admin = createAdminClient()
    const { data: ajustes } = await admin
      .from('pagos')
      .select('monto')
      .eq('corrige_pago_id', pagoId)
      .order('created_at', { ascending: true })
    expect(ajustes).toHaveLength(2)
    expect(ajustes?.[0].monto).toBe(100)
    expect(ajustes?.[1].monto).toBe(50) // 1150 - 1100, no 1150 - 1000
  })

  test('el rechazo por estado ya no confirmado ocurre en el servidor', async ({ page }) => {
    const nombreArchivo = `e2e-ajuste-rechazo-estado-${Date.now()}.pdf`
    const pagoId = await crearPagoConfirmado(fixtures, nombreArchivo, 1000)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')

    const fila = filaPorComprobante(page, nombreArchivo)
    await fila.locator('input[name="montoNuevo"]').fill('1200')

    // El formulario ya está renderizado en el browser cuando el pago deja
    // de estar confirmado por fuera -- el filtro de render inicial ya no
    // protege nada en este punto.
    const admin = createAdminClient()
    await admin.from('pagos').update({ estado: 'pendiente' }).eq('id', pagoId)

    await fila.getByRole('button', { name: 'Editar monto' }).click()
    await page.waitForURL(/\/admin\/pagos/)
    await expect(page.getByText(/no se puede editar/)).toBeVisible()

    const { data: ajuste } = await admin
      .from('pagos')
      .select('id')
      .eq('corrige_pago_id', pagoId)
    expect(ajuste).toHaveLength(0)
  })

  test('el rechazo por ya-ser-un-ajuste ocurre en el servidor', async ({ page }) => {
    const nombreArchivo = `e2e-ajuste-rechazo-motivo-${Date.now()}.pdf`
    const pagoId = await crearPagoConfirmado(fixtures, nombreArchivo, 1000)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')

    const fila = filaPorComprobante(page, nombreArchivo)
    await fila.locator('input[name="montoNuevo"]').fill('1200')

    const admin = createAdminClient()
    await admin.from('pagos').update({ motivo: 'ajuste' }).eq('id', pagoId)

    await fila.getByRole('button', { name: 'Editar monto' }).click()
    await page.waitForURL(/\/admin\/pagos/)
    await expect(page.getByText(/no se puede editar/)).toBeVisible()

    const { data: ajuste } = await admin
      .from('pagos')
      .select('id')
      .eq('corrige_pago_id', pagoId)
    expect(ajuste).toHaveLength(0)
  })

  test('un acreedor no ve el control de "Editar monto"', async ({ page }) => {
    const nombreArchivo = `e2e-ajuste-acreedor-${Date.now()}.pdf`
    await crearPagoConfirmado(fixtures, nombreArchivo, 1000)

    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto('/admin/pagos')

    const fila = filaPorComprobante(page, nombreArchivo)
    await expect(fila).toBeVisible()
    await expect(fila.getByRole('button', { name: 'Editar monto' })).toHaveCount(0)
  })

  test('la guarda optimista rechaza una corrección basada en un monto efectivo desactualizado', async ({
    page,
  }) => {
    const nombreArchivo = `e2e-ajuste-carrera-${Date.now()}.pdf`
    const pagoId = await crearPagoConfirmado(fixtures, nombreArchivo, 1000)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')

    const fila = filaPorComprobante(page, nombreArchivo)
    await expect(fila.locator('input[name="montoNuevo"]')).toHaveValue('1000')
    await fila.locator('input[name="montoNuevo"]').fill('1200')

    // Otra corrección se cuela por fuera del browser DESPUÉS de que esta
    // pantalla ya cargó con el monto efectivo viejo (1000).
    const admin = createAdminClient()
    await admin
      .from('pagos')
      .insert({
        cliente_id: fixtures.cliente.id,
        lote_id: fixtures.loteId,
        monto: 50,
        moneda: 'USD',
        motivo: 'ajuste',
        estado: 'confirmado',
        confirmado_admin_por: fixtures.admin.id,
        confirmado_admin_at: new Date().toISOString(),
        corrige_pago_id: pagoId,
      })

    await fila.getByRole('button', { name: 'Editar monto' }).click()
    await page.waitForURL(/\/admin\/pagos/)
    await expect(page.getByText(/cambió desde que abriste esta pantalla/)).toBeVisible()

    // Solo debe existir el ajuste de 50 colado por fuera -- el submit
    // obsoleto (que hubiera creado uno de 200) no se aplicó.
    const { data: ajustes } = await admin.from('pagos').select('monto').eq('corrige_pago_id', pagoId)
    expect(ajustes).toHaveLength(1)
    expect(ajustes?.[0].monto).toBe(50)
  })
})
