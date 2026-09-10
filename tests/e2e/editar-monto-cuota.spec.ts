import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'
import { hoyArgentina } from '../../lib/fecha/hoy-argentina'
import { sumarDias } from '../../lib/fecha/sumar-dias'

// Cambiar el monto de una cuota sin refinanciar (10/09, pedido de Gabriel:
// "poder modificar sin necesidad de refinanciar, para darle flexibilidad a
// Nico").
//
// Lo que cuidan estos tests no es que el número cambie -- eso es un UPDATE.
// Es que NO se pueda cambiar el de una cuota que ya pasó por algo: en cuanto
// entró un peso, o venció, o se le aplicó un índice, ese monto dejó de ser
// un número editable y pasó a ser parte de una cuenta que ya está hecha.
test.describe('Cambiar el monto de una cuota', () => {
  let fixtures: TestFixtures
  const lotesCreados: string[] = []

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test.afterAll(async () => {
    if (lotesCreados.length === 0) return
    const admin = createAdminClient()
    const { data: cuotas } = await admin.from('cuotas').select('id').in('lote_id', lotesCreados)
    const cuotaIds = (cuotas ?? []).map((cuota) => cuota.id)
    if (cuotaIds.length > 0) {
      await admin.from('pago_imputaciones').delete().in('cuota_id', cuotaIds)
    }
    await admin.from('pagos').delete().in('lote_id', lotesCreados)
    await admin.from('lotes').delete().in('id', lotesCreados)
  })

  async function crearLoteConCuotas(identificador: string) {
    const admin = createAdminClient()
    const { data: lote, error } = await admin
      .from('lotes')
      .insert({
        identificador,
        moneda: 'USD',
        estado: 'vendido',
        cliente_id: fixtures.cliente.id,
        acreedor_id: fixtures.acreedorConDatos.id,
        cantidad_cuotas: 3,
        monto_cuota_base: 1000,
      })
      .select('id')
      .single()
    if (error || !lote) throw new Error(`No se pudo crear el lote: ${error?.message}`)
    lotesCreados.push(lote.id)

    const hoy = hoyArgentina()
    const { data: cuotas, error: errorCuotas } = await admin
      .from('cuotas')
      .insert([
        // 1: ya venció.
        { lote_id: lote.id, numero: 1, monto_base: 1000, saldo_pendiente: 1000, fecha_vencimiento: sumarDias(hoy, -30) },
        // 2 y 3: futuras y limpias.
        { lote_id: lote.id, numero: 2, monto_base: 1000, saldo_pendiente: 1000, fecha_vencimiento: sumarDias(hoy, 30) },
        { lote_id: lote.id, numero: 3, monto_base: 1000, saldo_pendiente: 1000, fecha_vencimiento: sumarDias(hoy, 60) },
      ])
      .select('id, numero')
    if (errorCuotas || !cuotas) throw new Error(`No se pudieron crear las cuotas: ${errorCuotas?.message}`)

    return { loteId: lote.id as string, cuotas }
  }

  test('una cuota futura y limpia se cambia; la vencida ni siquiera aparece', async ({ page }) => {
    const { loteId } = await crearLoteConCuotas(`E2E Editar Cuota ${Date.now()}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}`)

    await page.locator('summary', { hasText: 'Cambiar el monto de una cuota' }).click()
    const panel = page.locator('details', { hasText: 'Cambiar el monto de una cuota' })

    // Las dos futuras sí, la vencida no: el panel ofrece exactamente lo que
    // el servidor va a aceptar.
    await expect(panel.locator('input[name="montoCuota2"]')).toBeVisible()
    await expect(panel.locator('input[name="montoCuota3"]')).toBeVisible()
    await expect(panel.locator('input[name="montoCuota1"]')).toHaveCount(0)

    await panel.locator('input[name="montoCuota2"]').fill('1350.50')
    await panel.locator('input[name="motivo"]').fill('acordado con el comprador')
    await panel.getByRole('button', { name: 'Guardar los montos nuevos' }).click()

    await page.waitForURL(/ok=/, { timeout: 30_000 })
    await expect(page.getByText('Monto de la cuota 2 actualizado')).toBeVisible()

    // El monto y el saldo quedan los dos en el valor nuevo: si solo cambiara
    // el monto, el cliente seguiría debiendo el viejo.
    const admin = createAdminClient()
    const { data: cuota2 } = await admin
      .from('cuotas')
      .select('monto_base, monto_ajustado, saldo_pendiente')
      .eq('lote_id', loteId)
      .eq('numero', 2)
      .single()
    expect(cuota2).toMatchObject({
      monto_base: 1350.5,
      monto_ajustado: 1350.5,
      saldo_pendiente: 1350.5,
    })

    // Y la 3, que se dejó en blanco, no se tocó.
    const { data: cuota3 } = await admin
      .from('cuotas')
      .select('monto_ajustado')
      .eq('lote_id', loteId)
      .eq('numero', 3)
      .single()
    expect(cuota3?.monto_ajustado).toBe(1000)

    // Queda en el historial del lote con los dos montos: meses después hay
    // que poder responder "¿por qué esta cuota es de 1350?".
    await page.getByText(/Historial de estados del lote/).click()
    const historial = page.locator('details', { hasText: 'Historial de estados del lote' })
    await expect(historial.locator('li', { hasText: 'Monto de cuota cambiado' })).toContainText(
      'cuota 2: 1000 -> 1350.5'
    )
    await expect(historial.locator('li', { hasText: 'Monto de cuota cambiado' })).toContainText(
      'acordado con el comprador'
    )
  })

  test('una cuota con un pago imputado deja de poder cambiarse', async ({ page }) => {
    const { loteId, cuotas } = await crearLoteConCuotas(`E2E Editar Cobrada ${Date.now()}`)
    const cuota2 = cuotas.find((cuota) => cuota.numero === 2)!

    const admin = createAdminClient()
    const { data: pago } = await admin
      .from('pagos')
      .insert({
        cliente_id: fixtures.cliente.id,
        lote_id: loteId,
        monto: 200,
        moneda: 'USD',
        estado: 'confirmado',
        motivo: 'cuota',
        medio_pago: 'transferencia',
        confirmado_admin_por: fixtures.admin.id,
        confirmado_admin_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    await admin.from('pago_imputaciones').insert({
      pago_id: pago!.id,
      cuota_id: cuota2.id,
      monto: 200,
    })
    await admin.from('cuotas').update({ saldo_pendiente: 800 }).eq('id', cuota2.id)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}`)
    await page.locator('summary', { hasText: 'Cambiar el monto de una cuota' }).click()
    const panel = page.locator('details', { hasText: 'Cambiar el monto de una cuota' })

    await expect(panel.locator('input[name="montoCuota2"]')).toHaveCount(0)
    // La 3, que sigue limpia, se puede.
    await expect(panel.locator('input[name="montoCuota3"]')).toBeVisible()
  })

  test('el servidor rechaza una cuota que ya no se puede editar, aunque llegue en el formulario', async ({
    page,
  }) => {
    // El <select> de la pantalla limita lo que se VE, no lo que llega. Este
    // test manda el número de una cuota vencida a mano.
    const { loteId } = await crearLoteConCuotas(`E2E Editar Forzada ${Date.now()}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}`)
    await page.locator('summary', { hasText: 'Cambiar el monto de una cuota' }).click()
    const panel = page.locator('details', { hasText: 'Cambiar el monto de una cuota' })

    // Se le agrega al formulario un campo para la cuota 1, que venció.
    await panel.locator('form').evaluate((form) => {
      const campo = document.createElement('input')
      campo.name = 'montoCuota1'
      campo.value = '999'
      form.appendChild(campo)
    })
    await panel.getByRole('button', { name: 'Guardar los montos nuevos' }).click()

    // Se espera la vuelta del servidor antes de mirar el cartel: en modo dev
    // la acción más el redirect pueden pasarse de los 5s por defecto.
    await page.waitForURL(/error=/, { timeout: 30_000 })
    await expect(page.getByText(/cuota 1 \(ya no se puede editar\)/)).toBeVisible()

    // Y no se cambió nada.
    const admin = createAdminClient()
    const { data: cuota1 } = await admin
      .from('cuotas')
      .select('monto_ajustado')
      .eq('lote_id', loteId)
      .eq('numero', 1)
      .single()
    expect(cuota1?.monto_ajustado).toBe(1000)
  })

  test('un acreedor no ve el panel', async ({ page }) => {
    const { loteId } = await crearLoteConCuotas(`E2E Editar Acreedor ${Date.now()}`)

    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}`)

    await expect(page.getByText('Cambiar el monto de una cuota')).toHaveCount(0)
  })
})
