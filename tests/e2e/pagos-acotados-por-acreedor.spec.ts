import { test, expect, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createAdminClient, ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login, logout } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)
const NOMBRE_COMPROBANTE = `e2e-pagos-acotados-${Date.now()}.pdf`

/**
 * El cliente registra un pago nuevo (cuota 1, que siempre tiene el link
 * "Pagar cuota" mientras su saldo siga pendiente) y sube un comprobante con
 * nombre único. Extraído para reusar entre los tests de este archivo que
 * necesitan un pago fresco propio.
 */
async function registrarPagoConComprobante(page: Page, fixtures: TestFixtures, nombreArchivo: string) {
  await login(page, fixtures.cliente.email, fixtures.password)
  await page.goto(`/portal-cliente/lotes/${fixtures.loteId}`)

  const filaCuota1 = page.locator('main table').nth(0).locator('tbody tr').nth(0)
  await filaCuota1.getByRole('link', { name: 'Pagar cuota' }).click()
  await page.waitForURL(/\/portal-cliente\/pagar\//)

  await page.getByPlaceholder('Monto transferido').fill('1')
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
}

// "E2E Test Lote" tiene acreedor_id = acreedorConDatos (ver test-data.ts).
// fixtures.acreedorSecundario es dueño de un lote distinto -- no tiene
// ninguna relación con "E2E Test Lote", así que no debería poder ver ni
// confirmar los pagos de ese cliente.
test.describe('Confirmación de pagos acotada al acreedor del lote', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('un acreedor sin relación con el lote no ve el pago del cliente en /admin/pagos', async ({
    page,
  }) => {
    await test.step('el cliente registra un pago y sube comprobante', async () => {
      await login(page, fixtures.cliente.email, fixtures.password)
      await page.goto(`/portal-cliente/lotes/${fixtures.loteId}`)

      const filaCuota1 = page.locator('main table').nth(0).locator('tbody tr').nth(0)
      await filaCuota1.getByRole('link', { name: 'Pagar cuota' }).click()
      await page.waitForURL(/\/portal-cliente\/pagar\//)

      await page.getByPlaceholder('Monto transferido').fill('1')
      await page.selectOption('select[name="moneda"]', 'USD')
      await page.getByRole('button', { name: 'Ya transferí' }).click()
      await page.waitForURL(/\/portal-cliente\/pagos\/.+\/comprobante$/)

      await page.setInputFiles('input[name="comprobante"]', {
        name: NOMBRE_COMPROBANTE,
        mimeType: 'application/pdf',
        buffer: COMPROBANTE_BYTES,
      })
      await page.getByRole('button', { name: 'Finalizar' }).click()
      await page.waitForURL(/\/portal-cliente$/)
    })

    await test.step('acreedorConDatos (dueño real del lote) SÍ ve el pago', async () => {
      await logout(page)
      await login(page, fixtures.acreedorConDatos.email, fixtures.password)
      await page.goto('/admin/pagos')

      await expect(page.locator(`a[href*="${NOMBRE_COMPROBANTE}"]`)).toBeVisible()
    })

    await test.step('acreedorSecundario (sin relación con el lote) NO ve el pago', async () => {
      await logout(page)
      await login(page, fixtures.acreedorSecundario.email, fixtures.password)
      await page.goto('/admin/pagos')

      await expect(page.locator(`a[href*="${NOMBRE_COMPROBANTE}"]`)).toHaveCount(0)
    })
  })

  test('un lote sin acreedor vinculado muestra un aviso rojo bien visible en /admin/pagos', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const nombreComprobante = `e2e-sin-acreedor-${Date.now()}.pdf`

    try {
      await test.step('el lote de prueba se queda momentáneamente sin acreedor asignado', async () => {
        const { error } = await admin
          .from('lotes')
          .update({ acreedor_id: null })
          .eq('identificador', 'E2E Test Lote')

        expect(error).toBeNull()
      })

      await test.step('el cliente registra un pago nuevo y sube comprobante', async () => {
        await registrarPagoConComprobante(page, fixtures, nombreComprobante)
      })

      await test.step('el admin ve el aviso rojo de lote sin acreedor vinculado', async () => {
        await logout(page)
        await login(page, fixtures.admin.email, fixtures.password)
        await page.goto('/admin/pagos')

        const fila = page.locator('tr', { has: page.locator(`a[href*="${nombreComprobante}"]`) })
        await expect(fila.getByText('⚠ Lote sin acreedor vinculado')).toBeVisible()
      })
    } finally {
      // Restauramos el acreedor_id original del lote de prueba: otros specs
      // (cuenta-cobro.spec.ts, visibilidad-acreedor.spec.ts, el primer test
      // de este mismo archivo) asumen que "E2E Test Lote" tiene un acreedor
      // vinculado. Usamos try/finally para que esto corra incluso si alguna
      // aserción de arriba falla.
      await admin
        .from('lotes')
        .update({ acreedor_id: fixtures.acreedorConDatos.id })
        .eq('identificador', 'E2E Test Lote')
    }
  })

  test('el rechazo de confirmación ocurre en el servidor, no solo en el filtro del render inicial', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const nombreComprobante = `e2e-rechazo-servidor-${Date.now()}.pdf`

    try {
      await test.step('el lote de prueba pasa temporalmente a manos de acreedorSecundario', async () => {
        const { error } = await admin
          .from('lotes')
          .update({ acreedor_id: fixtures.acreedorSecundario.id })
          .eq('identificador', 'E2E Test Lote')

        expect(error).toBeNull()
      })

      await test.step('el cliente registra un pago nuevo dedicado a este test', async () => {
        await registrarPagoConComprobante(page, fixtures, nombreComprobante)
      })

      const fila = page.locator('tr', { has: page.locator(`a[href*="${nombreComprobante}"]`) })

      await test.step('acreedorSecundario ve el pago mientras es el acreedor vigente del lote', async () => {
        await logout(page)
        await login(page, fixtures.acreedorSecundario.email, fixtures.password)
        await page.goto('/admin/pagos')

        await expect(fila).toBeVisible()
      })

      await test.step('el lote cambia de acreedor mientras la página ya está renderizada en el browser', async () => {
        // Maniobra clave: la relación cambia DESPUÉS de que el formulario ya
        // se cargó en el browser de acreedorSecundario. El filtro del render
        // inicial ya no protege nada en este momento -- si la única barrera
        // fuera esa, este submit se colaría.
        const { error } = await admin
          .from('lotes')
          .update({ acreedor_id: fixtures.acreedorConDatos.id })
          .eq('identificador', 'E2E Test Lote')

        expect(error).toBeNull()
      })

      await test.step('el submit, ya obsoleto, es rechazado por el server action', async () => {
        await fila.getByRole('button', { name: 'Confirmar mi parte' }).click()
        await page.waitForURL(/\/admin\/pagos/)

        // El rechazo real pasó en el servidor al momento del submit (no en
        // el render inicial): la Server Action redirige con un aviso.
        await expect(page.getByText(/No sos el acreedor vinculado a este lote/)).toBeVisible()
      })

      await test.step('el pago sigue sin confirmación del lado del acreedor', async () => {
        // acreedorSecundario ya no tiene relación con el lote (se la
        // devolvimos a acreedorConDatos un paso atrás), así que ya no ve
        // este pago en su propia vista. Verificamos el estado real desde la
        // vista del admin, que ve todos los pagos sin importar el acreedor.
        await logout(page)
        await login(page, fixtures.admin.email, fixtures.password)
        await page.goto('/admin/pagos')

        const filaAdmin = page.locator('tr', { has: page.locator(`a[href*="${nombreComprobante}"]`) })
        await expect(filaAdmin.locator('td').nth(5)).toHaveText('No')
      })
    } finally {
      // Probablemente ya quedó así por la maniobra de arriba, pero
      // aseguramos el estado por si el test falló antes de llegar ahí.
      await admin
        .from('lotes')
        .update({ acreedor_id: fixtures.acreedorConDatos.id })
        .eq('identificador', 'E2E Test Lote')
    }
  })
})
