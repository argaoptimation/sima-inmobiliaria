import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

// Paginación de Pagos (10/09). Es el listado que más crece y no tiene
// techo: unas 200 filas por mes, para siempre. Se pagina de a 30.
//
// Lo que cuidan estos tests no es que aparezcan los botones: es que el
// TOTAL sea el de verdad y no el de la página, y que al pasar de página no
// se pierdan los filtros. Un paginador que se come el filtro le muestra a
// Nicolás pagos de otro lote creyendo que son del que estaba mirando.
test.describe('Paginación de Pagos', () => {
  let fixtures: TestFixtures
  const pagosCreados: string[] = []

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()

    const admin = createAdminClient()
    // 50 pagos confirmados sobre el lote de prueba: más de una página de 30
    // y menos de dos, para que la última quede incompleta a propósito.
    const filas = Array.from({ length: 50 }, (_, i) => ({
      cliente_id: fixtures.cliente.id,
      lote_id: fixtures.loteId,
      monto: 100 + i,
      moneda: 'USD',
      estado: 'confirmado' as const,
      motivo: 'cuota' as const,
      medio_pago: 'transferencia' as const,
      confirmado_admin_por: fixtures.admin.id,
      confirmado_admin_at: new Date().toISOString(),
    }))

    const { data, error } = await admin.from('pagos').insert(filas).select('id')
    if (error) throw new Error(`No se pudieron crear los pagos de prueba: ${error.message}`)
    pagosCreados.push(...data!.map((p) => p.id))
  })

  test.afterAll(async () => {
    if (pagosCreados.length) {
      await createAdminClient().from('pagos').delete().in('id', pagosCreados)
    }
  })

  test('el total es el de la consulta entera, no el de la página, y pasar de página conserva el filtro', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    // Filtrado al lote de prueba para que el conteo sea el de estos 50 y no
    // el de todo lo que haya quedado en la base.
    await page.goto('/admin/pagos?q=E2E+Test+Lote&estado=confirmado')

    await expect(page.getByText(/Mostrando\s*1-30\s*de\s*50\s*pagos/)).toBeVisible()
    await expect(page.getByText('Página 1 de 2')).toBeVisible()
    // Y hay 30 tarjetas en pantalla, no 50: si el pie dijera "1-30" pero la
    // consulta siguiera trayendo todo, el paginador sería un cartel
    // decorativo y la pantalla no habría mejorado en nada.
    await expect(page.getByTestId('tarjeta-pago')).toHaveCount(30)

    await page.getByRole('link', { name: 'Siguiente' }).click()

    await expect(page.getByText(/Mostrando\s*31-50\s*de\s*50\s*pagos/)).toBeVisible()
    await expect(page.getByTestId('tarjeta-pago')).toHaveCount(20)
    await expect(page).toHaveURL(/pagina=2/)
    // El filtro tiene que seguir puesto: sin esto, la página 2 mostraría
    // pagos de cualquier lote.
    await expect(page).toHaveURL(/q=E2E\+Test\+Lote|q=E2E%2BTest%2BLote|q=E2E\+Test\+Lote/)
    await expect(page).toHaveURL(/estado=confirmado/)
  })

  test('con una sola página no se dibuja el paginador: no ofrece ninguna acción', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos?q=E2E+Test+Lote&estado=pendiente')

    await expect(page.getByText(/Página \d+ de \d+/)).toHaveCount(0)
  })

  test('el contador de "Pendientes" no depende de la pestaña abierta ni de la página', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('pagos')
      .insert(
        Array.from({ length: 3 }, (_, i) => ({
          cliente_id: fixtures.cliente.id,
          lote_id: fixtures.loteId,
          monto: 900 + i,
          moneda: 'USD',
          estado: 'pendiente' as const,
          motivo: 'cuota' as const,
          medio_pago: 'transferencia' as const,
          comprobante_path: 'comprobantes/e2e-paginacion.png',
        }))
      )
      .select('id')
    if (error) throw new Error(`No se pudieron crear los pendientes: ${error.message}`)
    pagosCreados.push(...data!.map((p) => p.id))

    await login(page, fixtures.admin.email, fixtures.password)

    // Parado en "Confirmados" -- donde antes el contador de pendientes decía
    // 0, porque salía de las filas que estaban en pantalla.
    await page.goto('/admin/pagos?q=E2E+Test+Lote&estado=confirmado')

    await expect(page.getByText('Pendientes', { exact: false }).first()).toBeVisible()
    await expect(page.locator('label', { hasText: 'Pendientes' })).toContainText('(3)')
  })
})
