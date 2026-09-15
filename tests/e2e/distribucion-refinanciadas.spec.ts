import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

// Las cuotas refinanciadas no se reparten (10/09, bug encontrado por Gabriel
// en "DEMO Lote Contrato Quintana": la pantalla de distribución le pedía
// repartir las 36 cuotas que ya se habían refinanciado).
//
// Lo que se ve es que no tiene sentido pedir que se reparta plata que no va
// a entrar nunca. Lo que NO se ve, y es lo grave, está un paso más adentro:
// guardar la distribución es un reemplazo completo (borra todo lo del lote y
// vuelve a insertar lo que llegó del formulario), así que en cuanto esas
// cuotas dejaran de aparecer, el primer "Guardar" les habría borrado la
// distribución que ya tenían. Y esa distribución es de dónde sale la cuenta
// corriente de los acreedores.
test.describe('Distribución de un lote refinanciado', () => {
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
      await admin.from('cuota_distribuciones').delete().in('cuota_id', cuotaIds)
    }
    await admin.from('lote_distribucion_objetivos').delete().in('lote_id', lotesCreados)
    await admin.from('lotes').delete().in('id', lotesCreados)
  })

  test('desaparecen del formulario, y guardar no les borra lo que ya tenían repartido', async ({
    page,
  }) => {
    const admin = createAdminClient()

    const { data: lote } = await admin
      .from('lotes')
      .insert({
        identificador: `E2E Distribucion Refinanciada ${Date.now()}`,
        moneda: 'USD',
        estado: 'vendido',
        cliente_id: fixtures.cliente.id,
        acreedor_id: fixtures.acreedorConDatos.id,
        admin_id: fixtures.admin.id,
        cantidad_cuotas: 2,
        monto_cuota_base: 1000,
      })
      .select('id')
      .single()
    lotesCreados.push(lote!.id)

    const { data: cuotas } = await admin
      .from('cuotas')
      .insert([
        { lote_id: lote!.id, numero: 1, monto_base: 1000, saldo_pendiente: 1000, fecha_vencimiento: '2027-01-10' },
        { lote_id: lote!.id, numero: 2, monto_base: 1000, saldo_pendiente: 1000, fecha_vencimiento: '2027-02-10' },
      ])
      .select('id, numero')

    const cuota1 = cuotas!.find((cuota) => cuota.numero === 1)!

    // La cuota 1 ya estaba repartida y con destino de cobro cuando estaba
    // viva: es la historia que no se puede perder.
    await admin.from('cuota_distribuciones').insert({
      cuota_id: cuota1.id,
      profile_id: fixtures.acreedorConDatos.id,
      monto: 1000,
    })
    await admin
      .from('cuotas')
      .update({ cuenta_cobro_id: fixtures.acreedorConDatos.id })
      .eq('id', cuota1.id)

    // Y después se refinancia: la 1 queda marcada y entra una cuota 3.
    await admin
      .from('cuotas')
      .update({ refinanciada: true, saldo_pendiente: 0 })
      .eq('id', cuota1.id)
    await admin.from('cuotas').insert({
      lote_id: lote!.id,
      numero: 3,
      plan: 2,
      monto_base: 1000,
      saldo_pendiente: 1000,
      fecha_vencimiento: '2027-03-10',
    })

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${lote!.id}/distribucion`)

    // La 1 no se ofrece; la 2 y la 3, sí.
    await expect(page.locator('select[name="cuota1CuentaCobro"]')).toHaveCount(0)
    await expect(page.locator('select[name="cuota2CuentaCobro"]')).toBeVisible()
    await expect(page.locator('select[name="cuota3CuentaCobro"]')).toBeVisible()
    await expect(page.getByText(/Este lote se refinanció: 1 cuota/)).toBeVisible()

    // Se guarda sin tocar nada. Es el momento peligroso: el guardado es un
    // reemplazo completo.
    await page.getByRole('button', { name: /Guardar distribución/ }).first().click()
    await page.waitForURL(/distribucion\?ok=/, { timeout: 30_000 })

    // La distribución de la cuota refinanciada sigue ahí, con su monto.
    const { data: distribucionesDespues } = await admin
      .from('cuota_distribuciones')
      .select('profile_id, monto')
      .eq('cuota_id', cuota1.id)
    expect(distribucionesDespues).toEqual([
      { profile_id: fixtures.acreedorConDatos.id, monto: 1000 },
    ])

    // Y su destino de cobro tampoco se borró.
    const { data: cuota1Despues } = await admin
      .from('cuotas')
      .select('cuenta_cobro_id')
      .eq('id', cuota1.id)
      .single()
    expect(cuota1Despues?.cuenta_cobro_id).toBe(fixtures.acreedorConDatos.id)
  })
})
