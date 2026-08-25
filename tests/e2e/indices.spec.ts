import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

async function crearLoteVendidoConIndice(
  identificador: string,
  indiceTipo: string | null,
  clienteId: string,
  acreedorId: string,
  fechaVencimientoCuota: string,
  saldoPendienteCuota: number
) {
  const admin = createAdminClient()
  const { data: lote, error: errorLote } = await admin
    .from('lotes')
    .insert({
      identificador,
      moneda: 'ARS',
      estado: 'vendido',
      precio_total: 100000,
      acreedor_id: acreedorId,
      cliente_id: clienteId,
      indice_tipo: indiceTipo,
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
      monto_base: saldoPendienteCuota,
      saldo_pendiente: saldoPendienteCuota,
      fecha_vencimiento: fechaVencimientoCuota,
    })
    .select('id')
    .single()

  if (errorCuota || !cuota) {
    throw new Error(`No se pudo crear la cuota de prueba: ${errorCuota?.message}`)
  }

  return { loteId: lote.id as string, cuotaId: cuota.id as string }
}

// Crea un lote en pesos con VARIAS cuotas mensuales consecutivas, todas en
// $100.000 de base, para poder probar el encadenado entre cuotas (a
// diferencia de crearLoteVendidoConIndice, que solo crea una).
async function crearLoteVendidoConVariasCuotas(
  identificador: string,
  indiceTipo: string | null,
  clienteId: string,
  acreedorId: string,
  vencimientos: string[]
) {
  const admin = createAdminClient()
  const { data: lote, error: errorLote } = await admin
    .from('lotes')
    .insert({
      identificador,
      moneda: 'ARS',
      estado: 'vendido',
      precio_total: 100000 * vencimientos.length,
      acreedor_id: acreedorId,
      cliente_id: clienteId,
      indice_tipo: indiceTipo,
    })
    .select('id')
    .single()

  if (errorLote || !lote) {
    throw new Error(`No se pudo crear el lote de prueba: ${errorLote?.message}`)
  }

  const { data: cuotas, error: errorCuotas } = await admin
    .from('cuotas')
    .insert(
      vencimientos.map((fecha_vencimiento, i) => ({
        lote_id: lote.id,
        numero: i + 1,
        monto_base: 100000,
        saldo_pendiente: 100000,
        fecha_vencimiento,
      }))
    )
    .select('id, fecha_vencimiento')
    .order('fecha_vencimiento', { ascending: true })

  if (errorCuotas || !cuotas) {
    throw new Error(`No se pudo crear las cuotas de prueba: ${errorCuotas?.message}`)
  }

  return { loteId: lote.id as string, cuotaIds: cuotas.map((c) => c.id as string) }
}

async function leerCuotas(loteId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('cuotas')
    .select('id, numero, monto_ajustado, saldo_pendiente, fecha_vencimiento')
    .eq('lote_id', loteId)
    .order('fecha_vencimiento', { ascending: true })
  return data ?? []
}

async function cargarIndice(page: import('@playwright/test').Page, nombre: string, mes: string, valor: string) {
  await page.goto('/admin/indices')
  await page.getByPlaceholder('Ej: IPC').fill(nombre)
  await page.getByRole('textbox', { name: 'Mes' }).fill(mes)
  await page.getByPlaceholder('Ej: 3').fill(valor)
  await page.getByRole('button', { name: 'Cargar' }).click()
  await page.waitForURL('**/admin/indices')
}

