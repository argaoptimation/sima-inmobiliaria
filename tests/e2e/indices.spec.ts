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
