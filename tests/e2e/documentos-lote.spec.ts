import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

test.describe('Documentos del lote', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('admin sube un documento y aparece en la sección con su link funcionando', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}`)

    await page.getByPlaceholder('Ej: Plano del lote').fill('Plano de prueba')
    await page.setInputFiles('input[name="archivo"]', {
      name: 'plano-test.pdf',
      mimeType: 'application/pdf',
      buffer: COMPROBANTE_BYTES,
    })
    await page.getByRole('button', { name: 'Subir documento' }).click()
    await page.waitForURL(new RegExp(`/admin/lotes/${fixtures.loteId}$`))

    const fila = page.locator('li', { hasText: 'Plano de prueba' })
    await expect(fila).toBeVisible()
    await expect(fila.getByRole('link', { name: 'Plano de prueba' })).toBeVisible()
  })

  test('un acreedor puede subir un documento a su propio lote', async ({ page }) => {
    await login(page, fixtures.acreedorSecundario.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteSecundarioId}`)

    await page.getByPlaceholder('Ej: Plano del lote').fill('Documento del acreedor')
    await page.setInputFiles('input[name="archivo"]', {
      name: 'doc-acreedor.pdf',
      mimeType: 'application/pdf',
      buffer: COMPROBANTE_BYTES,
    })
    await page.getByRole('button', { name: 'Subir documento' }).click()
    await page.waitForURL(new RegExp(`/admin/lotes/${fixtures.loteSecundarioId}$`))

    await expect(page.locator('li', { hasText: 'Documento del acreedor' })).toBeVisible()
  })

  test('el rechazo de un acreedor sobre un lote que dejó de ser suyo ocurre en el servidor', async ({
    page,
  }) => {
    const admin = createAdminClient()

    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}`)

    await page.getByPlaceholder('Ej: Plano del lote').fill('Intento tardío')
    await page.setInputFiles('input[name="archivo"]', {
      name: 'intento.pdf',
      mimeType: 'application/pdf',
      buffer: COMPROBANTE_BYTES,
    })

    try {
      // Maniobra clave: el lote cambia de acreedor DESPUÉS de que el
      // formulario ya está renderizado en el browser -- el filtro de
      // render inicial ya no protege nada en este momento.
      await admin
        .from('lotes')
        .update({ acreedor_id: fixtures.acreedorSecundario.id })
        .eq('id', fixtures.loteId)

      await page.getByRole('button', { name: 'Subir documento' }).click()
      await page.waitForURL(/\/admin\/lotes/)

      const { count } = await admin
        .from('lote_documentos')
        .select('id', { count: 'exact', head: true })
        .eq('lote_id', fixtures.loteId)
        .eq('descripcion', 'Intento tardío')
      expect(count).toBe(0)
    } finally {
      await admin
        .from('lotes')
        .update({ acreedor_id: fixtures.acreedorConDatos.id })
        .eq('id', fixtures.loteId)
    }
  })

  test('admin elimina un documento y el resto queda intacto', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}`)

    for (const nombre of ['Doc A', 'Doc B']) {
      await page.getByPlaceholder('Ej: Plano del lote').fill(nombre)
      await page.setInputFiles('input[name="archivo"]', {
        name: `${nombre}.pdf`,
        mimeType: 'application/pdf',
        buffer: COMPROBANTE_BYTES,
      })
      await page.getByRole('button', { name: 'Subir documento' }).click()
      await page.waitForURL(new RegExp(`/admin/lotes/${fixtures.loteId}$`))
    }

    const filaA = page.locator('li', { hasText: 'Doc A' })
    await filaA.getByRole('button', { name: 'Eliminar' }).click()
    await page.waitForURL(new RegExp(`/admin/lotes/${fixtures.loteId}$`))

    await expect(page.locator('li', { hasText: 'Doc A' })).toHaveCount(0)
    await expect(page.locator('li', { hasText: 'Doc B' })).toBeVisible()
  })
})