test.describe('Índices — carga manual y aplicación automática a mes vencido', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  // indices_valores no cuelga de ningún lote (es una tabla global), así que
  // la limpieza de ensureTestFixtures() no la toca -- sin esto, cada corrida
  // deja basura acumulándose en /admin/indices para siempre.
  test.afterEach(async () => {
    const admin = createAdminClient()
    await admin.from('indices_valores').delete().ilike('nombre', '%E2E%')
  })

  test('cargar un valor de índice ajusta automáticamente la cuota del mes siguiente del lote atado a ese índice', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const nombreIndice = `IPC-E2E-${Date.now()}`

    const { loteId, cuotaId } = await crearLoteVendidoConIndice(
      `E2E Indice ${Date.now()}`,
      nombreIndice,
      fixtures.cliente.id,
      fixtures.acreedorConDatos.id,
      '2027-02-15',
      100000
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/indices')
    await page.getByPlaceholder('Ej: IPC').fill(nombreIndice)
    await page.getByRole('textbox', { name: 'Mes' }).fill('2027-01')
    await page.getByPlaceholder('Ej: 3').fill('3')
    await page.getByRole('button', { name: 'Cargar' }).click()
    await page.waitForURL('**/admin/indices')

    const filaDetalle = page.locator('h2:has-text("Detalle completo") ~ table tbody tr', {
      hasText: nombreIndice,
    })
    await expect(filaDetalle).toBeVisible()

    await expect
      .poll(async () => {
        const { data } = await admin.from('cuotas').select('saldo_pendiente').eq('id', cuotaId).single()
        return data?.saldo_pendiente ?? null
      })
      .toBe(103000)

    const { data: ajuste } = await admin
      .from('ajustes_indexacion')
      .select('porcentaje, fecha_desde')
      .eq('lote_id', loteId)
      .single()
    expect(ajuste?.porcentaje).toBe(3)
    expect(ajuste?.fecha_desde).toBe('2027-02-01')
  })

  test('un lote sin ese índice configurado no se ve afectado', async ({ page }) => {
    const admin = createAdminClient()
    const nombreIndice = `ICC-E2E-${Date.now()}`

    const { cuotaId } = await crearLoteVendidoConIndice(
      `E2E Sin Indice ${Date.now()}`,
      null,
      fixtures.cliente.id,
      fixtures.acreedorConDatos.id,
      '2027-02-15',
      100000
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/indices')
    await page.getByPlaceholder('Ej: IPC').fill(nombreIndice)
    await page.getByRole('textbox', { name: 'Mes' }).fill('2027-01')
    await page.getByPlaceholder('Ej: 3').fill('5')
    await page.getByRole('button', { name: 'Cargar' }).click()
    await page.waitForURL('**/admin/indices')

    const { data: cuota } = await admin.from('cuotas').select('saldo_pendiente').eq('id', cuotaId).single()
    expect(cuota?.saldo_pendiente).toBe(100000)
  })

  test('cargar dos veces el mismo índice y mes es rechazado con un mensaje claro', async ({ page }) => {
    const nombreIndice = `IPC-E2E-Dup-${Date.now()}`

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/indices')
    await page.getByPlaceholder('Ej: IPC').fill(nombreIndice)
    await page.getByRole('textbox', { name: 'Mes' }).fill('2027-03')
    await page.getByPlaceholder('Ej: 3').fill('2')
    await page.getByRole('button', { name: 'Cargar' }).click()
    await page.waitForURL('**/admin/indices')

    await page.getByPlaceholder('Ej: IPC').fill(nombreIndice)
    await page.getByRole('textbox', { name: 'Mes' }).fill('2027-03')
    await page.getByPlaceholder('Ej: 3').fill('4')
    await page.getByRole('button', { name: 'Cargar' }).click()

    await expect(page.getByText(/Ya se cargó un valor de/)).toBeVisible()
  })

  test('corregir el valor más reciente reajusta la cuota (revierte el % viejo y aplica el nuevo)', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const nombreIndice = `IPC-E2E-Corregir-${Date.now()}`

    const { cuotaId } = await crearLoteVendidoConIndice(
      `E2E Indice Corregir ${Date.now()}`,
      nombreIndice,
      fixtures.cliente.id,
      fixtures.acreedorConDatos.id,
      '2027-02-15',
      100000
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/indices')
    await page.getByPlaceholder('Ej: IPC').fill(nombreIndice)
    await page.getByRole('textbox', { name: 'Mes' }).fill('2027-01')
    await page.getByPlaceholder('Ej: 3').fill('5')
    await page.getByRole('button', { name: 'Cargar' }).click()
    await page.waitForURL('**/admin/indices')

    await expect
      .poll(async () => {
        const { data } = await admin.from('cuotas').select('saldo_pendiente').eq('id', cuotaId).single()
        return data?.saldo_pendiente ?? null
      })
      .toBe(105000) // 100000 * 1.05

    const filaCorregir = page.locator('tbody tr', { hasText: nombreIndice })
    await filaCorregir.locator('input[name="valorNuevo"]').fill('3')
    page.once('dialog', (dialog) => dialog.accept())
    await filaCorregir.getByRole('button', { name: 'Corregir' }).click()
    await page.waitForURL('**/admin/indices**')
    await expect(page.getByText('Índice corregido')).toBeVisible()

    await expect
      .poll(async () => {
        const { data } = await admin.from('cuotas').select('saldo_pendiente').eq('id', cuotaId).single()
        return data?.saldo_pendiente ?? null
      })
      .toBe(103000) // revierte el 5%, aplica 3% -- no 105000-2%

    const { data: valorActualizado } = await admin
      .from('indices_valores')
      .select('valor')
      .eq('nombre', nombreIndice)
      .eq('periodo', '2027-01-01')
      .single()
    expect(valorActualizado?.valor).toBe(3)
  })

  test('el gate server-side de "solo el mes más reciente" rechaza una corrección si otro mes se cargó entremedio', async ({
    page,
  }) => {
    const nombreIndice = `IPC-E2E-NoReciente-${Date.now()}`

    const admin = createAdminClient()
    await admin
      .from('indices_valores')
      .insert({ nombre: nombreIndice, periodo: '2027-01-01', valor: 5, cargado_por: fixtures.admin.id })

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/indices')

    // La pantalla carga con enero como "el más reciente" -- entre este
    // momento y el submit, se cuela un mes más nuevo por fuera del
    // browser (mismo patrón de carrera que ya usa editar-monto-pago.spec.ts).
    const filaReciente = page.locator('tbody tr', { hasText: nombreIndice })
    await expect(filaReciente.locator('input[name="valorNuevo"]')).toHaveValue('5')

    await admin
      .from('indices_valores')
      .insert({ nombre: nombreIndice, periodo: '2027-02-01', valor: 4, cargado_por: fixtures.admin.id })

    await filaReciente.locator('input[name="valorNuevo"]').fill('1')
    page.once('dialog', (dialog) => dialog.accept())
    await filaReciente.getByRole('button', { name: 'Corregir' }).click()

    await expect(page.getByText('Solo se puede corregir el mes más reciente cargado de este índice')).toBeVisible()

    const { data: valores } = await admin
      .from('indices_valores')
      .select('periodo, valor')
      .eq('nombre', nombreIndice)
      .order('periodo')
    expect(valores).toEqual([
      { periodo: '2027-01-01', valor: 5 },
      { periodo: '2027-02-01', valor: 4 },
    ])
  })

  test('aviso de mes de índice faltante: una cuota de enero pendiente pide el índice de diciembre del año anterior', async ({
    page,
  }) => {
    const nombreIndice = `IPC-E2E-Faltante-${Date.now()}`

    await crearLoteVendidoConIndice(
      `E2E Indice Faltante ${Date.now()}`,
      nombreIndice,
      fixtures.cliente.id,
      fixtures.acreedorConDatos.id,
      '2028-01-15',
      100000
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/indices')

    await expect(page.getByText(`${nombreIndice} — Diciembre 2027`)).toBeVisible()

    // Cargando el mes que faltaba, el aviso para ESE índice desaparece.
    await page.getByPlaceholder('Ej: IPC').fill(nombreIndice)
    await page.getByRole('textbox', { name: 'Mes' }).fill('2027-12')
    await page.getByPlaceholder('Ej: 3').fill('2')
    await page.getByRole('button', { name: 'Cargar' }).click()
    await page.waitForURL('**/admin/indices')

    await expect(page.getByText(`${nombreIndice} — Diciembre 2027`)).not.toBeVisible()
  })

  test('aviso de orden: si faltan dos meses del mismo índice, el más nuevo avisa que hay que cargar el más viejo primero (pedido 24/08)', async ({
    page,
  }) => {
    const nombreIndice = `IPC-E2E-Orden-${Date.now()}`

    // Cuota que vence en febrero necesita el índice de enero (el más
    // viejo pendiente). Cuota que vence en marzo necesita el de febrero.
    await crearLoteVendidoConIndice(
      `E2E Orden Viejo ${Date.now()}`,
      nombreIndice,
      fixtures.cliente.id,
      fixtures.acreedorConDatos.id,
      '2028-02-15',
      100000
    )
    await crearLoteVendidoConIndice(
      `E2E Orden Nuevo ${Date.now()}`,
      nombreIndice,
      fixtures.cliente.id,
      fixtures.acreedorConDatos.id,
      '2028-03-15',
      100000
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/indices')

    const filaVieja = page.locator('li', { hasText: `${nombreIndice} — Enero 2028` })
    const filaNueva = page.locator('li', { hasText: `${nombreIndice} — Febrero 2028` })

    // El mes más viejo pendiente (enero) no lleva ninguna advertencia.
    await expect(filaVieja).toBeVisible()
    await expect(filaVieja.getByText(/Ojo: todavía falta cargar/)).toHaveCount(0)

    // El mes más nuevo (febrero) sí avisa que hay que cargar enero antes.
    await expect(
      filaNueva.getByText(new RegExp(`Ojo: todavía falta cargar Enero 2028 de ${nombreIndice}`))
    ).toBeVisible()
  })

  test('eliminar el valor más reciente revierte el ajuste sobre la cuota', async ({ page }) => {
    const admin = createAdminClient()
    const nombreIndice = `IPC-E2E-Eliminar-${Date.now()}`

    const { cuotaId } = await crearLoteVendidoConIndice(
      `E2E Indice Eliminar ${Date.now()}`,
      nombreIndice,
      fixtures.cliente.id,
      fixtures.acreedorConDatos.id,
      '2027-02-15',
      100000
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/indices')
    await page.getByPlaceholder('Ej: IPC').fill(nombreIndice)
    await page.getByRole('textbox', { name: 'Mes' }).fill('2027-01')
    await page.getByPlaceholder('Ej: 3').fill('5')
    await page.getByRole('button', { name: 'Cargar' }).click()
    await page.waitForURL('**/admin/indices')

    await expect
      .poll(async () => {
        const { data } = await admin.from('cuotas').select('saldo_pendiente').eq('id', cuotaId).single()
        return data?.saldo_pendiente ?? null
      })
      .toBe(105000)

    page.once('dialog', (dialog) => dialog.accept())
    const filaEliminar = page.locator('tbody tr', { hasText: nombreIndice })
    await filaEliminar.getByRole('button', { name: 'Eliminar' }).click()
    await page.waitForURL('**/admin/indices**')
    await expect(page.getByText('Índice eliminado')).toBeVisible()

    await expect
      .poll(async () => {
        const { data } = await admin.from('cuotas').select('saldo_pendiente').eq('id', cuotaId).single()
        return data?.saldo_pendiente ?? null
      })
      .toBe(100000)

    const { data: valorBorrado } = await admin
      .from('indices_valores')
      .select('id')
      .eq('nombre', nombreIndice)
      .eq('periodo', '2027-01-01')
      .maybeSingle()
    expect(valorBorrado).toBeNull()
  })

  test('el selector de índice en Datos generales del lote guarda correctamente', async ({ page }) => {
    const admin = createAdminClient()
    const { loteId } = await crearLoteVendidoConIndice(
      `E2E Selector Indice ${Date.now()}`,
      null,
      fixtures.cliente.id,
      fixtures.acreedorConDatos.id,
      '2027-02-15',
      100000
    )
    const nombreIndice = `IPC-E2E-Selector-${Date.now()}`

    // Precondición: el índice tiene que existir en indices_valores para
    // aparecer como opción en el <select> (la pantalla solo ofrece índices
    // ya cargados al menos una vez).
    await admin.from('indices_valores').insert({
      nombre: nombreIndice,
      periodo: '2026-01-01',
      valor: 1,
      cargado_por: fixtures.admin.id,
    })

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}`)
    await page.locator('select[name="indiceTipo"]').selectOption(nombreIndice)
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await page.waitForURL(`**/admin/lotes/${loteId}`)

    let intentos = 0
    await expect
      .poll(
        async () => {
          intentos += 1
          const { data: lote } = await admin.from('lotes').select('indice_tipo').eq('id', loteId).single()
          return lote?.indice_tipo ?? null
        },
        { timeout: 10000 }
      )
      .toBe(nombreIndice)
    console.log(`[diagnóstico stale-read] intentos hasta ver el valor correcto: ${intentos}`)
  })
})

test.describe('Índices — compuesto encadenado, fallback y catch-up (23/08)', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test.afterEach(async () => {
    const admin = createAdminClient()
    await admin.from('indices_valores').delete().ilike('nombre', '%E2E%')
  })

  test('caso completo de Nicolás: 3 meses seguidos, cada uno encadena sobre el monto YA ajustado del anterior, no sobre el monto_base', async ({
    page,
  }) => {
    const nombreIndice = `IPC-E2E-Cadena-${Date.now()}`
    const { loteId, cuotaIds } = await crearLoteVendidoConVariasCuotas(
      `E2E Cadena ${Date.now()}`,
      nombreIndice,
      fixtures.cliente.id,
      fixtures.acreedorConDatos.id,
      ['2027-01-15', '2027-02-15', '2027-03-15']
    )

    await login(page, fixtures.admin.email, fixtures.password)

    // Diciembre 5% -> afecta la cuota de enero: 100.000 -> 105.000
    await cargarIndice(page, nombreIndice, '2026-12', '5')
    // Enero 10% -> afecta la cuota de febrero, ENCADENADO sobre los 105.000
    // de enero (105.000 * 1.10 = 115.500), no sobre sus propios 100.000
    await cargarIndice(page, nombreIndice, '2027-01', '10')
    // Febrero 5% -> afecta la cuota de marzo, encadenado sobre 115.500
    await cargarIndice(page, nombreIndice, '2027-02', '5')

    await expect
      .poll(async () => (await leerCuotas(loteId)).map((c) => c.saldo_pendiente))
      .toEqual([105000, 115500, 121275])

    const admin = createAdminClient()
    const { data: ajustes } = await admin
      .from('ajustes_indexacion')
      .select('fecha_desde, porcentaje, indice_periodo')
      .eq('lote_id', loteId)
      .order('fecha_desde', { ascending: true })

    expect(ajustes).toEqual([
      { fecha_desde: '2027-01-01', porcentaje: 5, indice_periodo: '2026-12-01' },
      { fecha_desde: '2027-02-01', porcentaje: 10, indice_periodo: '2027-01-01' },
      { fecha_desde: '2027-03-01', porcentaje: 5, indice_periodo: '2027-02-01' },
    ])
  })

  test('catch-up + fallback: una carga tardía pone al día TODOS los meses pendientes de una sola vez, usando el último valor cargado para el mes que falta (confirmado por Gabriel)', async ({
    page,
  }) => {
    const nombreIndice = `IPC-E2E-CatchUp-${Date.now()}`
    const { loteId } = await crearLoteVendidoConVariasCuotas(
      `E2E CatchUp ${Date.now()}`,
      nombreIndice,
      fixtures.cliente.id,
      fixtures.acreedorConDatos.id,
      ['2027-01-15', '2027-02-15', '2027-03-15']
    )

    await login(page, fixtures.admin.email, fixtures.password)

    // Diciembre 5% ajusta la cuota de enero de inmediato (reactivo, como
    // siempre).
    await cargarIndice(page, nombreIndice, '2026-12', '5')
    await expect.poll(async () => (await leerCuotas(loteId))[0].saldo_pendiente).toBe(105000)

    // Nicolás se salteó enero por completo -- nunca lo carga. Directo carga
    // febrero (4%). Esta ÚNICA carga tiene que poner al día DOS cuotas de
    // una: la de febrero (que necesitaba enero, ausente -> usa diciembre
    // como fallback) Y la de marzo (que sí tiene su valor exacto, recién
    // cargado), cada una encadenada sobre la anterior.
    await cargarIndice(page, nombreIndice, '2027-02', '4')

    await expect
      .poll(async () => (await leerCuotas(loteId)).map((c) => c.saldo_pendiente))
      .toEqual([105000, 110250, 114660])

    const admin = createAdminClient()
    const { data: ajusteFebrero } = await admin
      .from('ajustes_indexacion')
      .select('indice_periodo, porcentaje')
      .eq('lote_id', loteId)
      .eq('fecha_desde', '2027-02-01')
      .single()
    // La cuota de febrero usó el fallback a diciembre (5%), no un 0%.
    expect(ajusteFebrero).toEqual({ indice_periodo: '2026-12-01', porcentaje: 5 })
  })

  test('cambio de índice a mitad de camino (IPC -> IPC promocional) no es retroactivo', async ({ page }) => {
    const ipc = `IPC-E2E-Cambio-${Date.now()}`
    const ipcPromocional = `IPC-Promo-E2E-Cambio-${Date.now()}`
    const { loteId, cuotaIds } = await crearLoteVendidoConVariasCuotas(
      `E2E Cambio Indice ${Date.now()}`,
      ipc,
      fixtures.cliente.id,
      fixtures.acreedorConDatos.id,
      ['2027-01-15', '2027-02-15']
    )

    await login(page, fixtures.admin.email, fixtures.password)

    // Enero se ajusta con IPC normal.
    await cargarIndice(page, ipc, '2026-12', '5')
    await expect.poll(async () => (await leerCuotas(loteId))[0].saldo_pendiente).toBe(105000)

    // Nicolás decide premiar a este lote: lo pasa a "IPC promocional" ANTES
    // de que se cargue el valor de enero (el que le tocaría a la cuota de
    // febrero).
    const admin = createAdminClient()
    await admin.from('lotes').update({ indice_tipo: ipcPromocional }).eq('id', loteId)

    // Se sigue cargando IPC normal de enero (10%) -- NO debería afectar más
    // a este lote, porque ya no está atado a "IPC".
    await cargarIndice(page, ipc, '2027-01', '10')

    const cuotasTrasIpcNormal = await leerCuotas(loteId)
    expect(cuotasTrasIpcNormal[1].saldo_pendiente).toBe(100000) // febrero sigue sin tocar

    // Se carga el IPC promocional de enero (2%) -- este sí tiene que afectar
    // a la cuota de febrero, encadenado sobre los 105.000 de enero (que
    // quedaron intactos, sin retroactividad).
    await cargarIndice(page, ipcPromocional, '2027-01', '2')

    await expect
      .poll(async () => (await leerCuotas(loteId)).map((c) => c.saldo_pendiente))
      .toEqual([105000, 107100])

    const { data: ajusteFebrero } = await admin
      .from('ajustes_indexacion')
      .select('indice_nombre, porcentaje')
      .eq('lote_id', loteId)
      .eq('fecha_desde', '2027-02-01')
      .single()
    expect(ajusteFebrero).toEqual({ indice_nombre: ipcPromocional, porcentaje: 2 })
  })

  test('corregir un valor viejo propaga el recálculo en cadena a las cuotas siguientes, incluso si ya usaron OTRO índice (caso IPC promocional)', async ({
    page,
  }) => {
    // La UI solo deja corregir el mes MÁS RECIENTE de cada nombre de
    // índice -- para poder corregir diciembre después de que ya se cargó
    // enero, hace falta que enero pertenezca a un índice DISTINTO (mismo
    // escenario real: el lote cambió de "IPC" a "IPC promocional").
    const indiceA = `IPC-E2E-CorregirCadena-A-${Date.now()}`
    const indiceB = `IPC-E2E-CorregirCadena-B-${Date.now()}`
    const { loteId } = await crearLoteVendidoConVariasCuotas(
      `E2E Corregir Cadena ${Date.now()}`,
      indiceA,
      fixtures.cliente.id,
      fixtures.acreedorConDatos.id,
      ['2027-01-15', '2027-02-15']
    )

    await login(page, fixtures.admin.email, fixtures.password)

    await cargarIndice(page, indiceA, '2026-12', '5') // enero -> 105.000

    // Espera a que el primer ajuste haya terminado de verdad antes de
    // seguir -- waitForURL('**/admin/indices') no alcanza como garantía acá
    // porque el origen y el destino son la MISMA url, así que puede
    // resolver antes de que el server action termine (mismo patrón que ya
    // usa el test de "cambio de índice a mitad de camino" más arriba).
    const admin = createAdminClient()
    await expect
      .poll(async () => (await leerCuotas(loteId))[0].saldo_pendiente)
      .toBe(105000)

    await admin.from('lotes').update({ indice_tipo: indiceB }).eq('id', loteId)

    await cargarIndice(page, indiceB, '2027-01', '10') // febrero -> 115.500, encadenado sobre enero

    await expect
      .poll(async () => (await leerCuotas(loteId)).map((c) => c.saldo_pendiente))
      .toEqual([105000, 115500])

    // Corrige diciembre (índice A) de 5% a 3% -- la cuota de enero baja a
    // 103.000, y la de febrero (que usó un índice DISTINTO pero encadenó
    // sobre los 105.000 viejos de enero) tiene que recalcularse sola:
    // 103.000 * 1.10 = 113.300.
    const filaCorregir = page.locator('tbody tr', { hasText: indiceA })
    await filaCorregir.locator('input[name="valorNuevo"]').fill('3')
    page.once('dialog', (dialog) => dialog.accept())
    await filaCorregir.getByRole('button', { name: 'Corregir' }).click()
    await page.waitForURL('**/admin/indices**')
    await expect(page.getByText('Índice corregido')).toBeVisible()

    await expect
      .poll(async () => (await leerCuotas(loteId)).map((c) => c.saldo_pendiente))
      .toEqual([103000, 113300])
  })

  test('regresión 24/08: una cuota que quedó en 0% (sin fallback disponible) sigue heredando cambios de una corrección más vieja', async ({
    page,
  }) => {
    // Bug real encontrado en vivo con el lote de demo: se eliminaba el
    // ÚNICO valor de un índice, dejando esa cuota en 0% (heredando el
    // monto de la anterior). Si DESPUÉS se corregía un índice más viejo
    // que afectaba a la cuota anterior, la cascada se cortaba ahí -- la
    // cuota en 0% se quedaba pegada para siempre, porque el código solo
    // consideraba "parte de la cadena" a una cuota con su propio ajuste
    // registrado en la base.
    const indiceA = `IPC-E2E-Regresion0pct-A-${Date.now()}`
    const indiceB = `IPC-E2E-Regresion0pct-B-${Date.now()}`
    const { loteId } = await crearLoteVendidoConVariasCuotas(
      `E2E Regresion 0pct ${Date.now()}`,
      indiceA,
      fixtures.cliente.id,
      fixtures.acreedorConDatos.id,
      ['2027-01-15', '2027-02-15']
    )

    await login(page, fixtures.admin.email, fixtures.password)

    await cargarIndice(page, indiceA, '2026-12', '5') // enero -> 105.000
    await expect.poll(async () => (await leerCuotas(loteId))[0].saldo_pendiente).toBe(105000)

    const admin = createAdminClient()
    await admin.from('lotes').update({ indice_tipo: indiceB }).eq('id', loteId)

    // indiceB solo tiene ESTE valor -- al borrarlo no va a quedar ningún
    // otro valor de indiceB al que hacerle fallback.
    await cargarIndice(page, indiceB, '2027-01', '10') // febrero -> 115.500
    await expect.poll(async () => (await leerCuotas(loteId))[1].saldo_pendiente).toBe(115500)

    const filaIndiceB = page.locator('tbody tr', { hasText: indiceB })
    page.once('dialog', (dialog) => dialog.accept())
    await filaIndiceB.getByRole('button', { name: 'Eliminar' }).click()
    await page.waitForURL('**/admin/indices**')

    await expect
      .poll(async () => (await leerCuotas(loteId)).map((c) => c.saldo_pendiente))
      .toEqual([105000, 105000]) // febrero pasa a heredar el de enero, sin índice propio (0%)

    // Ahora corrige diciembre (indiceA, el que le tocaba a la cuota de
    // enero) -- la cascada tiene que cruzar la cuota de febrero (que no
    // tiene ningún ajuste propio) y actualizarla también.
    const filaIndiceA = page.locator('tbody tr', { hasText: indiceA })
    await filaIndiceA.locator('input[name="valorNuevo"]').fill('3')
    page.once('dialog', (dialog) => dialog.accept())
    await filaIndiceA.getByRole('button', { name: 'Corregir' }).click()
    await page.waitForURL('**/admin/indices**')
    await expect(page.getByText('Índice corregido')).toBeVisible()

    await expect
      .poll(async () => (await leerCuotas(loteId)).map((c) => c.saldo_pendiente))
      .toEqual([103000, 103000]) // febrero sigue heredando -- ya no se queda pegada en 105.000

    // Y sigue siendo re-cargable: si más adelante se carga un valor de
    // indiceB de nuevo, febrero lo toma sin problema (el placeholder en
    // 0% no la deja "trabada" para siempre).
    await cargarIndice(page, indiceB, '2027-01', '8')
    await expect
      .poll(async () => (await leerCuotas(loteId))[1].saldo_pendiente)
      .toBe(111240) // 103000 * 1.08
  })

  test('la leyenda de mes faltante muestra el lote afectado y un link para cargarlo ahí mismo (pedido 24/08)', async ({
    page,
  }) => {
    const nombreIndice = `IPC-E2E-Leyenda-${Date.now()}`
    const identificadorLote = `E2E Leyenda Lote ${Date.now()}`

    const { loteId } = await crearLoteVendidoConIndice(
      identificadorLote,
      nombreIndice,
      fixtures.cliente.id,
      fixtures.acreedorConDatos.id,
      '2028-02-15',
      100000
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/indices')

    const filaFaltante = page.locator('li', { hasText: nombreIndice })
    await expect(filaFaltante).toBeVisible()

    // Muestra el identificador del lote afectado, como link a su detalle.
    const linkLote = filaFaltante.getByRole('link', { name: identificadorLote })
    await expect(linkLote).toBeVisible()
    await expect(linkLote).toHaveAttribute('href', `/admin/lotes/${loteId}`)

    // El link "cargar ahora" lleva al mismo formulario con nombre y mes
    // pre-cargados -- solo falta tipear el %. Este índice es nuevo (nunca
    // se cargó ningún valor todavía), así que precarga el campo de texto
    // "nombre nuevo", no el <select> de índices existentes.
    await filaFaltante.getByRole('link', { name: /cargar ahora/ }).click()

    await expect(page.locator('#form-cargar input[name="nombreNuevo"]')).toHaveValue(nombreIndice)
    await expect(page.locator('#form-cargar input[name="periodo"]')).toHaveValue('2028-01')
  })

  test('el índice nunca se aplica sobre un monto que incluya mora -- son mecanismos separados', async ({
    page,
  }) => {
    const nombreIndice = `IPC-E2E-Mora-${Date.now()}`
    const admin = createAdminClient()

    const { data: lote } = await admin
      .from('lotes')
      .insert({
        identificador: `E2E Mora Vs Indice ${Date.now()}`,
        moneda: 'ARS',
        estado: 'vendido',
        precio_total: 100000,
        acreedor_id: fixtures.acreedorConDatos.id,
        cliente_id: fixtures.cliente.id,
        indice_tipo: nombreIndice,
        interes_moratorio_diario: 1,
      })
      .select('id')
      .single()

    // Cuota vencida hace 10 días, con mora corriendo -- pero la mora nunca
    // se guarda en saldo_pendiente (se calcula al vuelo), así que el índice
    // no puede llegar a verla ni de casualidad.
    const hace10Dias = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    await admin
      .from('cuotas')
      .insert({ lote_id: lote!.id, numero: 1, monto_base: 100000, saldo_pendiente: 100000, fecha_vencimiento: hace10Dias })

    const periodoNecesario = hace10Dias.slice(0, 7)
    const [anio, mes] = periodoNecesario.split('-').map(Number)
    const mesAnterior = mes === 1 ? `${anio - 1}-12` : `${anio}-${String(mes - 1).padStart(2, '0')}`

    await login(page, fixtures.admin.email, fixtures.password)
    await cargarIndice(page, nombreIndice, mesAnterior, '5')

    await expect
      .poll(async () => (await leerCuotas(lote!.id)).map((c) => c.saldo_pendiente))
      .toEqual([105000]) // exactamente 5% de 100.000 -- ni un peso de mora mezclado
  })
})
