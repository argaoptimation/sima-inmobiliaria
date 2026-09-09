import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

// Manzana y lote son columnas de TEXTO -- una manzana puede ser "B" -- pero
// se ordenan como números (migración 0060). Sin esto, la cartera de Nico
// aparece con la manzana 10 antes que la 2, que es como se ve una lista mal
// ordenada aunque cada fila sea correcta.
test.describe('Orden de manzana y lote', () => {
  let fixtures: TestFixtures
  const lotesCreados: string[] = []

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test.afterAll(async () => {
    if (lotesCreados.length) {
      await createAdminClient().from('lotes').delete().in('id', lotesCreados)
    }
  })

  test('la manzana 2 va antes que la 10, y las que no son números van al final', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const sufijo = Date.now()

    // El prefijo NO puede tener dígitos: "E2E-B" tiene un 2 adentro, así que
    // la columna generada le sacaba 2 y ordenaba como si fuera la manzana 2.
    // Lo detectó este mismo test en su primera corrida.
    const aCrear = [
      { manzana: 'QA10', numeroLote: '1' },
      { manzana: 'QA2', numeroLote: '1' },
      { manzana: 'QAB', numeroLote: '1' },
    ]

    for (const { manzana, numeroLote } of aCrear) {
      const { data, error } = await admin
        .from('lotes')
        .insert({
          // Lleva "E2E" en el nombre para que lo levante el script de
          // limpieza si este test se cae antes del afterAll.
          identificador: `E2E Orden ${manzana} ${sufijo}`,
          manzana,
          numero_lote: numeroLote,
          moneda: 'USD',
          estado: 'disponible',
          acreedor_id: fixtures.acreedorConDatos.id,
        })
        .select('id')
        .single()
      if (error) throw new Error(`No se pudo crear el lote de prueba: ${error.message}`)
      lotesCreados.push(data!.id)
    }

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes?q=QA')

    const manzanas = await page.locator('tbody tr td:nth-child(2)').allInnerTexts()
    const soloLasDePrueba = manzanas.filter((texto) => texto.startsWith('QA'))

    // 2 antes que 10 porque se ordenan por número; "B" al final porque no
    // tiene número y esas van después.
    expect(soloLasDePrueba).toEqual(['QA2', 'QA10', 'QAB'])
  })
})
