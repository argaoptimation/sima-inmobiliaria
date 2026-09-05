import { test, expect, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

// La base de e2e es compartida con otros specs de este mismo suite que a
// propósito dejan pagos pendientes sin confirmar (ej.
// pagos-acotados-por-acreedor.spec.ts) tocando el mismo lote/acreedor fijo
// de fixtures -- así que el contador real de "Pagos pendientes" NUNCA se
// puede asumir en 0 al arrancar cada test. En vez de eso, se lee el valor
// actual como línea de base y se comparan DELTAS antes/después de cada
// acción, sin importar cuánto haya quedado pendiente de antes.
// El contador dejó de ser texto "Pagos (N)" (27/08, ver NavAdmin.tsx) --
// ahora es un badge (<span class="...rounded-full...">) aparte dentro del
// link, que solo se renderiza si hay pendientes. `span.rounded-full` (no
// solo `span`) porque EnlaceBoton envuelve el contenido del link en OTRO
// span propio -- `locator('span')` a secas matchea los dos y tira
// strict-mode violation (que el .catch() de abajo escondía como "0").
async function leerContadorPagos(page: Page) {
  const badge = page.getByRole('link', { name: /^Pagos/ }).locator('span.rounded-full')
  const visible = await badge.isVisible().catch(() => false)
  if (!visible) return 0
  const texto = await badge.textContent()
  return texto ? Number(texto.trim()) : 0
}

// Nota: `ensureTestFixtures()` NO es memoizada -- cada llamada borra y
// vuelve a crear el lote (y el lote secundario) de prueba desde cero. Por
// eso este helper recibe `clienteId` como parámetro en lugar de volver a
// llamar `ensureTestFixtures()` acá adentro: si lo hiciera, invalidaría
// (borraría) el `loteId` que ya nos pasó el caller desde el `fixtures` de
// `beforeAll`, y el insert de abajo fallaría por foreign key.
async function crearPagoPendiente(
  nombreArchivo: string,
  loteId: string,
  clienteId: string,
  conComprobante: boolean
) {
  const admin = createAdminClient()

  let comprobantePath: string | null = null
  if (conComprobante) {
    comprobantePath = `pagos/${loteId}/${Date.now()}-${nombreArchivo}`
    const { error: errorUpload } = await admin.storage
      .from('comprobantes')
      .upload(comprobantePath, COMPROBANTE_BYTES, { contentType: 'application/pdf' })
    if (errorUpload) {
      throw new Error(`No se pudo subir el comprobante de prueba: ${errorUpload.message}`)
    }
  }

  const { data: pago, error } = await admin
    .from('pagos')
    .insert({
      cliente_id: clienteId,
      lote_id: loteId,
      monto: 100,
      moneda: 'USD',
      comprobante_path: comprobantePath,
      estado: 'pendiente',
    })
    .select('id')
    .single()

  if (error || !pago) {
    throw new Error(`No se pudo crear el pago de prueba: ${error?.message}`)
  }

  return pago.id as string
}

test.describe('Contador de pagos pendientes en la nav', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('el acreedor ve el contador de sus pagos pendientes, sube a 1 y baja al confirmar', async ({
    page,
  }) => {
    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto('/admin/lotes')
    const base = await leerContadorPagos(page)

    const nombreArchivo = `e2e-contador-${Date.now()}.pdf`
    await crearPagoPendiente(nombreArchivo, fixtures.loteId, fixtures.cliente.id, true)

    await page.goto('/admin/lotes')
    expect(await leerContadorPagos(page)).toBe(base + 1)

    await page.goto('/admin/pagos')
    // Los Server Actions de Next.js no escriben el pagoId en el atributo
    // `action` del <form> (queda el id codificado en un input oculto), así
    // que `form[action*="${pagoId}"]` nunca matchea nada. Ubicamos la fila
    // por el nombre de archivo único del comprobante, que sí aparece en el
    // href del link "Ver comprobante" — mismo patrón que ya usan
    // `monto-editable-confirmacion.spec.ts` y `pago-flujo-completo.spec.ts`.
    const fila = page
      .locator('[data-testid="tarjeta-pago"]')
      .filter({ has: page.locator(`a[href*="${nombreArchivo}"]`) })
    await fila.getByRole('button', { name: 'Confirmar mi parte' }).click()
    // Un submit de Server Action no cambia la URL (ya estamos en
    // /admin/pagos), así que esperar por waitForURL no sirve como señal de
    // que el servidor terminó de procesar el submit. Esperamos, en cambio, a
    // que la columna "Confirmado acreedor" refleje el resultado real.
    await expect(fila.locator('td').nth(9)).toHaveText('Sí')

    await page.goto('/admin/lotes')
    expect(await leerContadorPagos(page)).toBe(base)
  })

  test('un pago sin comprobante todavía no cuenta', async ({ page }) => {
    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto('/admin/lotes')
    const base = await leerContadorPagos(page)

    await crearPagoPendiente(
      `e2e-sin-comprobante-${Date.now()}.pdf`,
      fixtures.loteId,
      fixtures.cliente.id,
      false
    )

    await page.goto('/admin/lotes')
    expect(await leerContadorPagos(page)).toBe(base)
  })

  test('un acreedor no cuenta pagos de lotes que no son suyos', async ({ page }) => {
    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto('/admin/lotes')
    const base = await leerContadorPagos(page)

    await crearPagoPendiente(
      `e2e-lote-ajeno-${Date.now()}.pdf`,
      fixtures.loteSecundarioId,
      fixtures.cliente.id,
      true
    )

    await page.goto('/admin/lotes')
    expect(await leerContadorPagos(page)).toBe(base)
  })

  test('el admin cuenta pagos de cualquier lote', async ({ page }) => {
    await crearPagoPendiente(`e2e-admin-${Date.now()}.pdf`, fixtures.loteId, fixtures.cliente.id, true)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes')
    await expect(page.getByRole('link', { name: /^Pagos/ }).locator('span.rounded-full')).toBeVisible()
  })
})
