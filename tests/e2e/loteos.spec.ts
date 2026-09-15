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
    await page.getByTestId('crear-loteo').locator('input[name="nombre"]').fill(nombreLoteo)
    await page.getByRole('button', { name: 'Crear nuevo loteo' }).click()
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

  test('el buscador de loteos filtra la lista por nombre sin acentos y no pisa los filtros de reasignar', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const marca = Date.now()
    const nombreNorte = `E2E Buscar Nórte ${marca}`
    const nombreSur = `E2E Buscar Sur ${marca}`
    const { data: loteosCreados } = await admin
      .from('loteos')
      .insert([{ nombre: nombreNorte }, { nombre: nombreSur }])
      .select('id')

    try {
      await login(page, fixtures.admin.email, fixtures.password)
      await page.goto('/admin/loteos?ubicacion=E2E-ubicacion-que-queda')

      // Sin acento y en minúsculas: tiene que encontrar "Nórte" igual.
      await page.locator('input[name="loteo"]').fill(`buscar norte ${marca}`)
      await expect(page).toHaveURL(/loteo=buscar/)

      const listado = page.locator('table').first()
      await expect(listado.getByText(nombreNorte)).toBeVisible()
      await expect(listado.getByText(nombreSur)).toHaveCount(0)
      await expect(listado.getByText('— sin loteo asignado —')).toHaveCount(0)
      await expect(page.getByTestId('cantidad-loteos-listados')).toContainText('1 de')

      // El filtro de ubicación de la tabla de reasignar sigue en la URL.
      expect(new URL(page.url()).searchParams.get('ubicacion')).toBe('E2E-ubicacion-que-queda')
      await expect(page.locator('input[name="ubicacion"]')).toHaveValue('E2E-ubicacion-que-queda')

      await page.locator('input[name="loteo"]').fill(`ningun loteo se llama asi ${marca}`)
      await expect(listado.getByText(/Ningún loteo tiene/)).toBeVisible()
    } finally {
      await admin.from('loteos').delete().in('id', (loteosCreados ?? []).map((loteo) => loteo.id))
    }
  })

  test('la casilla del encabezado marca y desmarca todos los lotes, y mover se lleva a todos', async ({ page }) => {
    const admin = createAdminClient()
    const marca = Date.now()
    const ubicacionUnica = `E2E Marcar Todos ${marca}`

    const { data: loteoDestino } = await admin
      .from('loteos')
      .insert({ nombre: `E2E Loteo Marcar Todos ${marca}` })
      .select('id')
      .single()
    const { data: lotes } = await admin
      .from('lotes')
      .insert(
        [1, 2, 3].map((numero) => ({
          identificador: `E2E Marcar Todos ${numero} ${marca}`,
          moneda: 'USD',
          estado: 'disponible',
          ubicacion: ubicacionUnica,
          acreedor_id: fixtures.acreedorConDatos.id,
        }))
      )
      .select('id')
    const loteIds = (lotes ?? []).map((lote) => lote.id)

    try {
      await login(page, fixtures.admin.email, fixtures.password)
      await page.goto(`/admin/loteos?ubicacion=${encodeURIComponent(ubicacionUnica)}`)

      const casillas = page.locator('input[name="loteIds"]')
      const marcarTodos = page.getByRole('checkbox', { name: 'Marcar todos los lotes de la tabla' })
      await expect(casillas).toHaveCount(3)

      await marcarTodos.check()
      for (let i = 0; i < 3; i++) await expect(casillas.nth(i)).toBeChecked()

      // Una fila desmarcada deja la casilla general a medias.
      await casillas.nth(1).uncheck()
      await expect(marcarTodos).not.toBeChecked()
      expect(await marcarTodos.evaluate((casilla) => (casilla as HTMLInputElement).indeterminate)).toBe(true)

      await marcarTodos.uncheck()
      await marcarTodos.check()
      for (let i = 0; i < 3; i++) await expect(casillas.nth(i)).toBeChecked()

      await page.locator('select[name="loteoDestino"]').selectOption(loteoDestino!.id)
      await page.getByRole('button', { name: 'Mover seleccionados' }).click()
      await expect(page.getByText(/3 lote\(s\) reasignado\(s\) correctamente/)).toBeVisible()

      const { data: movidos } = await admin.from('lotes').select('loteo_id').in('id', loteIds)
      expect((movidos ?? []).map((lote) => lote.loteo_id)).toEqual([loteoDestino!.id, loteoDestino!.id, loteoDestino!.id])
    } finally {
      await admin.from('lotes').delete().in('id', loteIds)
      await admin.from('loteos').delete().eq('id', loteoDestino!.id)
    }
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
    // El nombre del lote lo arma la app con la manzana y el numero (ver
    // lib/lotes/identificador-automatico.ts), asi que para provocar el choque
    // hay que repetir esos dos, no un texto libre.
    const manzanaRepetida = 'E2E'
    const numeroRepetido = `Repetido-${Date.now()}`
    const identificadorRepetido = `Mza ${manzanaRepetida} - Lote ${numeroRepetido}`

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
    await page.locator('input[name="manzana"]').fill(manzanaRepetida)
    await page.locator('input[name="numeroLote"]').fill(numeroRepetido)
    await page.locator('input[name="ubicacion"]').fill('Ubicación de prueba')
    await page.locator('input[name="precioTotal"]').fill('1000')
    await page.locator('input[name="acreedorNombre"]').fill('E2E Acreedor Con Datos')
    await page.getByRole('button', { name: 'Crear lote' }).click()

    await expect(page.getByText(/Ya hay un lote con esa manzana y ese número/)).toBeVisible()

    await admin.from('lotes').delete().in('id', [loteEnA!.id, loteEnB!.id, loteSinLoteo!.id])
    await admin.from('loteos').delete().in('id', [loteoA!.id, loteoB!.id])
  })

  test('desde el detalle del lote se le puede asignar el loteo', async ({ page }) => {
    const admin = createAdminClient()
    const nombreLoteo = `E2E Loteo Detalle ${Date.now()}`

    const { data: loteo, error: errorLoteo } = await admin
      .from('loteos')
      .insert({ nombre: nombreLoteo })
      .select('id')
      .single()
    if (errorLoteo || !loteo) {
      throw new Error(`No se pudo crear el loteo de prueba: ${errorLoteo?.message}`)
    }

    const { data: loteoPrevio } = await admin
      .from('lotes')
      .select('loteo_id')
      .eq('id', fixtures.loteId)
      .single()

    try {
      await login(page, fixtures.admin.email, fixtures.password)
      await page.goto(`/admin/lotes/${fixtures.loteId}`)

      // Hasta el 08/09 el loteo solo se elegía al crear el lote: un lote
      // cargado sin loteo no tenía plantilla de contrato y no había forma de
      // arreglarlo desde su propia ficha.
      // Por id y no por label: el option le agrega " — sin plantilla de
      // contrato" a los loteos que todavía no tienen una, y selectOption con
      // `label` exige el texto exacto.
      await page.selectOption('select[name="loteoId"]', loteo.id)
      await expect(page.locator('select[name="loteoId"] option:checked')).toContainText(nombreLoteo)
      await page.getByRole('button', { name: 'Guardar cambios' }).click()
      await expect(page.getByText('Datos del lote guardados.')).toBeVisible()

      const { data: lote } = await admin
        .from('lotes')
        .select('loteo_id')
        .eq('id', fixtures.loteId)
        .single()

      expect(lote?.loteo_id).toBe(loteo.id)
    } finally {
      await admin
        .from('lotes')
        .update({ loteo_id: loteoPrevio?.loteo_id ?? null })
        .eq('id', fixtures.loteId)
      await admin.from('loteos').delete().eq('id', loteo.id)
    }
  })
})
