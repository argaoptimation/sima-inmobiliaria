import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

// `cotizaciones_dolar` es una tabla compartida con datos REALES cargados a
// mano por Gabriel (una fila por fecha, `fecha` es la clave) -- no es
// exclusiva de test. Un `delete().eq('fecha', X)` o un `upsert` sin
// snapshotear/restaurar lo que ya había en esa fecha puede pisar o borrar
// un valor real cargado antes de correr la suite (pasó de verdad: una
// corrida se llevó puesta la cotización de un día real). Por eso cada test
// que toca una fecha puntual guarda lo que había ANTES de tocarla y lo
// restaura al final, en vez de asumir que esa fecha es "solo de test".
async function snapshotCotizacion(admin: ReturnType<typeof createAdminClient>, fecha: string) {
  const { data } = await admin.from('cotizaciones_dolar').select('*').eq('fecha', fecha).maybeSingle()
  return data
}

async function restaurarCotizacion(
  admin: ReturnType<typeof createAdminClient>,
  fecha: string,
  original: Record<string, unknown> | null
) {
  if (original) {
    await admin.from('cotizaciones_dolar').upsert(original, { onConflict: 'fecha' })
  } else {
    await admin.from('cotizaciones_dolar').delete().eq('fecha', fecha)
  }
}

test.describe('Cotización del dólar', () => {
  let fixtures: TestFixtures
  let cotizacionHoyOriginal: Record<string, unknown> | null = null

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test.beforeEach(async () => {
    const admin = createAdminClient()
    const hoy = new Date().toISOString().slice(0, 10)
    // Guarda lo que había (si algo real) y arranca cada test desde "todavía
    // no cargaste la cotización de hoy" -- varios tests dependen de ese
    // estado vacío para poder probar el botón "Cargar". Se restaura en
    // afterEach, nunca queda perdido.
    cotizacionHoyOriginal = await snapshotCotizacion(admin, hoy)
    await admin.from('cotizaciones_dolar').delete().eq('fecha', hoy)
  })

  test.afterEach(async () => {
    const admin = createAdminClient()
    const hoy = new Date().toISOString().slice(0, 10)
    await restaurarCotizacion(admin, hoy, cotizacionHoyOriginal)
  })

  test('cargar la cotización de hoy muestra la leyenda de "ya cargada"', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes')

    await expect(page.getByText(/Todavía no cargaste la cotización/)).toBeVisible()

    await page.getByPlaceholder('Ej: 1500').fill('1500.50')
    await page.getByRole('button', { name: 'Cargar' }).click()
    await page.waitForURL('**/admin/lotes')

    await expect(page.getByText(/Cotización de hoy .* ya cargada: 1500\.5/)).toBeVisible()
  })

  test('cargarla dos veces el mismo día corrige el valor anterior (upsert, no error) y no duplica la fila', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes')

    await page.getByPlaceholder('Ej: 1500').fill('1500')
    await page.getByRole('button', { name: 'Cargar' }).click()
    await page.waitForURL('**/admin/lotes')
    await expect(page.getByText(/ya cargada: 1500\b/)).toBeVisible()

    // Segunda carga del mismo día: el botón ahora dice "Corregir" y el
    // input viene precargado con el valor ya guardado.
    await expect(page.getByPlaceholder('Ej: 1500')).toHaveValue('1500')
    await page.getByPlaceholder('Ej: 1500').fill('1600')
    await page.getByRole('button', { name: 'Corregir' }).click()
    await page.waitForURL('**/admin/lotes')
    await expect(page.getByText(/ya cargada: 1600\b/)).toBeVisible()

    const admin = createAdminClient()
    const hoy = new Date().toISOString().slice(0, 10)
    const { data: cotizaciones } = await admin.from('cotizaciones_dolar').select('id, valor').eq('fecha', hoy)
    expect(cotizaciones).toHaveLength(1)
    expect(cotizaciones![0].valor).toBe(1600)
  })

  test('en la pantalla de pago de una cuota en USD se muestra el equivalente en pesos', async ({ page }) => {
    const admin = createAdminClient()

    const hoy = new Date().toISOString().slice(0, 10)
    await admin.from('cotizaciones_dolar').upsert(
      { fecha: hoy, valor: 1000, cargado_por: fixtures.admin.id },
      { onConflict: 'fecha' }
    )

    const { data: lote, error: errorLote } = await admin
      .from('lotes')
      .insert({
        identificador: `E2E Pagar Dolar ${Date.now()}`,
        moneda: 'USD',
        estado: 'vendido',
        precio_total: 1000,
        acreedor_id: fixtures.acreedorConDatos.id,
        cliente_id: fixtures.cliente.id,
      })
      .select('id')
      .single()

    if (errorLote || !lote) {
      throw new Error(`No se pudo crear el lote de prueba: ${errorLote?.message}`)
    }

    const { data: cuota, error: errorCuota } = await admin
      .from('cuotas')
      .insert({
        lote_id: lote.id,
        numero: 1,
        monto_base: 100,
        saldo_pendiente: 100,
        fecha_vencimiento: '2027-01-01',
      })
      .select('id')
      .single()

    if (errorCuota || !cuota) {
      throw new Error(`No se pudo crear la cuota de prueba: ${errorCuota?.message}`)
    }

    await login(page, fixtures.cliente.email, fixtures.password)
    await page.goto(`/portal-cliente/pagar/${cuota.id}`)

    await expect(page.getByText(/Equivalente en pesos: 100000 ARS/)).toBeVisible()

    await admin.from('cuotas').delete().eq('id', cuota.id)
    await admin.from('lotes').delete().eq('id', lote.id)
  })

  test('el historial muestra el valor cargado hoy y los de días anteriores', async ({ page }) => {
    const admin = createAdminClient()
    const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const cotizacionAyerOriginal = await snapshotCotizacion(admin, ayer)

    try {
      await admin.from('cotizaciones_dolar').upsert(
        { fecha: ayer, valor: 1450, cargado_por: fixtures.admin.id },
        { onConflict: 'fecha' }
      )

      await login(page, fixtures.admin.email, fixtures.password)
      await page.goto('/admin/lotes')
      await page.getByPlaceholder('Ej: 1500').fill('1500')
      await page.getByRole('button', { name: 'Cargar' }).click()
      await page.waitForURL('**/admin/lotes')

      await page.getByRole('link', { name: 'Ver historial completo →' }).click()
      await page.waitForURL('**/admin/cotizacion-dolar')

      const filaHoy = page.locator('tbody tr').filter({ hasText: '1500' })
      const filaAyer = page.locator('tbody tr').filter({ hasText: ayer })
      await expect(filaHoy).toBeVisible()
      await expect(filaAyer).toBeVisible()
      await expect(filaAyer).toContainText('1450')
    } finally {
      await restaurarCotizacion(admin, ayer, cotizacionAyerOriginal)
    }
  })
})
