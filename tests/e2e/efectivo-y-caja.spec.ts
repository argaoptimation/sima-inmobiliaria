import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login, logout } from './utils/login'

// Recibe clienteId/acreedorId como parámetros (en vez de llamar a
// ensureTestFixtures() acá adentro) -- mismo patrón que ya usan
// indices.spec.ts y rescindido.spec.ts. ensureTestFixtures() BORRA todos
// los lotes previos del cliente de prueba cada vez que se llama, así que
// llamarla una segunda vez a mitad de un test borraría el lote que se
// acababa de crear un momento antes.
async function crearLoteVendidoConCuotaPendiente(
  identificador: string,
  monto: number,
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
      monto_base: monto,
      saldo_pendiente: monto,
      fecha_vencimiento: '2027-01-10',
    })
    .select('id')
    .single()

  if (errorCuota || !cuota) {
    throw new Error(`No se pudieron crear las cuotas de prueba: ${errorCuota?.message}`)
  }

  return { loteId: lote.id as string, cuotaId: cuota.id as string }
}

test.describe('Efectivo y cierre de caja (25/08)', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('cobrador registra un pago en efectivo, admin lo marca como recibido, FIFO imputa la cuota', async ({
    page,
  }) => {
    const { loteId, cuotaId } = await crearLoteVendidoConCuotaPendiente(
      `E2E Efectivo ${Date.now()}`,
      1000,
      fixtures.cliente.id,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.cobrador.email, fixtures.password)
    await page.goto('/admin/efectivo')

    const admin = createAdminClient()
    const { data: lote } = await admin.from('lotes').select('identificador').eq('id', loteId).single()

    await page.locator('input[list="lista-lotes-cuenta-corriente"]').fill(lote!.identificador)
    await page.locator('input[name="monto"]').fill('1000')
    await page.locator('select[name="moneda"]').selectOption('USD')
    await page.getByRole('button', { name: 'Registrar' }).click()
    await page.waitForURL('**/admin/efectivo**')

    const filaPago = page.locator('tbody tr', { hasText: lote!.identificador })
    await expect(filaPago).toBeVisible()
    await expect(filaPago.getByText('Pendiente')).toBeVisible()
    // El cobrador no puede confirmarlo -- solo puede cargarlo.
    await expect(filaPago.getByRole('button', { name: 'Marcar como recibido' })).toHaveCount(0)
    await expect(filaPago.getByText('Esperando confirmación del admin')).toBeVisible()

    await logout(page)
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/efectivo')

    const filaPagoAdmin = page.locator('tbody tr', { hasText: lote!.identificador })
    await filaPagoAdmin.getByRole('button', { name: 'Marcar como recibido' }).click()
    await page.waitForURL('**/admin/efectivo**')

    await expect(async () => {
      await page.reload()
      await expect(page.locator('tbody tr', { hasText: lote!.identificador }).getByText('Recibido')).toBeVisible({
        timeout: 2000,
      })
    }).toPass({ timeout: 10000 })

    await expect
      .poll(async () => {
        const { data } = await admin.from('cuotas').select('saldo_pendiente').eq('id', cuotaId).single()
        return data?.saldo_pendiente ?? null
      })
      .toBe(0)

    // El detalle del lote muestra el historial de pagos con el medio
    // (pedido de Gabriel 25/08) -- visible también para el cobrador, que
    // ahora puede ver el detalle de cualquier lote (sin el reparto).
    await logout(page)
    await login(page, fixtures.cobrador.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}`)

    // Scoped a la tabla de "Historial de pagos" en particular -- la de
    // Cuotas también tiene una columna con "1000 USD" (monto base).
    const filaHistorialPago = page
      .locator('h2:has-text("Historial de pagos") ~ table tbody tr')
      .filter({ hasText: '1000 USD' })
    await expect(filaHistorialPago).toBeVisible()
    await expect(filaHistorialPago.getByText('Efectivo', { exact: true })).toBeVisible()
    await expect(filaHistorialPago.getByText('Confirmado', { exact: true })).toBeVisible()
  })

  test('un vendedor o un acreedor NO pueden acceder a /admin/efectivo ni a /admin/cierre-caja (solo admin o cobrador)', async ({
    page,
  }) => {
    await login(page, fixtures.vendedorSinLotes.email, fixtures.password)
    await expect(page.getByRole('link', { name: 'Efectivo' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Cierre de caja' })).toHaveCount(0)
    await page.goto('/admin/efectivo')
    await expect(page).toHaveURL(/\/admin\/lotes/)
    await page.goto('/admin/cierre-caja')
    await expect(page).toHaveURL(/\/admin\/lotes/)

    await logout(page)
    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto('/admin/efectivo')
    await expect(page).toHaveURL(/\/admin\/lotes/)
    await page.goto('/admin/cierre-caja')
    await expect(page).toHaveURL(/\/admin\/lotes/)
  })

  test('cierre de caja agrupa efectivo y transferencia por separado, del día de la confirmación', async ({
    page,
  }) => {
    const { loteId: loteEfectivoId } = await crearLoteVendidoConCuotaPendiente(
      `E2E Caja Efectivo ${Date.now()}`,
      300,
      fixtures.cliente.id,
      fixtures.acreedorConDatos.id
    )
    const { loteId: loteTransferenciaId } = await crearLoteVendidoConCuotaPendiente(
      `E2E Caja Transferencia ${Date.now()}`,
      450,
      fixtures.cliente.id,
      fixtures.acreedorConDatos.id
    )

    const admin = createAdminClient()

    // Efectivo: confirmado directo (mismo camino que usaría confirmarPago,
    // pero armado por SQL para no repetir el flujo de UI ya probado arriba).
    const hoy = new Date().toISOString()
    const { error: errorEfectivo } = await admin.from('pagos').insert({
      cliente_id: fixtures.cliente.id,
      lote_id: loteEfectivoId,
      monto: 300,
      moneda: 'USD',
      motivo: 'cuota',
      medio_pago: 'efectivo',
      estado: 'confirmado',
      confirmado_admin_por: fixtures.admin.id,
      confirmado_admin_at: hoy,
    })
    expect(errorEfectivo).toBeNull()

    // Transferencia: confirmado por ambos (acreedor + admin), igual que el
    // flujo real.
    const { error: errorTransferencia } = await admin.from('pagos').insert({
      cliente_id: fixtures.cliente.id,
      lote_id: loteTransferenciaId,
      monto: 450,
      moneda: 'USD',
      motivo: 'cuota',
      medio_pago: 'transferencia',
      estado: 'confirmado',
      confirmado_acreedor_por: fixtures.acreedorConDatos.id,
      confirmado_acreedor_at: hoy,
      confirmado_admin_por: fixtures.admin.id,
      confirmado_admin_at: hoy,
    })
    expect(errorTransferencia).toBeNull()

    const { data: loteEfectivo } = await admin
      .from('lotes')
      .select('identificador')
      .eq('id', loteEfectivoId)
      .single()
    const { data: loteTransferencia } = await admin
      .from('lotes')
      .select('identificador')
      .eq('id', loteTransferenciaId)
      .single()

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/cierre-caja')

    // Los totales de arriba son un AGREGADO de todo lo confirmado hoy en
    // toda la suite (una sola caja para toda la operación, ver
    // Notas_Decisiones_SIMA.txt punto 22) -- no es confiable comparar un
    // número exacto ahí. Lo que sí se puede verificar sin ambigüedad es
    // que la fila de CADA lote (identificador único) aparezca en el
    // detalle del día con el medio de pago correcto.
    // exact: true -- el identificador del lote de prueba contiene la
    // palabra "Efectivo"/"Transferencia", así que un match por substring
    // también encontraría el link del lote, no solo la celda "Medio".
    const filaEfectivo = page.locator('tbody tr', { hasText: loteEfectivo!.identificador })
    await expect(filaEfectivo.getByText('Efectivo', { exact: true })).toBeVisible()
    await expect(filaEfectivo.getByText('300 USD')).toBeVisible()

    const filaTransferencia = page.locator('tbody tr', { hasText: loteTransferencia!.identificador })
    await expect(filaTransferencia.getByText('Transferencia', { exact: true })).toBeVisible()
    await expect(filaTransferencia.getByText('450 USD')).toBeVisible()
  })
})
