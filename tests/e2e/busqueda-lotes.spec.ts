import { test, expect } from '@playwright/test'
import { createAdminClient, ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

test.describe('Búsqueda por identificador en /admin/lotes', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()

    // Limpieza de lotes que hayan quedado de corridas anteriores de ESTE
    // spec: a diferencia de `ensureTestFixtures`, los lotes que crean los
    // tests de abajo no se borran solos (cada uno usa un identificador con
    // timestamp para no chocar entre sí). Sin esto, cada re-ejecución deja
    // basura acumulada en la tabla `lotes`.
    const admin = createAdminClient()
    await admin.from('lotes').delete().ilike('identificador', 'E2E Busqueda%')
  })

  test('buscar por identificador filtra la lista', async ({ page }) => {
    const admin = createAdminClient()
    const identificadorUnico = `E2E Busqueda ${Date.now()}`
    const { error } = await admin.from('lotes').insert({
      identificador: identificadorUnico,
      moneda: 'USD',
      estado: 'disponible',
      ubicacion: 'Ubicación E2E',
      precio_total: 5000,
      acreedor_id: fixtures.acreedorConDatos.id,
    })
    if (error) throw new Error(`No se pudo crear el lote de prueba: ${error.message}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes')

    await page.getByPlaceholder('Buscar identificador').fill('E2E Busqueda')
    await page.getByRole('button', { name: 'Filtrar' }).click()

    await expect(page.getByRole('row', { name: identificadorUnico })).toBeVisible()
    // "E2E Test Lote" no matchea el texto buscado -- confirma que sí filtra,
    // no que muestra todo igual.
    await expect(page.getByRole('row', { name: 'E2E Test Lote' })).toHaveCount(0)
  })

  test('combinado con el filtro de Moneda ya existente', async ({ page }) => {
    const admin = createAdminClient()
    const identificadorUnico = `E2E Busqueda ARS ${Date.now()}`
    const { error } = await admin.from('lotes').insert({
      identificador: identificadorUnico,
      moneda: 'ARS',
      estado: 'disponible',
      ubicacion: 'Ubicación E2E',
      precio_total: 5000,
      acreedor_id: fixtures.acreedorConDatos.id,
    })
    if (error) throw new Error(`No se pudo crear el lote de prueba: ${error.message}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes')

    await page.getByPlaceholder('Buscar identificador').fill('E2E Busqueda ARS')
    await page.selectOption('select[name="moneda"]', 'USD')
    await page.getByRole('button', { name: 'Filtrar' }).click()

    // El lote es ARS, se buscó texto que matchea pero moneda USD -- no aparece.
    await expect(page.getByRole('row', { name: identificadorUnico })).toHaveCount(0)
  })
})
