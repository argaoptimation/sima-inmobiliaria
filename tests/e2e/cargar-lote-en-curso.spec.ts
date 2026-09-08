import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

// Alta de un lote que ya estaba vendido y a mitad de pagar antes de usar la
// plataforma (07/09). Lo que estos tests cuidan no es que el formulario
// guarde: es que la plata cobrada ANTES del sistema no se cuele como
// cobranza propia y ensucie las cuentas corrientes.
test.describe('Cargar un lote ya vendido', () => {
  let fixtures: TestFixtures
  const lotesCreados: string[] = []
  const clientesCreados: string[] = []

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test.afterAll(async () => {
    const admin = createAdminClient()
    for (const identificador of lotesCreados) {
      const { data: lote } = await admin
        .from('lotes')
        .select('id')
        .eq('identificador', identificador)
        .maybeSingle()
      if (lote) await admin.from('lotes').delete().eq('id', lote.id)
    }
    for (const email of clientesCreados) {
      const { data: perfil } = await admin
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle()
      if (perfil) await admin.auth.admin.deleteUser(perfil.id)
    }
  })

  async function cargarLote(
    page: import('@playwright/test').Page,
    datos: {
      identificador: string
      clienteEmail: string
      cuotasYaPagadas: string
      cuotasPendientes: string
      montoCuota?: string
      fechaProximaCuota?: string
    }
  ) {
    await page.goto('/admin/lotes/cargar-en-curso')
    await page.locator('input[name="identificador"]').fill(datos.identificador)
    await page.locator('input[name="ubicacion"]').fill('Ubicación E2E')
    await page.locator('input[name="precioTotal"]').fill('30000')
    await page.locator('input[name="acreedorNombre"]').fill('E2E Acreedor Con Datos')
    await page.locator('input[name="clienteNombre"]').fill('Comprador Viejo E2E')
    await page.locator('input[name="clienteEmail"]').fill(datos.clienteEmail)
    await page.locator('input[name="cuotasYaPagadas"]').fill(datos.cuotasYaPagadas)
    await page.locator('input[name="cuotasPendientes"]').fill(datos.cuotasPendientes)
    await page.locator('input[name="montoCuota"]').fill(datos.montoCuota ?? '500')
    await page.locator('input[name="fechaProximaCuota"]').fill(datos.fechaProximaCuota ?? '2026-10-10')
    await page.getByRole('button', { name: 'Cargar lote vendido' }).click()
  }

  test('carga el lote vendido, el comprador y las cuotas de una sola vez', async ({ page }) => {
    const identificador = `E2E En Curso ${Date.now()}`
    const clienteEmail = `comprador.viejo.${Date.now()}@sima-e2e.invalid`
    lotesCreados.push(identificador)
    clientesCreados.push(clienteEmail)

    await login(page, fixtures.admin.email, fixtures.password)
    await cargarLote(page, {
      identificador,
      clienteEmail,
      cuotasYaPagadas: '18',
      cuotasPendientes: '42',
    })

    // Cae directo en la distribución, que es lo único que le queda por
    // hacer al admin después de cargarlo.
    await page.waitForURL(/\/distribucion/)

    const admin = createAdminClient()
    const { data: lote } = await admin
      .from('lotes')
      .select('id, estado, cliente_id, cantidad_cuotas, fecha_primera_cuota')
      .eq('identificador', identificador)
      .single()

    expect(lote!.estado).toBe('vendido')
    expect(lote!.cantidad_cuotas).toBe(60)
    // La cuota 1 venció 18 meses antes de la próxima a pagar.
    expect(lote!.fecha_primera_cuota).toBe('2025-04-10')

    const { data: cuotas } = await admin
      .from('cuotas')
      .select('numero, saldo_pendiente, migrada, fecha_vencimiento')
      .eq('lote_id', lote!.id)
      .order('numero')

    expect(cuotas).toHaveLength(60)

    const pagadas = cuotas!.filter((cuota) => cuota.migrada)
    expect(pagadas).toHaveLength(18)
    expect(pagadas.every((cuota) => Number(cuota.saldo_pendiente) === 0)).toBe(true)

    const pendientes = cuotas!.filter((cuota) => !cuota.migrada)
    expect(pendientes).toHaveLength(42)
    expect(pendientes.every((cuota) => Number(cuota.saldo_pendiente) === 500)).toBe(true)
    expect(pendientes[0].numero).toBe(19)
    expect(pendientes[0].fecha_vencimiento).toBe('2026-10-10')
  })

  test('la plata vieja no entra a la contabilidad: sin pagos, sin imputaciones, sin cuenta corriente', async ({
    page,
  }) => {
    const identificador = `E2E En Curso Sin Plata ${Date.now()}`
    const clienteEmail = `comprador.sinplata.${Date.now()}@sima-e2e.invalid`
    lotesCreados.push(identificador)
    clientesCreados.push(clienteEmail)

    await login(page, fixtures.admin.email, fixtures.password)
    await cargarLote(page, {
      identificador,
      clienteEmail,
      cuotasYaPagadas: '10',
      cuotasPendientes: '5',
    })
    await page.waitForURL(/\/distribucion/)

    const admin = createAdminClient()
    const { data: lote } = await admin
      .from('lotes')
      .select('id')
      .eq('identificador', identificador)
      .single()

    // Este es el punto de todo el mecanismo: diez cuotas figuran saldadas y
    // aun así no hay un solo peso registrado como cobrado por el sistema.
    const { data: pagos } = await admin.from('pagos').select('id').eq('lote_id', lote!.id)
    expect(pagos).toHaveLength(0)

    const { data: movimientos } = await admin
      .from('movimientos_cuenta_corriente')
      .select('id')
      .eq('lote_id', lote!.id)
    expect(movimientos).toHaveLength(0)

    const { data: cuotas } = await admin.from('cuotas').select('id').eq('lote_id', lote!.id)
    const { data: imputaciones } = await admin
      .from('pago_imputaciones')
      .select('id')
      .in(
        'cuota_id',
        cuotas!.map((cuota) => cuota.id)
      )
    expect(imputaciones).toHaveLength(0)
  })

  test('no le manda invitación al comprador', async ({ page }) => {
    const identificador = `E2E En Curso Sin Invitar ${Date.now()}`
    const clienteEmail = `comprador.sininvitar.${Date.now()}@sima-e2e.invalid`
    lotesCreados.push(identificador)
    clientesCreados.push(clienteEmail)

    await login(page, fixtures.admin.email, fixtures.password)
    await cargarLote(page, {
      identificador,
      clienteEmail,
      cuotasYaPagadas: '3',
      cuotasPendientes: '3',
    })
    await page.waitForURL(/\/distribucion/)

    const admin = createAdminClient()
    const { data: perfil } = await admin
      .from('profiles')
      .select('id, role')
      .eq('email', clienteEmail)
      .single()

    expect(perfil!.role).toBe('cliente')

    // `inviteUserByEmail` deja invited_at cargado; `createUser` no. Es la
    // forma de comprobar desde acá que no salió ningún mail.
    const { data: usuario } = await admin.auth.admin.getUserById(perfil!.id)
    expect(usuario.user?.invited_at ?? null).toBeNull()
    // Y queda usable: el admin le genera la contraseña desde Clientes.
    expect(usuario.user?.email_confirmed_at).toBeTruthy()
  })

  test('el detalle del lote aclara que esas cuotas no las cobró el sistema', async ({ page }) => {
    const identificador = `E2E En Curso Detalle ${Date.now()}`
    const clienteEmail = `comprador.detalle.${Date.now()}@sima-e2e.invalid`
    lotesCreados.push(identificador)
    clientesCreados.push(clienteEmail)

    await login(page, fixtures.admin.email, fixtures.password)
    await cargarLote(page, {
      identificador,
      clienteEmail,
      cuotasYaPagadas: '2',
      cuotasPendientes: '2',
    })
    await page.waitForURL(/\/distribucion/)

    const admin = createAdminClient()
    const { data: lote } = await admin
      .from('lotes')
      .select('id')
      .eq('identificador', identificador)
      .single()

    await page.goto(`/admin/lotes/${lote!.id}`)
    await expect(page.getByText('Pagada antes del sistema').first()).toBeVisible()
    expect(await page.getByText('Pagada antes del sistema').count()).toBe(2)
  })

  test('rechaza un plan imposible sin perder lo ya tipeado', async ({ page }) => {
    const identificador = `E2E En Curso Invalido ${Date.now()}`

    await login(page, fixtures.admin.email, fixtures.password)
    // 601 cuotas en total: pasa la validación del browser (los campos solo
    // exigen enteros positivos) y la corta el server action, que es lo que
    // se quiere ejercitar acá.
    await cargarLote(page, {
      identificador,
      clienteEmail: `comprador.invalido.${Date.now()}@sima-e2e.invalid`,
      cuotasYaPagadas: '300',
      cuotasPendientes: '301',
    })

    await expect(page.getByText('más de 600 cuotas')).toBeVisible()
    // Lo cargado vuelve en la URL: son ~200 lotes a mano, retipear todo por
    // un campo mal puesto no es aceptable.
    await expect(page.locator('input[name="identificador"]')).toHaveValue(identificador)
    await expect(page.locator('input[name="cuotasYaPagadas"]')).toHaveValue('300')

    const admin = createAdminClient()
    const { data: lote } = await admin
      .from('lotes')
      .select('id')
      .eq('identificador', identificador)
      .maybeSingle()
    // Nada se creó a medias.
    expect(lote).toBeNull()
  })
})
