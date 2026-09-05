import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

test.describe('Acreedor al crear/importar lotes', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('crear lote eligiendo un acreedor ya existente', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes/nuevo')

    const identificador = `E2E Lote Acreedor Existente ${Date.now()}`
    await page
      .locator('input[name="identificador"]')
      .fill(identificador)
    await page.locator('input[name="ubicacion"]').fill('Ubicación E2E')
    await page.locator('input[name="precioTotal"]').fill('10000')
    await page.locator('input[name="acreedorNombre"]').fill('E2E Acreedor Con Datos')
    await page.getByRole('button', { name: 'Crear lote' }).click()
    await page.waitForURL((url) => url.pathname === '/admin/lotes')

    const admin = createAdminClient()
    const { data: lote } = await admin
      .from('lotes')
      .select('acreedor_id')
      .eq('identificador', identificador)
      .single()
    expect(lote?.acreedor_id).toBe(fixtures.acreedorConDatos.id)
  })

  test('crear lote eligiendo "+ Crear nuevo acreedor": crea la cuenta y asocia el lote', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes/nuevo')

    const identificador = `E2E Lote Acreedor Nuevo ${Date.now()}`
    const emailNuevo = `acreedor.nuevo.${Date.now()}@sima-e2e.invalid`
    await page
      .locator('input[name="identificador"]')
      .fill(identificador)
    await page.locator('input[name="ubicacion"]').fill('Ubicación E2E')
    await page.locator('input[name="precioTotal"]').fill('10000')
    await page.locator('input[name="acreedorNombre"]').fill('+ Crear nuevo acreedor')
    await page
      .getByPlaceholder("Si elegiste 'Crear nuevo acreedor': nombre completo")
      .fill('Acreedor Nuevo E2E')
    await page.getByPlaceholder("Si elegiste 'Crear nuevo acreedor': email").fill(emailNuevo)
    await page.getByRole('button', { name: 'Crear lote' }).click()
    await page.waitForURL((url) => url.pathname === '/admin/lotes')

    const admin = createAdminClient()
    const { data: lote } = await admin
      .from('lotes')
      .select('acreedor_id')
      .eq('identificador', identificador)
      .single()
    expect(lote?.acreedor_id).toBeTruthy()

    const { data: acreedorCreado } = await admin
      .from('profiles')
      .select('role, full_name, email')
      .eq('id', lote!.acreedor_id)
      .single()
    expect(acreedorCreado?.role).toBe('acreedor')
    expect(acreedorCreado?.full_name).toBe('Acreedor Nuevo E2E')
    expect(acreedorCreado?.email).toBe(emailNuevo)
  })

  test('importar lotes con email de acreedor existente crea los lotes asociados', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    const identificador = `E2E Import Acreedor OK ${Date.now()}`
    const fila = [identificador, 'Ubicación E2E', '5000', 'USD', fixtures.acreedorConDatos.email].join(
      '\t'
    )

    await page.goto('/admin/lotes/importar')
    await page.locator('textarea[name="filas"]').fill(fila)
    await page.getByRole('button', { name: 'Importar' }).click()
    await page.waitForURL((url) => url.pathname === '/admin/lotes')

    const admin = createAdminClient()
    const { data: lote } = await admin
      .from('lotes')
      .select('acreedor_id')
      .eq('identificador', identificador)
      .single()
    expect(lote?.acreedor_id).toBe(fixtures.acreedorConDatos.id)
  })

  test('importar lotes con email de acreedor inexistente rechaza todo el lote', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    const identificadorValido = `E2E Import Acreedor Mixto Valido ${Date.now()}`
    const identificadorInvalido = `E2E Import Acreedor Mixto Invalido ${Date.now()}`
    const emailInexistente = `no-existe-${Date.now()}@sima-e2e.invalid`
    const filas = [
      [identificadorValido, 'Ubicación E2E', '5000', 'USD', fixtures.acreedorConDatos.email].join(
        '\t'
      ),
      [identificadorInvalido, 'Ubicación E2E', '5000', 'USD', emailInexistente].join('\t'),
    ].join('\n')

    await page.goto('/admin/lotes/importar')
    await page.locator('textarea[name="filas"]').fill(filas)
    await page.getByRole('button', { name: 'Importar' }).click()

    await expect(page.getByText(/no coinciden con ningún acreedor cargado/)).toBeVisible()

    const admin = createAdminClient()
    const { data: lotesCreados } = await admin
      .from('lotes')
      .select('id')
      .in('identificador', [identificadorValido, identificadorInvalido])
    expect(lotesCreados ?? []).toHaveLength(0)
  })
})
