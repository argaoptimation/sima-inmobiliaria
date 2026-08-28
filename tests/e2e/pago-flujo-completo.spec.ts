import { test, expect, Page } from '@playwright/test'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { createAdminClient, ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login, logout } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

// Esta app corre contra una base compartida con datos reales de otros tests
// manuales (¡ya vimos un pago real de 1500 USD confirmado en /admin/pagos al
// correr esto la primera vez!). Un monto no alcanza para identificar "la"
// fila del pago que generó este test de forma inequívoca, así que subimos el
// comprobante con un nombre de archivo único por corrida y ubicamos la fila
// por ese nombre (aparece en el href del link "Ver comprobante").
const NOMBRE_COMPROBANTE = `e2e-comprobante-${Date.now()}.pdf`

function filaPorComprobante(page: Page) {
  return page
    .locator('main table tbody tr')
    .filter({ has: page.locator(`a[href*="${NOMBRE_COMPROBANTE}"]`) })
}

// Camino feliz completo, replicando lo que el dueño del producto verificó a
// mano: cliente paga una cuota (de más, para forzar el derrame FIFO a la
// cuota siguiente), sube el comprobante, acreedor y admin confirman cada uno
// su parte, y el saldo de las cuotas queda imputado correctamente.
test.describe('Flujo completo de pago con confirmación cruzada', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  // El pago real que este test confirma vía el flujo completo no lo borra
  // nadie más: pagos.lote_id no tiene "on delete cascade", así que si queda
  // colgado puede bloquear el DELETE de "E2E Test Lote" en el
  // ensureTestFixtures() de la PRÓXIMA corrida (ya se vio romper así en
  // otro spec -- ver commit de cuentas-externas.spec.ts).
  test.afterAll(async () => {
    const admin = createAdminClient()
    await admin.from('pagos').delete().eq('cliente_id', fixtures.cliente.id)
  })

  test('cliente paga de más, sube comprobante, acreedor y admin confirman, FIFO reparte el saldo', async ({
    page,
  }) => {
    // 1. Login como cliente de prueba y estado inicial del portal.
    await test.step('cliente ve sus 3 cuotas en estado normal', async () => {
      await login(page, fixtures.cliente.email, fixtures.password)
      await page.goto(`/portal-cliente/lotes/${fixtures.loteId}`)

      await expect(page.getByRole('heading', { name: 'E2E Test Lote' })).toBeVisible()
      await expect(page.getByText('Al día', { exact: true })).toBeVisible()

      const filasCuotas = page.locator('main table').nth(0).locator('tbody tr')
      await expect(filasCuotas).toHaveCount(3)

      for (let i = 0; i < 3; i++) {
        // toContainText, no toHaveText: si hay cotización del día cargada,
        // la celda también muestra el equivalente en ARS debajo (25/08).
        await expect(filasCuotas.nth(i).locator('td').nth(2)).toContainText('1000 USD')
        await expect(filasCuotas.nth(i).locator('td').nth(3)).toContainText('1000 USD')
      }
    })

    // 2. Pagar la cuota 1 con un monto mayor al de la cuota (1500 > 1000) para
    // ejercitar el derrame FIFO hacia la cuota 2.
    await test.step('cliente registra un pago de 1500 USD sobre la cuota 1', async () => {
      const filaCuota1 = page.locator('main table').nth(0).locator('tbody tr').nth(0)
      await filaCuota1.getByRole('link', { name: 'Pagar cuota' }).click()
      await page.waitForURL(/\/portal-cliente\/pagar\//)

      await page.getByPlaceholder('Monto transferido').fill('1500')
      await page.selectOption('select[name="moneda"]', 'USD')
      await page.getByRole('button', { name: 'Ya transferí' }).click()

      await page.waitForURL(/\/portal-cliente\/pagos\/.+\/comprobante$/)
    })

    // 3. Subir el comprobante (fixture local, no hace falta que sea un PDF
    // "real" - solo bytes válidos en disco para setInputFiles).
    await test.step('cliente sube el comprobante', async () => {
      await page.setInputFiles('[data-testid="comprobante"]', {
        name: NOMBRE_COMPROBANTE,
        mimeType: 'application/pdf',
        buffer: COMPROBANTE_BYTES,
      })
      // La subida directa a Storage ocurre en cuanto se elige el archivo
      // (CampoArchivoDirecto), antes de tocar "Finalizar" -- hay que
      // esperar a que termine (el input queda deshabilitado mientras sube)
      // o el submit se bloquea en silencio por el campo oculto requerido
      // que todavía está vacío.
      await expect(page.locator('[data-testid="comprobante"]')).toBeEnabled()
      await page.getByRole('button', { name: 'Finalizar' }).click()
      await page.waitForURL(/\/portal-cliente$/)
    })

    // 4. El pago recién creado debe verse en "Mis pagos" sin advertencia de
    // comprobante faltante.
    await test.step('el pago aparece en "Mis pagos" sin advertencia de comprobante', async () => {
      await page.goto(`/portal-cliente/lotes/${fixtures.loteId}`)
      const filaPago = filaPorComprobante(page)
      await expect(filaPago).toBeVisible()
      await expect(filaPago).toContainText('1500')
      await expect(filaPago).not.toContainText('Falta subir comprobante')
      await expect(filaPago.getByRole('link', { name: 'Ver comprobante' })).toBeVisible()
    })

    // 5. Cambio de usuario: esta app no tiene logout explícito, así que
    // limpiamos cookies del contexto y volvemos a loguear (ver utils/login.ts).
    await test.step('login como acreedor y confirmación de su parte', async () => {
      await logout(page)
      await login(page, fixtures.acreedorConDatos.email, fixtures.password)
      await page.goto('/admin/pagos')

      const filaPago = filaPorComprobante(page)
      await expect(filaPago.getByRole('link', { name: 'Ver comprobante' })).toBeVisible()

      await filaPago.getByRole('button', { name: 'Confirmar mi parte' }).click()

      // índice 9: Fecha, Lote, Cliente, Acreedor, Motivo, Medio, Monto,
      // Comprobante, Estado, Confirmado acreedor.
      await expect(filaPago.locator('td').nth(9)).toHaveText('Sí')
    })

    // 6. Admin ve que el acreedor ya confirmó y confirma su propia parte, lo
    // que dispara la imputación FIFO en el servidor.
    await test.step('login como admin, ve confirmación del acreedor y confirma su parte', async () => {
      await logout(page)
      await login(page, fixtures.admin.email, fixtures.password)
      await page.goto('/admin/pagos')

      const filaPago = filaPorComprobante(page)
      await expect(filaPago.locator('td').nth(9)).toHaveText('Sí') // Confirmado acreedor

      await filaPago.getByRole('button', { name: 'Confirmar mi parte' }).click()

      // índice 8: Fecha, Lote, Cliente, Acreedor, Motivo, Medio, Monto, Comprobante, Estado.
      await expect(filaPago.locator('td').nth(8)).toHaveText('confirmado')
    })

    // 7. La aserción central del test: el FIFO de 1500 sobre cuota 1 (saldo
    // 1000) deja la cuota 1 en 0 y derrama 500 a la cuota 2.
    await test.step('el saldo de las cuotas quedó imputado correctamente (FIFO)', async () => {
      await logout(page)
      await login(page, fixtures.cliente.email, fixtures.password)
      await page.goto(`/portal-cliente/lotes/${fixtures.loteId}`)

      const filasCuotas = page.locator('main table').nth(0).locator('tbody tr')
      await expect(filasCuotas.nth(0).locator('td').nth(3)).toContainText('0 USD') // cuota 1
      await expect(filasCuotas.nth(1).locator('td').nth(3)).toContainText('500 USD') // cuota 2
      await expect(filasCuotas.nth(2).locator('td').nth(3)).toContainText('1000 USD') // cuota 3, intacta
    })
  })
})
