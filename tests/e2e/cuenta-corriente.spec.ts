import { test, expect, Page } from '@playwright/test'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login, logout } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

function filaPorComprobante(page: Page, nombreArchivo: string) {
  return page
    .locator('main table tbody tr')
    .filter({ has: page.locator(`a[href*="${nombreArchivo}"]`) })
}

test.describe('Cuenta corriente', () => {
  let fixtures: TestFixtures

  test.beforeEach(async () => {
    fixtures = await ensureTestFixtures()

    // Los movimientos manuales (Haber) no siempre quedan atados a un lote/
    // cuota (ej. "sin lote asociado"), así que la limpieza de
    // ensureTestFixtures() -- que borra en cascada colgando del lote -- no
    // los alcanza. Se limpian aparte para que el saldo de arranque de cada
    // test sea siempre determinístico, sin importar qué dejó una corrida
    // previa.
    const admin = createAdminClient()
    await admin.from('movimientos_cuenta_corriente').delete().eq('profile_id', fixtures.acreedorConDatos.id)
  })

  test('caso 1 de Nico: se cobra la cuota completa y se postea el Debe automático según la distribución cargada; una corrección hacia abajo lo revierte', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const cuotaId = fixtures.cuotaIds[0]

    await admin.from('cuota_distribuciones').insert({
      cuota_id: cuotaId,
      profile_id: fixtures.acreedorConDatos.id,
      monto: 800,
    })

    const nombreArchivo = `e2e-cc-caso1-${Date.now()}.pdf`

    await test.step('el cliente paga la cuota 1 completa (1000 USD) y sube comprobante', async () => {
      await login(page, fixtures.cliente.email, fixtures.password)
      await page.goto(`/portal-cliente/lotes/${fixtures.loteId}`)

      const filaCuota1 = page.locator('main table').nth(0).locator('tbody tr').nth(0)
      await filaCuota1.getByRole('link', { name: 'Pagar cuota' }).click()
      await page.waitForURL(/\/portal-cliente\/pagar\//)

      await page.getByPlaceholder('Monto transferido').fill('1000')
      await page.selectOption('select[name="moneda"]', 'USD')
      await page.getByRole('button', { name: 'Ya transferí' }).click()
      await page.waitForURL(/\/portal-cliente\/pagos\/.+\/comprobante$/)

      await page.setInputFiles('input[name="comprobante"]', {
        name: nombreArchivo,
        mimeType: 'application/pdf',
        buffer: COMPROBANTE_BYTES,
      })
      await page.getByRole('button', { name: 'Finalizar' }).click()
      await page.waitForURL(/\/portal-cliente$/)
    })

    await test.step('acreedor y admin confirman su parte', async () => {
      await logout(page)
      await login(page, fixtures.acreedorConDatos.email, fixtures.password)
      await page.goto('/admin/pagos')
      const filaAcreedor = filaPorComprobante(page, nombreArchivo)
      await filaAcreedor.getByRole('button', { name: 'Confirmar mi parte' }).click()
      await expect(filaAcreedor.locator('td').nth(6)).toHaveText('Sí')

      await logout(page)
      await login(page, fixtures.admin.email, fixtures.password)
      await page.goto('/admin/pagos')
      const fila = filaPorComprobante(page, nombreArchivo)
      await fila.getByRole('button', { name: 'Confirmar mi parte' }).click()
      await expect(fila.locator('td').nth(5)).toHaveText('confirmado')
    })

    await test.step('se posteó el Debe automático de 800 USD para el acreedor', async () => {
      const { data: movimientos } = await admin
        .from('movimientos_cuenta_corriente')
        .select('tipo, monto, moneda, origen, profile_id, cuota_id')
        .eq('cuota_id', cuotaId)
      expect(movimientos).toHaveLength(1)
      expect(movimientos![0]).toMatchObject({
        tipo: 'debe',
        monto: 800,
        moneda: 'USD',
        origen: 'cobro_cuota',
        profile_id: fixtures.acreedorConDatos.id,
      })
    })

    await test.step('el saldo del acreedor muestra 800 USD en /admin/cuentas-corrientes', async () => {
      await page.goto(`/admin/cuentas-corrientes/${fixtures.acreedorConDatos.id}`)
      await expect(page.locator('h2:has-text("Saldo") + p')).toHaveText('800 USD')
    })

    await test.step('una corrección hacia abajo que deja la cuota sin cobrar revierte el Debe', async () => {
      await page.goto('/admin/pagos')
      const fila = filaPorComprobante(page, nombreArchivo)
      await fila.locator('input[name="montoNuevo"]').fill('0')
      await fila.getByRole('button', { name: 'Editar monto' }).click()
      await expect(fila.getByText('Corregir monto (actual: 0 USD)')).toBeVisible()

      const { data: cuota } = await admin
        .from('cuotas')
        .select('saldo_pendiente, monto_base')
        .eq('id', cuotaId)
        .single()
      expect(cuota?.saldo_pendiente).toBe(cuota?.monto_base)

      const { data: movimientos } = await admin
        .from('movimientos_cuenta_corriente')
        .select('tipo, monto, origen')
        .eq('cuota_id', cuotaId)
        .order('created_at', { ascending: true })
      expect(movimientos).toHaveLength(2)
      expect(movimientos![1]).toMatchObject({ tipo: 'debe', monto: -800, origen: 'reversion_cobro_cuota' })

      const sumaNeta = movimientos!.reduce((acc, m) => acc + m.monto, 0)
      expect(sumaNeta).toBe(0)
    })
  })

  test('caso 2 de Nico: el cliente le paga directo al acreedor, salteando a la empresa -- el Haber manual deja el saldo negativo', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const cuotaId = fixtures.cuotaIds[0]

    // Debe de 80 (80% de una cuota de 100, tal como lo describió Nico) ya
    // posteado -- se simula directo en la base para no repetir el flujo
    // completo de pago real, ya cubierto por el test anterior.
    const { error: errorDebe } = await admin.from('movimientos_cuenta_corriente').insert({
      profile_id: fixtures.acreedorConDatos.id,
      tipo: 'debe',
      monto: 80,
      moneda: 'USD',
      lote_id: fixtures.loteId,
      cuota_id: cuotaId,
      origen: 'cobro_cuota',
      detalle: 'Cuota 1 (test) — Lote E2E Test Lote',
      cargado_por: fixtures.admin.id,
    })
    expect(errorDebe).toBeNull()

    const saldo = page.locator('h2:has-text("Saldo") + p')

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/cuentas-corrientes/${fixtures.acreedorConDatos.id}`)
    await expect(saldo).toHaveText('80 USD')

    await page.getByRole('combobox', { name: 'Origen' }).selectOption('pago_directo_cliente')
    await page.locator('input[name="monto"]').fill('100')
    await page.locator('select[name="moneda"]').selectOption('USD')
    await page.locator('input[name="fechaEvento"]').fill('2026-08-19')
    await page.locator('input[name="deParteDe"]').fill('Cliente 1')
    await page.getByRole('button', { name: 'Agregar movimiento' }).click()

    await page.waitForURL(/\/admin\/cuentas-corrientes\/.+\?ok=1/)
    await expect(saldo).toHaveText('-20 USD')
    await expect(page.getByRole('cell', { name: 'Pago directo del cliente' })).toBeVisible()
    await expect(page.getByText('de: Cliente 1')).toBeVisible()
  })

  test('pago directo del cliente sin indicar de quién vino se rechaza en el servidor', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/cuentas-corrientes/${fixtures.acreedorConDatos.id}`)

    await page.getByRole('combobox', { name: 'Origen' }).selectOption('pago_directo_cliente')
    await page.locator('input[name="monto"]').fill('100')
    await page.locator('input[name="fechaEvento"]').fill('2026-08-19')
    await page.getByRole('button', { name: 'Agregar movimiento' }).click()

    await expect(
      page.getByText('Un pago directo del cliente necesita el nombre de quién lo hizo')
    ).toBeVisible()
  })

  test('cuota cobrada sin distribución cargada muestra el aviso, sin generar ningún Debe', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const cuotaId = fixtures.cuotaIds[1]

    const bucketPath = `pagos/${fixtures.loteId}/${Date.now()}-e2e-cc-sin-distribucion.pdf`
    await admin.storage.from('comprobantes').upload(bucketPath, COMPROBANTE_BYTES, {
      contentType: 'application/pdf',
    })

    await admin.from('pagos').insert({
      cliente_id: fixtures.cliente.id,
      lote_id: fixtures.loteId,
      monto: 1000,
      moneda: 'USD',
      comprobante_path: bucketPath,
      motivo: 'cuota',
      estado: 'confirmado',
      confirmado_admin_por: fixtures.admin.id,
      confirmado_admin_at: new Date().toISOString(),
      confirmado_acreedor_por: fixtures.acreedorConDatos.id,
      confirmado_acreedor_at: new Date().toISOString(),
    })
    await admin.from('cuotas').update({ saldo_pendiente: 0 }).eq('id', cuotaId)

    await login(page, fixtures.admin.email, fixtures.password)

    await page.goto('/admin/cuentas-corrientes')
    await expect(page.getByText(/cuota.*cobrada.*sin distribución cargada/i)).toBeVisible()

    await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)
    await expect(page.getByText(/ya se cobró.*pero todavía no tiene distribución cargada/)).toBeVisible()

    const { data: movimientos } = await admin
      .from('movimientos_cuenta_corriente')
      .select('id')
      .eq('cuota_id', cuotaId)
    expect(movimientos).toHaveLength(0)
  })
})
