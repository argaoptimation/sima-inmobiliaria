import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'
import { hoyArgentina } from '../../lib/fecha/hoy-argentina'
import { sumarDias } from '../../lib/fecha/sumar-dias'

// Buscador de lote por identificador, cliente o DNI + panel de cuotas/mora
// en /admin/efectivo (pedido de Gabriel 28/08).
test.describe('Buscador amplio y panel de cuotas en /admin/efectivo', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('encuentra el lote buscando por DNI o por nombre del cliente, y muestra sus cuotas con mora en vivo', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const dniDePrueba = `E2E${Date.now()}`.slice(0, 12)

    const { data: loteExistente } = await admin
      .from('profiles')
      .select('dni')
      .eq('id', fixtures.cliente.id)
      .single()
    const dniOriginal = loteExistente?.dni ?? null

    const identificador = `E2E Buscador ${Date.now()}`
    const { data: lote, error: errorLote } = await admin
      .from('lotes')
      .insert({
        identificador,
        moneda: 'USD',
        estado: 'vendido',
        cliente_id: fixtures.cliente.id,
        acreedor_id: fixtures.acreedorConDatos.id,
        interes_moratorio_diario: 1,
      })
      .select('id')
      .single()
    if (errorLote || !lote) throw new Error(`No se pudo crear el lote: ${errorLote?.message}`)

    const haceCincoDias = sumarDias(hoyArgentina(), -5)
    const { error: errorCuota } = await admin.from('cuotas').insert({
      lote_id: lote.id,
      numero: 1,
      monto_base: 500,
      saldo_pendiente: 500,
      fecha_vencimiento: haceCincoDias,
    })
    if (errorCuota) throw new Error(`No se pudo crear la cuota: ${errorCuota.message}`)

    try {
      const { error: errorDni } = await admin
        .from('profiles')
        .update({ dni: dniDePrueba })
        .eq('id', fixtures.cliente.id)
      if (errorDni) throw new Error(`No se pudo setear el DNI de prueba: ${errorDni.message}`)

      await login(page, fixtures.admin.email, fixtures.password)
      await page.goto('/admin/efectivo')

      // Búsqueda por DNI -- el DNI vive en el perfil, así que puede
      // devolver más de un lote si el cliente tiene varios (acá, además del
      // que crea este test, está el que arma ensureTestFixtures()).
      // Scoped al identificador de ESTE lote para no depender de cuál.
      await page.locator('[data-testid="buscador-lote-amplio"]').fill(dniDePrueba)
      const opcionPorDni = page.locator('ul li button', { hasText: identificador })
      await expect(opcionPorDni).toBeVisible()
      await expect(opcionPorDni).toContainText(dniDePrueba)
      await opcionPorDni.click()

      const panel = page.locator('[data-testid="panel-cuotas-lote"]')
      await expect(panel.getByText('E2E Cliente')).toBeVisible()
      await expect(panel.getByText('Cuota 1')).toBeVisible()
      await expect(panel.getByText('500 USD')).toBeVisible()
      // 5 días de atraso, 1%/día sobre 500 = 25 de mora.
      await expect(panel.getByText('+25 USD mora')).toBeVisible()
      await expect(panel.getByText('525 USD')).toBeVisible() // total adeudado

      // Búsqueda por nombre, desde cero -- recarga la página para limpiar la
      // selección anterior. El cliente de prueba puede tener más de un lote
      // (otros tests de esta suite crean varios en paralelo) -- alcanza con
      // confirmar que el buscador encuentra al menos una coincidencia por
      // nombre, sin depender de cuál lote puntual sea.
      await page.goto('/admin/efectivo')
      await page.locator('[data-testid="buscador-lote-amplio"]').fill('E2E Cliente')
      const opcionPorNombre = page.locator('ul li button', { hasText: 'E2E Cliente' }).first()
      await expect(opcionPorNombre).toBeVisible()
    } finally {
      await admin.from('profiles').update({ dni: dniOriginal }).eq('id', fixtures.cliente.id)
    }
  })
})
