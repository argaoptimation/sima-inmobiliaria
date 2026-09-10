import { test, expect, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

// La documentacion del lote vive en un desplegable de la cabecera desde el
// 09/09 (mockup 2). Es un <details> nativo, asi que cada navegacion lo vuelve
// a dejar cerrado: hay que abrirlo despues de cada goto y de cada submit.
async function abrirDocumentacion(page: Page) {
  const desplegable = page.locator('details', {
    has: page.locator('summary', { hasText: 'Documentación del lote' }),
  })
  // Primero se espera a que la pagina termine de asentarse: despues de un
  // submit, la Server Action revalida y React vuelve a renderizar la
  // cabecera, asi que un click hecho antes de que llegue esa revalidacion se
  // pierde y el <details> queda cerrado igual. Y despues se reintenta, por
  // si aun asi llega tarde.
  await page.waitForLoadState('networkidle')
  await expect(async () => {
    if ((await desplegable.getAttribute('open')) === null) {
      await desplegable.locator('summary').click()
    }
    await expect(desplegable).toHaveAttribute('open', '', { timeout: 1500 })
  }).toPass({ timeout: 20_000 })
}

// Igual que verEnDocumentacion pero para el formulario de subida: abrir y
// comprobar tienen que pasar en el mismo reintento.
async function abrirParaSubir(page: Page) {
  await expect(async () => {
    await abrirDocumentacion(page)
    await expect(page.getByRole('button', { name: 'Subir documento' })).toBeVisible({
      timeout: 2000,
    })
  }).toPass({ timeout: 30_000 })
}

async function verEnDocumentacion(page: Page, texto: string, cantidad?: number) {
  await expect(async () => {
    await abrirDocumentacion(page)
    const fila = page.locator('li', { hasText: texto })
    if (cantidad === 0) {
      await expect(fila).toHaveCount(0, { timeout: 2000 })
    } else {
      await expect(fila.first()).toBeVisible({ timeout: 2000 })
    }
  }).toPass({ timeout: 30_000 })
}

test.describe('Documentos del lote', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('admin sube un documento y aparece en la sección con su link funcionando', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}`)
    await abrirParaSubir(page)

    await page.getByPlaceholder('Ej: Plano del lote').fill('Plano de prueba')
    await page.setInputFiles('[data-testid="archivo"]', {
      name: 'plano-test.pdf',
      mimeType: 'application/pdf',
      buffer: COMPROBANTE_BYTES,
    })
    await expect(page.locator('[data-testid="archivo"]')).toBeEnabled()
    await page.getByRole('button', { name: 'Subir documento' }).click()
    await page.waitForURL((url) => url.pathname === `/admin/lotes/${fixtures.loteId}`)
    await verEnDocumentacion(page, 'Plano de prueba')
    const fila = page.locator('li', { hasText: 'Plano de prueba' })
    await expect(fila.getByRole('link', { name: 'Plano de prueba' })).toBeVisible()
  })

  test('un acreedor puede subir un documento a su propio lote', async ({ page }) => {
    await login(page, fixtures.acreedorSecundario.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteSecundarioId}`)
    await abrirParaSubir(page)

    await page.getByPlaceholder('Ej: Plano del lote').fill('Documento del acreedor')
    await page.setInputFiles('[data-testid="archivo"]', {
      name: 'doc-acreedor.pdf',
      mimeType: 'application/pdf',
      buffer: COMPROBANTE_BYTES,
    })
    await expect(page.locator('[data-testid="archivo"]')).toBeEnabled()
    await page.getByRole('button', { name: 'Subir documento' }).click()
    await page.waitForURL((url) => url.pathname === `/admin/lotes/${fixtures.loteSecundarioId}`)
    await verEnDocumentacion(page, 'Documento del acreedor')
  })

  test('el rechazo de un acreedor sobre un lote que dejó de ser suyo ocurre en el servidor', async ({
    page,
  }) => {
    // Historial (ver Notas_Decisiones_SIMA.txt punto 48): `requireAdminSobreLote`
    // (lib/auth/require-admin.ts) tiene un problema de lectura "stale-after-write"
    // sin resolver de raíz a nivel de infraestructura (parece territorio de
    // configuración de Supabase, no de este código) -- un UPDATE concurrente (hecho
    // acá mismo, más abajo) podía no reflejarse todavía cuando la Server Action leía
    // `acreedor_id` para decidir si autoriza el request, dejando pasar a un acreedor
    // que ACABABA de dejar de serlo. Este test reproducía la carrera de forma
    // intermitente y por eso corría con `test.fail()`.
    // MITIGADO (19/08/2026): `requireAdminSobreLote` ahora descarta la primera
    // lectura (la más propensa a venir stale) y confía recién en una segunda,
    // después de una espera corta -- ver el comentario en require-admin.ts. No cierra
    // la causa raíz, pero esta reproducción puntual pasó a ser consistente (6/6 en
    // corridas repetidas), así que se saca el `test.fail()` y se vuelve a la
    // aserción normal. Si este test empieza a fallar de forma intermitente de nuevo,
    // es señal de que la espera de 250ms dejó de alcanzar en la práctica.

    const admin = createAdminClient()

    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}`)
    await abrirParaSubir(page)

    await page.getByPlaceholder('Ej: Plano del lote').fill('Intento tardío')
    await page.setInputFiles('[data-testid="archivo"]', {
      name: 'intento.pdf',
      mimeType: 'application/pdf',
      buffer: COMPROBANTE_BYTES,
    })
    await expect(page.locator('[data-testid="archivo"]')).toBeEnabled()

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
      await abrirParaSubir(page)
      // Espera a que el botón esté disponible (no "Cargando…") ANTES de
      // llenar el próximo documento -- esta página hace ~15 queries
      // secuenciales, así que la revalidación tras el submit anterior puede
      // tardar. React resetea el <form> automáticamente cuando esa
      // revalidación llega (form action exitosa) -- si se llena el próximo
      // documento mientras el botón todavía dice "Cargando…", ese reset
      // tardío borra lo recién tipeado y el submit siguiente sale vacío.
      await page.getByPlaceholder('Ej: Plano del lote').fill(nombre)
      await page.setInputFiles('[data-testid="archivo"]', {
        name: `${nombre}.pdf`,
        mimeType: 'application/pdf',
        buffer: COMPROBANTE_BYTES,
      })
      await expect(page.locator('[data-testid="archivo"]')).toBeEnabled()
      await page.getByRole('button', { name: 'Subir documento' }).click()
      await page.waitForURL((url) => url.pathname === `/admin/lotes/${fixtures.loteId}`)
    }
    // Confirma que el último submit realmente terminó (botón de vuelta a su
    // texto normal) antes de pasar a borrar -- mismo motivo que arriba.
    await abrirParaSubir(page)

    const filaA = page.locator('li', { hasText: 'Doc A' })
    await filaA.getByRole('button', { name: 'Eliminar' }).click()
    await page.waitForURL((url) => url.pathname === `/admin/lotes/${fixtures.loteId}`)

    await verEnDocumentacion(page, 'Doc A', 0)
    await verEnDocumentacion(page, 'Doc B')
  })

  test('un vendedor ve precio, acreedor y documentos en /info sin pasar por reservar', async ({ page }) => {
    const admin = createAdminClient()
    const filePath = `lotes/${fixtures.loteSecundarioId}/doc-info-test.pdf`
    await admin.storage
      .from('comprobantes')
      .upload(filePath, COMPROBANTE_BYTES, { contentType: 'application/pdf' })
    await admin.from('lote_documentos').insert({
      lote_id: fixtures.loteSecundarioId,
      path: filePath,
      descripcion: 'Plano visible para vendedor',
      subido_por: fixtures.admin.id,
    })

    await login(page, fixtures.vendedorLoteA.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteSecundarioId}/info`)

    await expect(page.getByText(/Acreedor: E2E Acreedor Secundario/)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Plano visible para vendedor' })).toBeVisible()
  })

  test('un cliente no puede acceder a /admin/lotes/[id]/info', async ({ page }) => {
    // `app/admin/layout.tsx` (que envuelve toda la sección /admin/*) ya
    // bloquea el rol `cliente` antes de que la página llegue a ejecutar
    // `requireAccesoParaReservar`: redirige a `/`, que a su vez manda a un
    // cliente logueado a `/portal-cliente` (no a `/login`, porque sí está
    // autenticado). La propiedad de seguridad bajo prueba -- que un cliente
    // no puede ver esta pantalla -- se mantiene igual.
    await login(page, fixtures.cliente.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteSecundarioId}/info`)
    await expect(page).toHaveURL(/\/portal-cliente/)
  })

  // El link pasó a ser un botón de ícono con tooltip (rediseño Stitch
  // 2026-09, MOCKUP 1): mismo destino, mismo permiso, y el nombre accesible
  // ya no arrastra la flecha que tenía cuando era texto.
  test('el acceso a "Ver documentación del lote" aparece en /admin/lotes para un vendedor', async ({ page }) => {
    await login(page, fixtures.vendedorLoteA.email, fixtures.password)
    // Con el listado paginado (10/09) hay que buscarlo: no hay garantía de
    // que caiga en la primera página.
    await page.goto('/admin/lotes?q=E2E+Lote+Secundario')

    const fila = page.locator('tr', { has: page.getByText('E2E Lote Secundario') })
    await expect(fila.getByRole('link', { name: 'Ver documentación del lote' })).toBeVisible()
  })
})
