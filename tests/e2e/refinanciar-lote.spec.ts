import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

// Spec de la feature "Refinanciar" (26/08) -- ver Notas_Decisiones_SIMA.txt
// puntos 73/80/94/95. Spec confirmada por Nicolás: se refinancia TODA la
// deuda de una vez (todas las cuotas con saldo pendiente -- vencidas
// impagas + futuras -- no una selección puntual), y se carga a mano en
// cuántas cuotas nuevas se reparte ese total, con el mismo mecanismo de
// cantidad + automático/manual que se usa al vender un lote. Las cuotas
// viejas quedan "Refinanció" (saldo 0). El lote sigue "vendido" -- no es un
// estado nuevo.

async function crearLoteVendidoConCuotas(
  identificador: string,
  clienteId: string,
  acreedorId: string
) {
  const admin = createAdminClient()

  const { data: lote, error: errorLote } = await admin
    .from('lotes')
    .insert({
      identificador,
      moneda: 'USD',
      estado: 'vendido',
      cliente_id: clienteId,
      acreedor_id: acreedorId,
      cantidad_cuotas: 3,
      monto_cuota_base: 1000,
    })
    .select('id')
    .single()

  if (errorLote || !lote) {
    throw new Error(`No se pudo crear el lote de prueba: ${errorLote?.message}`)
  }

  const { data: cuotas, error: errorCuotas } = await admin
    .from('cuotas')
    .insert([
      { lote_id: lote.id, numero: 1, monto_base: 1000, saldo_pendiente: 0, fecha_vencimiento: '2027-01-10' },
      { lote_id: lote.id, numero: 2, monto_base: 1000, saldo_pendiente: 1000, fecha_vencimiento: '2027-02-10' },
      { lote_id: lote.id, numero: 3, monto_base: 1000, saldo_pendiente: 1000, fecha_vencimiento: '2027-03-10' },
    ])
    .select('id, numero')

  if (errorCuotas || !cuotas) {
    throw new Error(`No se pudieron crear las cuotas de prueba: ${errorCuotas?.message}`)
  }

  return { loteId: lote.id as string, cuotas }
}

