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
      // Numero de cuota real -> monto, para los planes escalonados.
      montosPorCuota?: Record<string, string>
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
    await page.locator('input[name="fechaProximaCuota"]').fill(datos.fechaProximaCuota ?? '2026-10-10')

    if (datos.montosPorCuota) {
      await page.getByRole('radio', { name: 'No, cargo una por una' }).check()
      for (const [numero, monto] of Object.entries(datos.montosPorCuota)) {
        await page.getByTestId(`monto-cuota-${numero}`).fill(monto)
      }
    } else {
      await page.getByTestId('monto-unico').fill(datos.montoCuota ?? '500')
    }

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

  test('las cuotas que quedan pueden tener cada una su propio monto', async ({ page }) => {
    const identificador = `E2E En Curso Escalonado ${Date.now()}`
    const clienteEmail = `comprador.escalonado.${Date.now()}@sima-e2e.invalid`
    lotesCreados.push(identificador)
    clientesCreados.push(clienteEmail)

    await login(page, fixtures.admin.email, fixtures.password)
    // Pagó 2, le quedan 3, y las tres valen distinto: el caso real de la
    // cartera de Nicolás, con planes escalonados y refinanciaciones a
    // mitad de camino.
    await cargarLote(page, {
      identificador,
      clienteEmail,
      cuotasYaPagadas: '2',
      cuotasPendientes: '3',
      montosPorCuota: { '3': '100', '4': '250.5', '5': '300' },
    })
    await page.waitForURL(/\/distribucion/)

    const admin = createAdminClient()
    const { data: lote } = await admin
      .from('lotes')
      .select('id, monto_cuota_base')
      .eq('identificador', identificador)
      .single()

    // Sin monto de cuota único: el lote no tiene uno, igual que una venta
    // cargada en modo manual.
    expect(lote!.monto_cuota_base).toBeNull()

    const { data: cuotas } = await admin
      .from('cuotas')
      .select('numero, monto_base, saldo_pendiente, migrada')
      .eq('lote_id', lote!.id)
      .order('numero')

    expect(cuotas!.map((c) => Number(c.monto_base))).toEqual([100, 100, 100, 250.5, 300])
    expect(cuotas!.map((c) => Number(c.saldo_pendiente))).toEqual([0, 0, 100, 250.5, 300])
    expect(cuotas!.map((c) => c.migrada)).toEqual([true, true, false, false, false])
  })

  test('muestra una vez la contraseña con la que el comprador puede entrar', async ({ page }) => {
    const identificador = `E2E En Curso Contrasena ${Date.now()}`
    const clienteEmail = `comprador.contrasena.${Date.now()}@sima-e2e.invalid`
    lotesCreados.push(identificador)
    clientesCreados.push(clienteEmail)

    await login(page, fixtures.admin.email, fixtures.password)
    await cargarLote(page, {
      identificador,
      clienteEmail,
      cuotasYaPagadas: '1',
      cuotasPendientes: '2',
    })
    await page.waitForURL(/\/distribucion/)

    const aviso = page.getByText('para entrar al portal es')
    await expect(aviso).toBeVisible()

    // Cuatro letras, guion, cuatro números y un signo: pensada para
    // dictarla por teléfono.
    const texto = (await aviso.textContent()) ?? ''
    const contrasena = /([A-Z]{4}-[2-9]{4}!)/.exec(texto)?.[1]
    expect(contrasena).toBeTruthy()

    // Y sirve de verdad: el comprador entra con ella.
    await page.context().clearCookies()
    await page.goto('/login')
    await page.locator('input[name="email"]').fill(clienteEmail)
    await page.locator('input[name="password"]').fill(contrasena!)
    await page.getByRole('button', { name: 'Ingresar' }).click()
    await page.waitForURL(/\/portal-cliente/)
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

// El cliente cambiándose la contraseña. Vive en este archivo y no en uno
// aparte porque la pantalla existe por esto: el comprador cargado a mano
// entra con una contraseña que le dictaron y tiene que poder cambiarla.
test.describe('El cliente cambia su propia contraseña', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  // Después de CADA test, no al final del bloque: el primero le cambia la
  // contraseña de verdad, y sin restaurarla acá el siguiente ya no puede
  // loguearse -- ni el resto de la suite, que usa esta misma cuenta.
  test.afterEach(async () => {
    const admin = createAdminClient()
    await admin.auth.admin.updateUserById(fixtures.cliente.id, { password: fixtures.password })
  })

  test('la cambia desde el portal y entra con la nueva', async ({ page }) => {
    const nueva = `E2E-nueva-${Date.now()}!`

    await login(page, fixtures.cliente.email, fixtures.password)
    await page.goto('/portal-cliente/contrasena')

    await page.locator('input[name="nuevaContrasena"]').fill(nueva)
    await page.locator('input[name="repetirContrasena"]').fill(nueva)
    await page.getByRole('button', { name: 'Guardar contraseña' }).click()

    await expect(page.getByText('tu contraseña quedó cambiada')).toBeVisible()

    await page.context().clearCookies()
    await login(page, fixtures.cliente.email, nueva)
    await expect(page).toHaveURL(/\/portal-cliente/)
  })

  test('no la cambia si las dos no coinciden', async ({ page }) => {
    await login(page, fixtures.cliente.email, fixtures.password)
    await page.goto('/portal-cliente/contrasena')

    await page.locator('input[name="nuevaContrasena"]').fill('E2E-una-valida!')
    await page.locator('input[name="repetirContrasena"]').fill('E2E-otra-distinta!')
    await page.getByRole('button', { name: 'Guardar contraseña' }).click()

    await expect(page.getByText('no coinciden')).toBeVisible()

    // Y la de siempre sigue funcionando.
    await page.context().clearCookies()
    await login(page, fixtures.cliente.email, fixtures.password)
    await expect(page).toHaveURL(/\/portal-cliente/)
  })

  test('rechaza una contraseña que no cumple el mínimo', async ({ page }) => {
    await login(page, fixtures.cliente.email, fixtures.password)
    await page.goto('/portal-cliente/contrasena')

    // Ocho caracteres pero sin ningún signo.
    await page.locator('input[name="nuevaContrasena"]').fill('abcdefgh')
    await page.locator('input[name="repetirContrasena"]').fill('abcdefgh')
    await page.getByRole('button', { name: 'Guardar contraseña' }).click()

    await expect(page.getByText('incluyendo un signo')).toBeVisible()
  })
})
