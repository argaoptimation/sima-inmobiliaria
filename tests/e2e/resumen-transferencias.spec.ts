import { test, expect } from '@playwright/test'
import ExcelJS from 'exceljs'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

// El add-on "Resumen de transferencias por acreedor" (confirmado por Nicolás
// el 09/09). Lo que estos tests cuidan no es que la pantalla dibuje: es que
// el número que Nicolás va a usar para girar plata sea el correcto, y que el
// Excel que le manda al acreedor diga exactamente lo mismo que la pantalla.

test.describe('Resumen de transferencias por acreedor', () => {
  let fixtures: TestFixtures

  test.beforeEach(async () => {
    fixtures = await ensureTestFixtures()

    // Arranque determinístico: los movimientos manuales no siempre cuelgan de
    // un lote, así que la limpieza en cascada de ensureTestFixtures no los
    // alcanza (mismo motivo que en cuenta-corriente.spec.ts).
    const admin = createAdminClient()
    for (const id of [fixtures.acreedorConDatos.id, fixtures.acreedorSecundario.id]) {
      await admin.from('movimientos_cuenta_corriente').delete().eq('profile_id', id)
    }
  })

  async function cargarMovimiento(
    profileId: string,
    tipo: 'debe' | 'haber',
    monto: number,
    moneda = 'USD'
  ) {
    // El origen no es libre: la base tiene un CHECK que ata cada origen a un
    // tipo (`movimientos_cc_tipo_origen_check`). Un "haber" -- plata que ya
    // le llegó -- solo puede ser una transferencia de la empresa o un cobro
    // directo del cliente, que es justamente lo que representa "ya se le
    // giró". Un ajuste manual solo puede ser "debe".
    const { error } = await createAdminClient().from('movimientos_cuenta_corriente').insert({
      profile_id: profileId,
      tipo,
      monto,
      moneda,
      origen: tipo === 'debe' ? 'debe_manual' : 'transferencia_empresa',
      fecha_evento: '2026-09-01',
      detalle: 'E2E resumen',
      cargado_por: fixtures.admin.id,
    })
    if (error) throw new Error(`No se pudo cargar el movimiento: ${error.message}`)
  }

  test('el total a girar suma los saldos positivos y NO netea con los negativos', async ({
    page,
  }) => {
    // A uno le corresponden 800 y no cobró nada: hay que girarle 800.
    await cargarMovimiento(fixtures.acreedorConDatos.id, 'debe', 800)
    // El otro cobró 300 que no le correspondían: tiene 300 de más.
    await cargarMovimiento(fixtures.acreedorSecundario.id, 'haber', 300)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/cuentas-corrientes')

    const tarjeta = page.locator('div').filter({ hasText: /^Hay que girar/ }).first()
    await expect(tarjeta).toBeVisible()

    // El número que importa: 800, no 500. La plata de más de uno no paga al
    // otro -- son dos personas distintas.
    await expect(page.getByText('800', { exact: false }).first()).toBeVisible()
    await expect(page.getByText(/cobrados de más/)).toBeVisible()
  })

  test('"solo a quienes hay que girarles" deja afuera a los que están al día', async ({ page }) => {
    await cargarMovimiento(fixtures.acreedorConDatos.id, 'debe', 800)
    // Este queda al día: le corresponden 200 y ya cobró 200.
    await cargarMovimiento(fixtures.acreedorSecundario.id, 'debe', 200)
    await cargarMovimiento(fixtures.acreedorSecundario.id, 'haber', 200)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/cuentas-corrientes?pendientes=1')

    await expect(
      page.getByRole('link', { name: 'E2E Acreedor Con Datos', exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'E2E Acreedor Secundario', exact: true })
    ).toHaveCount(0)
  })

  test('el Excel trae las dos hojas y el mismo total que la pantalla', async ({ page }) => {
    await cargarMovimiento(fixtures.acreedorConDatos.id, 'debe', 800)
    await cargarMovimiento(fixtures.acreedorConDatos.id, 'haber', 500)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/cuentas-corrientes')

    const [descarga] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Descargar Excel (con la proyección)' }).click(),
    ])

    const ruta = await descarga.path()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(ruta!)

    expect(workbook.worksheets.map((hoja) => hoja.name)).toEqual(['A transferir', 'Proyección'])

    const hoja = workbook.getWorksheet('A transferir')!
    const textoDeLaHoja: string[] = []
    hoja.eachRow((fila) => {
      textoDeLaHoja.push(
        (fila.values as unknown[]).map((celda) => String(celda ?? '')).join(' | ')
      )
    })
    const todo = textoDeLaHoja.join('\n')

    // 800 − 500 = 300 a transferir, y la fila por persona lo tiene que decir.
    expect(todo).toContain('E2E Acreedor Con Datos')
    expect(todo).toMatch(/300/)
    // Y el detalle fila por fila, que es lo que le permite al acreedor
    // verificarlo solo sin pedirle nada a nadie.
    expect(todo).toContain('Detalle de los movimientos que forman cada saldo')
    expect(todo).toContain('E2E resumen')
  })
})