test.describe('Refinanciar cuotas (26/08)', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('modo automático: refinancia toda la deuda pendiente en la cantidad de cuotas elegida', async ({
    page,
  }) => {
    const identificador = `E2E Refinanciar Auto ${Date.now()}`
    const { loteId } = await crearLoteVendidoConCuotas(
      identificador,
      fixtures.cliente.id,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}`)

    await page.getByText('Refinanciar cuotas').click()

    const seccion = page.locator('details', { has: page.getByText('Refinanciar cuotas') })

    // Deuda total (cuotas 2 y 3, la 1 ya está saldada) mostrada de una,
    // sin que haya que elegir cuáles -- se refinancia todo junto.
    await expect(seccion).toContainText('las 2 cuota(s) con saldo pendiente')
    await expect(seccion).toContainText('cuotas 2, 3')
    await expect(seccion).toContainText('2000 USD')

    await seccion.locator('input[name="fechaPrimeraCuotaNueva"]').fill('2027-06-01')
    await seccion.locator('input[name="cantidadCuotasNuevas"]').fill('4')
    // Modo automático es el default -- no hace falta tocar el radio.
    await expect(seccion.getByText('4 cuotas de 500')).toBeVisible()
    await seccion.getByRole('button', { name: 'Refinanciar' }).click()

    await page.waitForURL(`**/admin/lotes/${loteId}?ok=*`)

    const admin = createAdminClient()
    await expect(async () => {
      const { data: cuotas } = await admin
        .from('cuotas')
        .select('numero, saldo_pendiente, refinanciada, monto_base')
        .eq('lote_id', loteId)
        .order('numero', { ascending: true })

      expect(cuotas).toHaveLength(7)
      expect(cuotas![0]).toMatchObject({ numero: 1, refinanciada: false, saldo_pendiente: 0 })
      expect(cuotas![1]).toMatchObject({ numero: 2, refinanciada: true, saldo_pendiente: 0 })
      expect(cuotas![2]).toMatchObject({ numero: 3, refinanciada: true, saldo_pendiente: 0 })
      for (let numero = 4; numero <= 7; numero++) {
        expect(cuotas![numero - 1]).toMatchObject({ numero, refinanciada: false, saldo_pendiente: 500, monto_base: 500 })
      }

      const { data: lote } = await admin.from('lotes').select('estado').eq('id', loteId).single()
      expect(lote?.estado).toBe('vendido')
    }).toPass({ timeout: 5000 })

    await page.reload()

    const tablaCuotas = page.locator('h2', { hasText: 'Cuotas' }).locator('xpath=following-sibling::table[1]')
    const filaCuota2 = tablaCuotas.locator('tbody tr').nth(1)
    await expect(filaCuota2.getByText('Refinanció')).toBeVisible()
    const filaCuota4 = tablaCuotas.locator('tbody tr').nth(3)
    await expect(filaCuota4).toContainText('500 USD')

    // La sección de refinanciar ya no incluye las cuotas viejas -- solo
    // quedarían las 4 nuevas si hiciera falta refinanciar de nuevo.
    await page.getByText('Refinanciar cuotas').click()
    await expect(seccion).toContainText('las 4 cuota(s) con saldo pendiente')
    await expect(seccion).toContainText('cuotas 4, 5, 6, 7')

    // Historial del lote (vida del lote).
    await page.getByText(/Historial de estados del lote/).click()
    const historialLote = page.locator('details', { hasText: 'Historial de estados del lote' })
    const filaRefinanciado = historialLote.locator('li', { hasText: 'Refinanció' })
    await expect(filaRefinanciado).toContainText('E2E Admin')
    await expect(filaRefinanciado).toContainText('Deuda de 2000 USD (2 cuota(s)) → 4 cuota(s) nueva(s)')

    // Historial global.
    await page.goto('/admin/historial-lotes')
    const filaGlobal = page.locator('tbody tr', { hasText: identificador })
    await expect(async () => {
      await page.reload()
      await expect(filaGlobal).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 10000 })
    await expect(filaGlobal.getByText('Refinanció')).toBeVisible()

    await page.getByLabel('Movimiento').selectOption('refinanciado')
    await page.getByRole('button', { name: 'Filtrar' }).click()
    await expect(page.locator('tbody tr', { hasText: identificador })).toBeVisible()
  })

  test('modo manual: cada cuota nueva se carga con un monto propio', async ({ page }) => {
    const { loteId } = await crearLoteVendidoConCuotas(
      `E2E Refinanciar Manual ${Date.now()}`,
      fixtures.cliente.id,
      fixtures.acreedorConDatos.id
    )
    const admin = createAdminClient()

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}`)
    await page.getByText('Refinanciar cuotas').click()

    const seccion = page.locator('details', { has: page.getByText('Refinanciar cuotas') })
    await seccion.locator('input[name="fechaPrimeraCuotaNueva"]').fill('2027-06-01')
    await seccion.locator('input[name="cantidadCuotasNuevas"]').fill('2')
    await seccion.getByText('Manual').click()
    await seccion.getByPlaceholder('Cuota 1').fill('1200')
    await seccion.getByPlaceholder('Cuota 2').fill('800')
    await expect(seccion).toContainText('Suma total de las cuotas cargadas: 2000')
    await seccion.getByRole('button', { name: 'Refinanciar' }).click()
    await page.waitForURL(`**/admin/lotes/${loteId}?ok=*`)

    await expect(async () => {
      const { data: cuotas } = await admin
        .from('cuotas')
        .select('numero, monto_base, saldo_pendiente')
        .eq('lote_id', loteId)
        .order('numero', { ascending: true })

      expect(cuotas).toHaveLength(5)
      expect(cuotas![3]).toMatchObject({ numero: 4, monto_base: 1200, saldo_pendiente: 1200 })
      expect(cuotas![4]).toMatchObject({ numero: 5, monto_base: 800, saldo_pendiente: 800 })
    }).toPass({ timeout: 5000 })
  })

  test('el cliente ve "Refinanció" en su cuota vieja y puede pagar la cuota nueva', async ({ page }) => {
    const { loteId } = await crearLoteVendidoConCuotas(
      `E2E Refinanciar Cliente ${Date.now()}`,
      fixtures.cliente.id,
      fixtures.acreedorConDatos.id
    )

    const admin = createAdminClient()

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}`)
    await page.getByText('Refinanciar cuotas').click()

    const seccion = page.locator('details', { has: page.getByText('Refinanciar cuotas') })
    await seccion.locator('input[name="fechaPrimeraCuotaNueva"]').fill('2027-06-01')
    await seccion.locator('input[name="cantidadCuotasNuevas"]').fill('1')
    await seccion.getByRole('button', { name: 'Refinanciar' }).click()
    await page.waitForURL(`**/admin/lotes/${loteId}?ok=*`)

    await expect(async () => {
      const { data: cuotas } = await admin.from('cuotas').select('id, numero').eq('lote_id', loteId)
      expect(cuotas).toHaveLength(4)
    }).toPass({ timeout: 5000 })

    await login(page, fixtures.cliente.email, fixtures.password)
    await page.goto(`/portal-cliente/lotes/${loteId}`)

    const filas = page.locator('tbody tr')
    await expect(filas.filter({ hasText: 'Refinanció' })).toHaveCount(2)
    await expect(page.getByRole('link', { name: 'Pagar cuota' })).toHaveCount(1)
  })

  test('un vendedor/acreedor no ve la sección "Refinanciar cuotas"', async ({ page }) => {
    const { loteId } = await crearLoteVendidoConCuotas(
      `E2E Refinanciar Acreedor ${Date.now()}`,
      fixtures.cliente.id,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}`)
    await expect(page.getByText('Refinanciar cuotas')).toHaveCount(0)
  })

  test('no se puede refinanciar un lote que no está vendido (gate server-side)', async ({ page }) => {
    const admin = createAdminClient()
    const { data: lote, error } = await admin
      .from('lotes')
      .insert({
        identificador: `E2E Refinanciar Disponible ${Date.now()}`,
        moneda: 'USD',
        estado: 'disponible',
        acreedor_id: fixtures.acreedorConDatos.id,
      })
      .select('id')
      .single()
    if (error || !lote) throw new Error(`No se pudo crear el lote: ${error?.message}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${lote.id}`)
    await expect(page.getByText('Refinanciar cuotas')).toHaveCount(0)
  })

  test('un lote recién creado ya aparece en el historial ("Lote creado")', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)

    const identificador = `E2E Historial Creado ${Date.now()}`
    await page.goto('/admin/lotes/nuevo')
    await page.getByPlaceholder(/^Identificador/).fill(identificador)
    await page.getByPlaceholder('Ubicación').fill('Ubicación E2E')
    await page.getByPlaceholder('Precio total del lote').fill('1000')
    await page.selectOption('select[name="moneda"]', 'USD')
    await page.selectOption('select[name="acreedorId"]', fixtures.acreedorConDatos.id)
    await page.getByRole('button', { name: 'Crear lote' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: loteCreado } = await admin
      .from('lotes')
      .select('id')
      .eq('identificador', identificador)
      .single()

    await page.goto(`/admin/lotes/${loteCreado!.id}`)
    await page.getByText(/Historial de estados del lote/).click()
    await expect(page.getByText(/Lote creado/)).toBeVisible()

    await page.goto('/admin/historial-lotes')
    await page.getByLabel('Movimiento').selectOption('creado')
    await page.getByRole('button', { name: 'Filtrar' }).click()
    await expect(page.locator('tbody tr', { hasText: identificador })).toBeVisible()
  })
})
