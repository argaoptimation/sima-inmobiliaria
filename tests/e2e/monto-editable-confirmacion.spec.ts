import { test, expect, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login, logout } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

async function crearPagoPendienteConComprobante(nombreArchivo: string, monto: number) {
  const admin = createAdminClient()
  const fixtures = await ensureTestFixtures()

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
      estado: 'pendiente',
    })
    .select('id')
    .single()

  if (error || !pago) {
    throw new Error(`No se pudo crear el pago de prueba: ${error?.message}`)
  }

  // Nota sobre cómo se ubica la fila en los tests de abajo: los Server
  // Actions de Next.js no escriben el pagoId en el atributo `action` del
  // <form> (queda vacío, el id viaja codificado en un input oculto), así que
  // `form[action*="${pagoId}"]` nunca matchea nada. Igual que ya hace
  // `pago-flujo-completo.spec.ts`, identificamos la fila por el nombre de
  // archivo único del comprobante, que sí aparece en el href del link "Ver
  // comprobante".
  return { pagoId: pago.id as string, nombreArchivo }
}

function filaPorComprobante(page: Page, nombreArchivo: string) {
  return page
    .locator('main table tbody tr')
    .filter({ has: page.locator(`a[href*="${nombreArchivo}"]`) })
}

test.describe('Monto editable al confirmar un pago', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('confirmar sin editar el monto se comporta igual que antes', async ({ page }) => {
    const { pagoId, nombreArchivo } = await crearPagoPendienteConComprobante(
      `e2e-sin-editar-${Date.now()}.pdf`,
      1000
    )

    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto('/admin/pagos')

    const fila = filaPorComprobante(page, nombreArchivo)
    await expect(fila.getByLabel('Monto a confirmar')).toHaveValue('1000')
    await fila.getByRole('button', { name: 'Confirmar mi parte' }).click()
    // Un submit de Server Action no cambia la URL (queda en /admin/pagos todo
    // el tiempo), así que esperar por waitForURL no sirve como señal de que
    // el servidor ya terminó de procesar el submit -- resuelve al toque,
    // antes de que el UPDATE se haya aplicado. Esperamos, en cambio, a que la
    // columna "Confirmado acreedor" refleje el resultado real.
    await expect(fila.locator('td').nth(7)).toHaveText('Sí')

    const admin = createAdminClient()
    const { data: pago } = await admin.from('pagos').select('monto').eq('id', pagoId).single()
    expect(pago?.monto).toBe(1000)
  })

  test('editar el monto lo actualiza y limpia la confirmación previa del otro rol', async ({
    page,
  }) => {
    const { pagoId, nombreArchivo } = await crearPagoPendienteConComprobante(
      `e2e-editar-${Date.now()}.pdf`,
      50
    )

    // El admin confirma primero con el monto original (50, el "typo").
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')
    let fila = filaPorComprobante(page, nombreArchivo)
    await fila.getByRole('button', { name: 'Confirmar mi parte' }).click()
    await expect(fila.locator('td').nth(8)).toHaveText('Sí') // Confirmado admin

    const admin = createAdminClient()
    const { data: tras1raConfirmacion } = await admin
      .from('pagos')
      .select('confirmado_admin_por')
      .eq('id', pagoId)
      .single()
    expect(tras1raConfirmacion?.confirmado_admin_por).toBeTruthy()

    // El acreedor entra, se da cuenta de que en realidad eran 500, lo corrige.
    await logout(page)
    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto('/admin/pagos')
    fila = filaPorComprobante(page, nombreArchivo)
    await fila.getByLabel('Monto a confirmar').fill('500')
    await fila.getByRole('button', { name: 'Confirmar mi parte' }).click()
    await expect(fila.locator('td').nth(4)).toHaveText('500 USD')

    const { data: trasEdicion } = await admin
      .from('pagos')
      .select('monto, confirmado_acreedor_por, confirmado_admin_por')
      .eq('id', pagoId)
      .single()
    expect(trasEdicion?.monto).toBe(500)
    expect(trasEdicion?.confirmado_acreedor_por).toBeTruthy()
    expect(trasEdicion?.confirmado_admin_por).toBeNull()
  })

  test('confirmar con un monto ya desactualizado es rechazado, sin pisar la corrección ajena', async ({
    page,
    browser,
  }) => {
    const { pagoId, nombreArchivo } = await crearPagoPendienteConComprobante(
      `e2e-obsoleto-${Date.now()}.pdf`,
      50
    )

    // El admin abre la pantalla y ve 50 (todavía no la envía).
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')
    const fila = filaPorComprobante(page, nombreArchivo)
    await expect(fila.getByLabel('Monto a confirmar')).toHaveValue('50')

    // Mientras tanto, el acreedor (en una sesión de browser SEPARADA -- no
    // solo una pestaña nueva del mismo contexto, que compartiría las cookies
    // de sesión del admin y arruinaría el escenario) corrige a 500 y confirma.
    const contextoAcreedor = await browser.newContext()
    const paginaAcreedor = await contextoAcreedor.newPage()
    await login(paginaAcreedor, fixtures.acreedorConDatos.email, fixtures.password)
    await paginaAcreedor.goto('/admin/pagos')
    const filaAcreedor = filaPorComprobante(paginaAcreedor, nombreArchivo)
    await filaAcreedor.getByLabel('Monto a confirmar').fill('500')
    await filaAcreedor.getByRole('button', { name: 'Confirmar mi parte' }).click()
    await expect(filaAcreedor.locator('td').nth(4)).toHaveText('500 USD')
    await contextoAcreedor.close()

    // El admin, sin refrescar, intenta confirmar con el 50 viejo que sigue en su pantalla.
    await fila.getByRole('button', { name: 'Confirmar mi parte' }).click()
    await expect(
      page.getByText(/El monto cambió desde que abriste esta pantalla/)
    ).toBeVisible()

    const admin = createAdminClient()
    const { data: pago } = await admin
      .from('pagos')
      .select('monto, confirmado_admin_por, confirmado_acreedor_por')
      .eq('id', pagoId)
      .single()
    expect(pago?.monto).toBe(500)
    expect(pago?.confirmado_admin_por).toBeNull()
    // La corrección del acreedor no quedó pisada por el submit obsoleto del admin.
    expect(pago?.confirmado_acreedor_por).toBeTruthy()
  })

  test('caso feliz: monto corregido y confirmado por ambos dispara el FIFO con el monto correcto', async ({
    page,
  }) => {
    const { pagoId, nombreArchivo } = await crearPagoPendienteConComprobante(
      `e2e-feliz-${Date.now()}.pdf`,
      50
    )

    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto('/admin/pagos')
    let fila = filaPorComprobante(page, nombreArchivo)
    await fila.getByLabel('Monto a confirmar').fill('500')
    await fila.getByRole('button', { name: 'Confirmar mi parte' }).click()
    await expect(fila.locator('td').nth(4)).toHaveText('500 USD')

    await logout(page)
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')
    fila = filaPorComprobante(page, nombreArchivo)
    await expect(fila.getByLabel('Monto a confirmar')).toHaveValue('500')
    await fila.getByRole('button', { name: 'Confirmar mi parte' }).click()
    await expect(fila.locator('td').nth(6)).toHaveText('confirmado') // Estado

    const admin = createAdminClient()
    const { data: pago } = await admin
      .from('pagos')
      .select('estado, monto')
      .eq('id', pagoId)
      .single()
    expect(pago?.estado).toBe('confirmado')
    expect(pago?.monto).toBe(500)

    const { data: imputaciones } = await admin
      .from('pago_imputaciones')
      .select('monto_imputado')
      .eq('pago_id', pagoId)
    const totalImputado = (imputaciones ?? []).reduce((acc, i) => acc + i.monto_imputado, 0)
    expect(totalImputado).toBe(500)
  })
})
