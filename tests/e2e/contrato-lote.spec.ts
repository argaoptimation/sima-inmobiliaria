import { test, expect } from '@playwright/test'
import PizZip from 'pizzip'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

const NOMBRE_LOTEO = 'E2E Loteo Contrato'

// Arma un .docx mínimo a partir de un texto cualquiera -- mismo mecanismo
// (PizZip a mano) usado para construir la plantilla modelo real, ver
// Notas_Decisiones_SIMA.txt punto 89.
function docxConTexto(texto: string): Buffer {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body><w:p><w:r><w:t xml:space="preserve">${texto}</w:t></w:r></w:p></w:body>
</w:document>`
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

  const zip = new PizZip()
  zip.file('[Content_Types].xml', contentTypesXml)
  zip.file('_rels/.rels', rootRelsXml)
  zip.file('word/document.xml', documentXml)
  return zip.generate({ type: 'nodebuffer' })
}

// Placeholders reales del esquema de lib/contratos/armar-datos-contrato.ts.
function plantillaDocx(): Buffer {
  return docxConTexto(
    'Cliente: {cliente_nombre}. Lote {lote_numero} ({lote_numero_letras}), manzana {lote_manzana} ({lote_manzana_letras}), superficie {lote_superficie_m2} m2 ({lote_superficie_m2_letras} metros cuadrados). Cuenta en rentas {lote_cuenta_rentas}. Precio total {precio_total_letras} ({precio_total} {moneda_abrev}).'
  )
}

test.describe('Generación de contrato por loteo (25/08)', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()

    // Limpieza: por si quedó un loteo de una corrida anterior con el mismo
    // nombre (mismo criterio que el lote secundario en test-data.ts).
    const admin = createAdminClient()
    await admin.from('loteos').delete().eq('nombre', NOMBRE_LOTEO)
  })

  test('subir plantilla al loteo + cargar datos legales + generar contrato reemplaza todos los placeholders', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)

    // 1) Crear el loteo y subirle la plantilla.
    await page.goto('/admin/loteos')
    await page.getByPlaceholder('Ej: Loteo San Martín').fill(NOMBRE_LOTEO)
    await page.getByRole('button', { name: 'Crear loteo' }).click()
    await page.waitForURL(/\/admin\/loteos/)

    const filaLoteo = page.locator('tr', { hasText: NOMBRE_LOTEO })
    await expect(filaLoteo).toBeVisible()
    await filaLoteo.locator('input[type="file"]').setInputFiles({
      name: 'plantilla-modelo.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: plantillaDocx(),
    })
    // Sube directo a Storage en cuanto se elige -- esperar a que termine o
    // el submit se bloquea en silencio (campo oculto todavía vacío).
    await expect(filaLoteo.locator('input[type="file"]')).toBeEnabled()
    await filaLoteo.getByRole('button', { name: 'Subir' }).click()
    await page.waitForURL(/\/admin\/loteos\?ok=/)
    await expect(page.locator('tr', { hasText: NOMBRE_LOTEO })).toContainText('plantilla-modelo.docx')

    // 2) Mover el lote de prueba a este loteo (reasignación en bloque).
    await page.goto('/admin/loteos?q=E2E+Test+Lote')
    await page.locator('input[name="loteIds"]').check()
    await page.selectOption('select[name="loteoDestino"]', { label: NOMBRE_LOTEO })
    await page.getByRole('button', { name: 'Mover seleccionados' }).click()
    await page.waitForURL(/\/admin\/loteos\?ok=/)

    // 3) Cargar los datos legales del lote (Datos generales).
    await page.goto(`/admin/lotes/${fixtures.loteId}`)
    const formDatosGenerales = page.locator('form').filter({ has: page.locator('input[name="numeroLote"]') })
    await formDatosGenerales.locator('input[name="precioTotal"]').fill('37000')
    await formDatosGenerales.locator('input[name="numeroLote"]').fill('7')
    await formDatosGenerales.locator('input[name="manzana"]').fill('5')
    await formDatosGenerales.locator('input[name="superficieM2"]').fill('350')
    await formDatosGenerales.locator('input[name="cuentaRentas"]').fill('55-9999')
    await formDatosGenerales.getByRole('button', { name: 'Guardar' }).click()
    await page.waitForURL(new RegExp(`/admin/lotes/${fixtures.loteId}`))

    // 4) Generar el contrato.
    await expect(page.getByRole('heading', { name: 'Contrato' })).toBeVisible()
    await page.getByRole('button', { name: 'Generar contrato' }).click()
    await page.waitForURL(/\?ok=Contrato/)

    const filaContrato = page.locator('li', { hasText: 'Contrato generado' })
    await expect(filaContrato).toBeVisible()

    // 5) Descargar el .docx generado y verificar que TODOS los placeholders
    // se reemplazaron por los datos reales -- ningún {placeholder} suelto.
    const link = filaContrato.getByRole('link')
    const href = await link.getAttribute('href')
    expect(href).toBeTruthy()

    const respuesta = await page.request.get(href!)
    expect(respuesta.ok()).toBe(true)
    const buffer = await respuesta.body()

    const zip = new PizZip(buffer)
    const textoDocumento = zip
      .file('word/document.xml')!
      .asText()
      .replace(/<[^>]+>/g, '')

    expect(textoDocumento).not.toMatch(/\{[a-z_]+\}/)
    expect(textoDocumento).toContain('Cliente: E2E Cliente')
    expect(textoDocumento).toContain('Lote 7 (siete)')
    expect(textoDocumento).toContain('manzana 5 (cinco)')
    expect(textoDocumento).toContain('superficie 350 m2 (trescientos cincuenta metros cuadrados)')
    expect(textoDocumento).toContain('Cuenta en rentas 55-9999')
    expect(textoDocumento).toContain('Precio total treinta y siete mil dólares estadounidenses (37000 usd)')
  })

  test('un cobrador no ve la sección Contrato ni la de Datos legales', async ({ page }) => {
    await login(page, fixtures.cobrador.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}`)

    await expect(page.getByRole('heading', { name: 'Contrato' })).not.toBeVisible()
    await expect(page.locator('input[name="numeroLote"]')).toHaveCount(0)
  })

  test('subir una plantilla con un placeholder no reconocido avisa pero no bloquea la subida', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)

    const admin = createAdminClient()
    await admin.from('loteos').delete().eq('nombre', `${NOMBRE_LOTEO} Con Typo`)

    await page.goto('/admin/loteos')
    await page.getByPlaceholder('Ej: Loteo San Martín').fill(`${NOMBRE_LOTEO} Con Typo`)
    await page.getByRole('button', { name: 'Crear loteo' }).click()
    await page.waitForURL(/\/admin\/loteos/)

    const filaLoteo = page.locator('tr', { hasText: `${NOMBRE_LOTEO} Con Typo` })
    await filaLoteo.locator('input[type="file"]').setInputFiles({
      name: 'plantilla-con-typo.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      // {cliente_nombree} con doble "e" al final -- typo deliberado, no
      // está en la tabla de placeholders conocidos.
      buffer: docxConTexto('Hola {cliente_nombree}.'),
    })
    await expect(filaLoteo.locator('input[type="file"]')).toBeEnabled()
    await filaLoteo.getByRole('button', { name: 'Subir' }).click()
    await page.waitForURL(/\/admin\/loteos\?/)

    // No bloquea: la plantilla queda guardada de todas formas.
    await expect(page.locator('tr', { hasText: `${NOMBRE_LOTEO} Con Typo` })).toContainText(
      'plantilla-con-typo.docx'
    )
    // Pero avisa, resaltando el placeholder exacto que no reconoce.
    await expect(page.getByText(/no reconocemos/)).toBeVisible()
    await expect(page.locator('code', { hasText: '{cliente_nombree}' })).toBeVisible()

    await admin.from('loteos').delete().eq('nombre', `${NOMBRE_LOTEO} Con Typo`)
  })
})
