import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

// Paginación de Lotes (10/09). Es la más delicada de las tres porque esta
// pantalla tenía DOS filtros (cliente y estado de cobranza) que se
// calculaban en memoria después de traer todos los lotes. Un filtro que se
// aplica DESPUÉS de cortar la página deja una página con 4 filas y la
// siguiente con 30, y los contadores de las pestañas mintiendo.
//
// Lo que cuidan estos tests:
//   1. Que la página traiga 30 filas y no todas.
//   2. Que los contadores de las pestañas cuenten sobre TODO lo filtrado y
//      no sobre la página que se está viendo.
//   3. Que pasar de página no se coma el filtro.
//   4. Que el filtro de cobranza -- el que se resuelve en dos pasos --
//      siga dando lo mismo que antes.
test.describe('Paginación de Lotes', () => {
  let fixtures: TestFixtures
  const lotesCreados: string[] = []
  const MARCA = 'E2E Paginacion'

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()

    const admin = createAdminClient()
    // 35 lotes disponibles: más de una página de 30 y menos de dos, para que
    // la última quede incompleta a propósito.
    const filas = Array.from({ length: 35 }, (_, i) => ({
      identificador: `${MARCA} ${String(i + 1).padStart(3, '0')}`,
      manzana: 'PAG',
      numero_lote: String(i + 1).padStart(3, '0'),
      ubicacion: MARCA,
      moneda: 'USD',
      estado: 'disponible' as const,
      precio_total: 1000 + i,
    }))

    const { data, error } = await admin.from('lotes').insert(filas).select('id')
    if (error) throw new Error(`No se pudieron crear los lotes de prueba: ${error.message}`)
    lotesCreados.push(...data!.map((lote) => lote.id))
  })

  test.afterAll(async () => {
    if (lotesCreados.length) {
      await createAdminClient().from('lotes').delete().in('id', lotesCreados)
    }
  })

  test('trae 30 filas por página, el total es el de la consulta entera y el filtro viaja a la página 2', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes?q=${encodeURIComponent(MARCA)}`)

    await expect(page.getByText(/Mostrando\s*1-30\s*de\s*35\s*lotes/)).toBeVisible()
    await expect(page.getByText('Página 1 de 2')).toBeVisible()

    // Una fila por lote más la del encabezado.
    await expect(page.locator('table').last().locator('tbody tr')).toHaveCount(30)

    await page.getByRole('link', { name: 'Siguiente' }).click()

    await expect(page.getByText(/Mostrando\s*31-35\s*de\s*35\s*lotes/)).toBeVisible()
    await expect(page.locator('table').last().locator('tbody tr')).toHaveCount(5)
    await expect(page).toHaveURL(/pagina=2/)
    // Sin esto, la página 2 mostraría lotes de toda la cartera creyendo que
    // son los del filtro.
    await expect(page).toHaveURL(/q=E2E(\+|%20)Paginacion/)
  })

  test('los contadores de las pestañas cuentan todo lo filtrado, no la página', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes?q=${encodeURIComponent(MARCA)}`)

    // Los 35 son disponibles. Si el contador saliera de las filas en
    // pantalla diría 30, que es el bug que este test existe para evitar.
    await expect(page.getByRole('link', { name: 'Todos (35)' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Disponibles (35)' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Vendidos (0)' })).toBeVisible()
  })

  test('el filtro de cobranza sigue funcionando ahora que se resuelve en dos pasos', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    // Ninguno de los lotes de esta tanda está vendido, así que filtrar por
    // cualquier estado de cobranza tiene que dejar la lista vacía -- y decirlo,
    // en vez de mostrar los 35 como si el filtro no existiera.
    await page.goto(`/admin/lotes?q=${encodeURIComponent(MARCA)}&cobranza=al_dia`)

    await expect(page.getByText('Ningún lote coincide con los filtros.')).toBeVisible()
    await expect(page.getByText(/Mostrando\s*1-30/)).toHaveCount(0)
  })

  test('con una sola página no se dibuja el paginador', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes?q=${encodeURIComponent(MARCA)}&estado=vendido`)

    await expect(page.getByText(/Página \d+ de \d+/)).toHaveCount(0)
  })
})
