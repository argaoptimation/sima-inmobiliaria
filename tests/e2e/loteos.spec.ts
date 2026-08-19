import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

test.describe('Loteos', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('crear un loteo nuevo lo agrega a la lista', async ({ page }) => {
    const nombreLoteo = `E2E Loteo ${Date.now()}`

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/loteos')
    await page.getByPlaceholder('Ej: Loteo San Martín').fill(nombreLoteo)
    await page.getByRole('button', { name: 'Crear loteo' }).click()
    await page.waitForURL('**/admin/loteos')

    await expect(page.locator('tbody').getByText(nombreLoteo)).toBeVisible()

    const admin = createAdminClient()
    await admin.from('loteos').delete().eq('nombre', nombreLoteo)
  })

  test('reasignar lotes en bloque, filtrando por ubicación, los mueve al loteo elegido', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const ubicacionUnica = `E2E Ubicacion ${Date.now()}`
    const nombreLoteoDestino = `E2E Loteo Destino ${Date.now()}`

    const { data: loteoDestino, error: errorLoteo } = await admin
      .from('loteos')
      .insert({ nombre: nombreLoteoDestino })
      .select('id')
      .single()
    if (errorLoteo || !loteoDestino) {
      throw new Error(`No se pudo crear el loteo de prueba: ${errorLoteo?.message}`)
    }

    const { data: lote1 } = await admin
      .from('lotes')
      .insert({
        identificador: `E2E Bloque 1 ${Date.now()}`,
        moneda: 'USD',
        estado: 'disponible',
        ubicacion: ubicacionUnica,
        acreedor_id: fixtures.acreedorConDatos.id,
      })
      .select('id')
      .single()
    const { data: lote2 } = await admin
      .from('lotes')
      .insert({
        identificador: `E2E Bloque 2 ${Date.now()}`,
        moneda: 'USD',
        estado: 'disponible',
        ubicacion: ubicacionUnica,
        acreedor_id: fixtures.acreedorConDatos.id,
      })
      .select('id')
      .single()

    if (!lote1 || !lote2) {
      throw new Error('No se pudieron crear los lotes de prueba')
    }

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/loteos?ubicacion=${encodeURIComponent(ubicacionUnica)}`)

    // Ojo: la página tiene DOS <tbody> (la tabla resumen de loteos y la
    // tabla de reasignación en bloque) -- "tbody tr" a secas cuenta filas
    // de ambas. Los checkboxes solo existen en la tabla de reasignación.
    const checkboxes = page.locator('input[name="loteIds"]')
    await expect(checkboxes).toHaveCount(2)

    await page.locator('input[name="loteIds"]').nth(0).check()
    await page.locator('input[name="loteIds"]').nth(1).check()
    await page.locator('select[name="loteoDestino"]').selectOption(loteoDestino.id)
    await page.getByRole('button', { name: 'Mover seleccionados' }).click()
    await page.waitForURL('**/admin/loteos*')

    await expect(page.getByText(/2 lote\(s\) reasignado\(s\) correctamente/)).toBeVisible()

    const { data: lotesActualizados } = await admin
      .from('lotes')
      .select('id, loteo_id')
      .in('id', [lote1.id, lote2.id])

    expect(lotesActualizados).toHaveLength(2)
    for (const lote of lotesActualizados!) {
      expect(lote.loteo_id).toBe(loteoDestino.id)
    }

    await admin.from('lotes').delete().in('id', [lote1.id, lote2.id])
    await admin.from('loteos').delete().eq('id', loteoDestino.id)
  })

  test('filtrar por "sin loteo asignado" muestra solo esos lotes', async ({ page }) => {
    const admin = createAdminClient()

    const { data: loteoParaOtro } = await admin
      .from('loteos')
      .insert({ nombre: `E2E Loteo Filtro ${Date.now()}` })
      .select('id')
      .single()

    const identificadorAsignado = `E2E Filtro Asignado ${Date.now()}`
    const { data: loteAsignado } = await admin
      .from('lotes')
      .insert({
        identificador: identificadorAsignado,
        moneda: 'USD',
        estado: 'disponible',
        acreedor_id: fixtures.acreedorConDatos.id,
        loteo_id: loteoParaOtro!.id,
      })
      .select('id')
      .single()

    const identificadorSinAsignar = `E2E Filtro Sin Asignar ${Date.now()}`
    const { data: loteSinAsignar } = await admin
      .from('lotes')
      .insert({
        identificador: identificadorSinAsignar,
        moneda: 'USD',
        estado: 'disponible',
        acreedor_id: fixtures.acreedorConDatos.id,
      })
      .select('id')
      .single()

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/loteos?loteoActual=__sin_asignar__')

    await expect(page.getByText(identificadorSinAsignar)).toBeVisible()
    await expect(page.getByText(identificadorAsignado)).not.toBeVisible()

    await admin.from('lotes').delete().in('id', [loteAsignado!.id, loteSinAsignar!.id])
    await admin.from('loteos').delete().eq('id', loteoParaOtro!.id)
  })

  test('reasignar sin seleccionar ningún lote corta con un mensaje claro', async ({ page }) => {
    const admin = createAdminClient()
    const { data: loteo } = await admin
      .from('loteos')
      .insert({ nombre: `E2E Loteo Vacio ${Date.now()}` })
      .select('id')
      .single()

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/loteos?q=ZZZ-no-deberia-matchear-nada')
    await page.locator('select[name="loteoDestino"]').selectOption(loteo!.id)
    await page.getByRole('button', { name: 'Mover seleccionados' }).click()

    await expect(page.getByText(/Seleccioná al menos un lote/)).toBeVisible()

    await admin.from('loteos').delete().eq('id', loteo!.id)
  })

  test('el identificador es único por loteo, no global: el mismo nombre en loteos distintos no choca', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const identificadorRepetido = `E2E Repetido ${Date.now()}`

    const { data: loteoA } = await admin
      .from('loteos')
      .insert({ nombre: `E2E Loteo A ${Date.now()}` })
      .select('id')
      .single()
    const { data: loteoB } = await admin
      .from('loteos')
      .insert({ nombre: `E2E Loteo B ${Date.now()}` })
      .select('id')
      .single()

    const { data: loteEnA, error: errorLoteEnA } = await admin
      .from('lotes')
      .insert({
        identificador: identificadorRepetido,
        moneda: 'USD',
        estado: 'disponible',
        acreedor_id: fixtures.acreedorConDatos.id,
        loteo_id: loteoA!.id,
      })
      .select('id')
      .single()
    expect(errorLoteEnA).toBeNull()

    // Mismo identificador, loteo DISTINTO -- no debería chocar.
    const { data: loteEnB, error: errorLoteEnB } = await admin
      .from('lotes')
      .insert({
        identificador: identificadorRepetido,
        moneda: 'USD',
        estado: 'disponible',
        acreedor_id: fixtures.acreedorConDatos.id,
        loteo_id: loteoB!.id,
      })
      .select('id')
      .single()
    expect(errorLoteEnB).toBeNull()
    expect(loteEnB).not.toBeNull()

    // Mismo identificador, MISMO loteo (A) -- esto sí tiene que chocar.
    const { error: errorDuplicadoMismoLoteo } = await admin.from('lotes').insert({
      identificador: identificadorRepetido,
      moneda: 'USD',
      estado: 'disponible',
      acreedor_id: fixtures.acreedorConDatos.id,
      loteo_id: loteoA!.id,
    })
    expect(errorDuplicadoMismoLoteo?.code).toBe('23505')

    // El formulario de creación de lote (/admin/lotes/nuevo) no permite
    // elegir loteo todavía, así que el lote que crea siempre queda con
    // loteo_id null. Para probar el mensaje amigable en la UI, el choque
    // tiene que darse contra otro lote sin loteo asignado.
    const { data: loteSinLoteo, error: errorLoteSinLoteo } = await admin
      .from('lotes')
      .insert({
        identificador: identificadorRepetido,
        moneda: 'USD',
        estado: 'disponible',
        acreedor_id: fixtures.acreedorConDatos.id,
        loteo_id: null,
      })
      .select('id')
      .single()
    expect(errorLoteSinLoteo).toBeNull()

    // El mensaje amigable se ve al crear un lote nuevo desde la UI con un
    // identificador repetido (el nuevo lote también queda sin loteo).
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes/nuevo')
    await page
      .getByPlaceholder('Identificador (ej: Loteo San Martín - Manzana 3 - Lote 12)')
      .fill(identificadorRepetido)
    await page.getByPlaceholder('Ubicación').fill('Ubicación de prueba')
    await page.getByPlaceholder('Precio total del lote').fill('1000')
    await page.getByLabel('Acreedor').selectOption(fixtures.acreedorConDatos.id)
    await page.getByRole('button', { name: 'Crear lote' }).click()

    await expect(page.getByText(/Ya existe un lote con ese identificador/)).toBeVisible()

    await admin.from('lotes').delete().in('id', [loteEnA!.id, loteEnB!.id, loteSinLoteo!.id])
    await admin.from('loteos').delete().in('id', [loteoA!.id, loteoB!.id])
  })
})
