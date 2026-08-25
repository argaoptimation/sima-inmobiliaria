import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

test.describe('Debe manual en cuenta corriente (25/08)', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('crédito adicional suma al saldo, gasto/descuento resta', async ({ page }) => {
    const admin = createAdminClient()
    // Cuenta limpia para este test puntual -- no queremos que movimientos
    // de otros tests contaminen la lectura del saldo mostrado en pantalla.
    await admin.from('movimientos_cuenta_corriente').delete().eq('profile_id', fixtures.acreedorSecundario.id)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/cuentas-corrientes/${fixtures.acreedorSecundario.id}`)

    const saldo = page.locator('h2:has-text("Saldo") + p')
    await expect(saldo).toHaveText('Sin movimientos todavía.')

    // Crédito adicional de 500 USD.
    await page.locator('select[name="tipo"]').selectOption('debe')
    await page.locator('select[name="signo"]').selectOption('credito')
    await page.locator('input[name="monto"]').fill('500')
    await page.locator('input[name="fechaEvento"]').fill('2027-01-05')
    await page.locator('input[name="detalle"]').fill('Bono por lote destacado')
    await page.getByRole('button', { name: 'Agregar movimiento' }).click()
    await page.waitForURL(/\?ok=1/)
    await expect(saldo).toHaveText('500 USD')

    // Gasto/descuento de 150 USD -- tiene que restar, no sumar.
    await page.locator('select[name="tipo"]').selectOption('debe')
    await page.locator('select[name="signo"]').selectOption('gasto')
    await page.locator('input[name="monto"]').fill('150')
    await page.locator('input[name="fechaEvento"]').fill('2027-01-06')
    await page.locator('input[name="detalle"]').fill('Adelanto ya entregado en mano')
    await page.getByRole('button', { name: 'Agregar movimiento' }).click()
    await page.waitForURL(/\?ok=1/)
    await expect(saldo).toHaveText('350 USD')

    const filaGasto = page.locator('tbody tr', { hasText: 'Adelanto ya entregado en mano' })
    await expect(filaGasto.getByText('Debe', { exact: true })).toBeVisible()
    await expect(filaGasto.getByText('-150 USD')).toBeVisible()
  })

  test('un Debe manual sin detalle es rechazado en el servidor', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/cuentas-corrientes/${fixtures.acreedorConDatos.id}`)

    await page.locator('select[name="tipo"]').selectOption('debe')
    await page.locator('input[name="monto"]').fill('100')
    await page.locator('input[name="fechaEvento"]').fill('2027-01-05')
    // Un espacio pasa la validación HTML5 "required" del input (que existe
    // para UX, no como única defensa) pero .trim() del lado del servidor
    // lo sigue tratando como vacío -- así se prueba el gate server-side de
    // verdad, sin que el navegador bloquee el submit antes de llegar ahí.
    await page.locator('input[name="detalle"]').fill(' ')
    await page.getByRole('button', { name: 'Agregar movimiento' }).click()

    await expect(page.getByText(/necesita un detalle explicando el motivo/)).toBeVisible()
  })
})

test.describe('Descarga CSV de movimientos (25/08)', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('el link de descarga trae un CSV con las columnas esperadas', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/cuentas-corrientes/${fixtures.acreedorConDatos.id}`)

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Descargar CSV →' }).click(),
    ])

    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream!) {
      chunks.push(chunk as Buffer)
    }
    const contenido = Buffer.concat(chunks).toString('utf-8')

    expect(contenido).toContain('Fecha,Tipo,Origen,Detalle,Lote,Monto,Moneda')
    expect(download.suggestedFilename()).toMatch(/^cuenta-corriente-.*\.csv$/)
  })
})

test.describe('Link directo desde Usuarios a la cuenta corriente (25/08)', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('el link "Cuenta corriente" de la fila de un acreedor navega al detalle correcto', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/usuarios')

    const fila = page.locator('tbody tr', { hasText: 'E2E Acreedor Con Datos' })
    await fila.getByRole('link', { name: 'Cuenta corriente' }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/cuentas-corrientes/${fixtures.acreedorConDatos.id}$`))
  })
})

test.describe('Filtros de Pagos: fecha, estado y acreedor (25/08)', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('columnas Fecha y Acreedor se muestran, y el filtro por estado/acreedor funciona', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const nombreArchivo = `e2e-filtro-pagos-${Date.now()}.pdf`

    const { data: pago, error } = await admin
      .from('pagos')
      .insert({
        cliente_id: fixtures.cliente.id,
        lote_id: fixtures.loteId,
        monto: 1,
        moneda: 'USD',
        comprobante_path: `pagos/${fixtures.loteId}/${nombreArchivo}`,
        estado: 'pendiente',
      })
      .select('id')
      .single()
    expect(error).toBeNull()

    await login(page, fixtures.admin.email, fixtures.password)

    // Filtro por estado "confirmado" no debería mostrar este pago pendiente.
    await page.goto('/admin/pagos?estado=confirmado')
    await expect(page.locator('tbody tr', { hasText: nombreArchivo })).toHaveCount(0)

    // Sin filtro (o filtrando "pendiente"), sí aparece, con Fecha y Acreedor.
    await page.goto('/admin/pagos?estado=pendiente')
    const fila = page.locator('tbody tr').filter({ has: page.locator(`a[href*="${nombreArchivo}"]`) })
    // El comprobante apunta a un path que no existe de verdad en el bucket,
    // así que la celda de comprobante no tiene link -- se ubica la fila por
    // el nombre del cliente en cambio.
    const filaPorCliente = page.locator('tbody tr', { hasText: 'E2E Test Lote' })
    await expect(filaPorCliente.first()).toBeVisible()
    await expect(filaPorCliente.first().getByText('E2E Acreedor Con Datos')).toBeVisible()

    // Filtro por acreedor: elegir uno DISTINTO no debería traer este pago.
    await page.goto(`/admin/pagos?acreedor=${fixtures.acreedorSecundario.id}`)
    await expect(page.locator('tbody tr', { hasText: 'E2E Test Lote' })).toHaveCount(0)

    await page.goto(`/admin/pagos?acreedor=${fixtures.acreedorConDatos.id}`)
    await expect(page.locator('tbody tr', { hasText: 'E2E Test Lote' }).first()).toBeVisible()

    await admin.from('pagos').delete().eq('id', pago!.id)
  })
})
