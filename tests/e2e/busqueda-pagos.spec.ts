import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createAdminClient, ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

async function crearLoteYPagoDeCliente(
  identificadorLote: string,
  acreedorId: string,
  clienteId: string,
  nombreArchivoComprobante: string
) {
  const admin = createAdminClient()

  const { data: lote, error: errorLote } = await admin
    .from('lotes')
    .insert({
      identificador: identificadorLote,
      moneda: 'USD',
      estado: 'vendido',
      ubicacion: 'Ubicación E2E',
      precio_total: 3000,
      acreedor_id: acreedorId,
      cliente_id: clienteId,
    })
    .select('id')
    .single()
  if (errorLote || !lote) throw new Error(`No se pudo crear el lote: ${errorLote?.message}`)

  const bucketPath = `pagos/${lote.id}/${Date.now()}-${nombreArchivoComprobante}`
  const { error: errorUpload } = await admin.storage
    .from('comprobantes')
    .upload(bucketPath, COMPROBANTE_BYTES, { contentType: 'application/pdf' })
  if (errorUpload) throw new Error(`No se pudo subir el comprobante: ${errorUpload.message}`)

  const { error: errorPago } = await admin.from('pagos').insert({
    cliente_id: clienteId,
    lote_id: lote.id,
    monto: 100,
    moneda: 'USD',
    comprobante_path: bucketPath,
    estado: 'pendiente',
  })
  if (errorPago) throw new Error(`No se pudo crear el pago: ${errorPago.message}`)

  return lote.id as string
}

async function crearClienteDescartable(nombre: string, dni?: string) {
  const admin = createAdminClient()
  const email = `${nombre.toLowerCase().replace(/\s+/g, '.')}.${Date.now()}@sima-e2e.invalid`

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'Sima123!',
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`No se pudo crear el cliente: ${error?.message}`)

  const { error: errorProfile } = await admin
    .from('profiles')
    .insert({ id: data.user.id, role: 'cliente', full_name: nombre, email, dni: dni ?? null })
  if (errorProfile) throw new Error(`No se pudo crear el profile: ${errorProfile.message}`)

  return { id: data.user.id, email }
}

test.describe('Nombre de cliente y búsqueda en /admin/pagos', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('la columna Cliente muestra el nombre correcto', async ({ page }) => {
    const nombreArchivo = `e2e-columna-cliente-${Date.now()}.pdf`
    const cliente = await crearClienteDescartable(`E2E Cliente Columna ${Date.now()}`)
    await crearLoteYPagoDeCliente(
      `E2E Lote Columna ${Date.now()}`,
      fixtures.acreedorConDatos.id,
      cliente.id,
      nombreArchivo
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')

    const fila = page
      .locator('main table tbody tr')
      .filter({ has: page.locator(`a[href*="${nombreArchivo}"]`) })
    // índice 2: Fecha, Lote, Cliente (se agregaron Fecha y Acreedor 25/08).
    await expect(fila.locator('td').nth(2)).toHaveText(cliente.id ? (await (async () => {
      const admin = createAdminClient()
      const { data } = await admin.from('profiles').select('full_name').eq('id', cliente.id).single()
      return data!.full_name as string
    })()) : '')
  })

  test('buscar por nombre de cliente encuentra su pago', async ({ page }) => {
    const nombreArchivo = `e2e-buscar-cliente-${Date.now()}.pdf`
    const nombreCliente = `E2E Cliente Buscar ${Date.now()}`
    const cliente = await crearClienteDescartable(nombreCliente)
    await crearLoteYPagoDeCliente(
      `E2E Lote Buscar Cliente ${Date.now()}`,
      fixtures.acreedorConDatos.id,
      cliente.id,
      nombreArchivo
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')
    await page.getByPlaceholder('Cliente, DNI o lote').fill(nombreCliente)
    await page.getByRole('button', { name: 'Filtrar' }).click()

    await expect(page.locator(`a[href*="${nombreArchivo}"]`)).toBeVisible()
  })

  test('buscar por identificador de lote encuentra el pago', async ({ page }) => {
    const nombreArchivo = `e2e-buscar-lote-${Date.now()}.pdf`
    const identificadorLote = `E2E Lote Buscar Identificador ${Date.now()}`
    const cliente = await crearClienteDescartable(`E2E Cliente Para Lote ${Date.now()}`)
    await crearLoteYPagoDeCliente(
      identificadorLote,
      fixtures.acreedorConDatos.id,
      cliente.id,
      nombreArchivo
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')
    await page.getByPlaceholder('Cliente, DNI o lote').fill(identificadorLote)
    await page.getByRole('button', { name: 'Filtrar' }).click()

    await expect(page.locator(`a[href*="${nombreArchivo}"]`)).toBeVisible()
  })

  test('buscar por DNI de cliente encuentra su pago, y el DNI se muestra en la columna Cliente (28/08, pedido de Nico)', async ({
    page,
  }) => {
    const nombreArchivo = `e2e-buscar-dni-${Date.now()}.pdf`
    const dniCliente = `${Date.now()}`.slice(-8)
    const cliente = await crearClienteDescartable(`E2E Cliente Buscar DNI ${Date.now()}`, dniCliente)
    await crearLoteYPagoDeCliente(
      `E2E Lote Buscar DNI ${Date.now()}`,
      fixtures.acreedorConDatos.id,
      cliente.id,
      nombreArchivo
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')
    await page.getByPlaceholder('Cliente, DNI o lote').fill(dniCliente)
    await page.getByRole('button', { name: 'Filtrar' }).click()

    const fila = page
      .locator('main table tbody tr')
      .filter({ has: page.locator(`a[href*="${nombreArchivo}"]`) })
    await expect(fila).toBeVisible()
    await expect(fila.getByText(`DNI ${dniCliente}`)).toBeVisible()
  })

  test('buscar algo que no matchea nada da lista vacía sin error', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')
    await page.getByPlaceholder('Cliente, DNI o lote').fill(`Texto Que No Existe ${Date.now()}`)
    await page.getByRole('button', { name: 'Filtrar' }).click()

    await expect(page.locator('main table tbody tr')).toHaveCount(0)
  })

  test('un acreedor buscando un cliente con lotes de OTRO acreedor no lo ve', async ({ page }) => {
    const nombreArchivo = `e2e-scoping-${Date.now()}.pdf`
    const nombreCliente = `E2E Cliente Scoping ${Date.now()}`
    const cliente = await crearClienteDescartable(nombreCliente)
    // El lote es de acreedorSecundario, no de acreedorConDatos.
    await crearLoteYPagoDeCliente(
      `E2E Lote Scoping ${Date.now()}`,
      fixtures.acreedorSecundario.id,
      cliente.id,
      nombreArchivo
    )

    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto('/admin/pagos')
    await page.getByPlaceholder('Cliente, DNI o lote').fill(nombreCliente)
    await page.getByRole('button', { name: 'Filtrar' }).click()

    await expect(page.locator(`a[href*="${nombreArchivo}"]`)).toHaveCount(0)
  })
})
