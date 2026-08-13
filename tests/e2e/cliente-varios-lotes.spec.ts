import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

async function crearLoteReservadoListoParaVender(
  identificador: string,
  precioTotal: number,
  acreedorId: string
) {
  const admin = createAdminClient()
  const { data: lote, error } = await admin
    .from('lotes')
    .insert({
      identificador,
      moneda: 'USD',
      estado: 'reservado',
      ubicacion: 'Ubicación E2E',
      precio_total: precioTotal,
      acreedor_id: acreedorId,
    })
    .select('id')
    .single()

  if (error || !lote) {
    throw new Error(`No se pudo crear el lote de prueba: ${error?.message}`)
  }

  return lote.id as string
}

async function venderLotePorUI(
  page: import('@playwright/test').Page,
  loteId: string,
  datos: { email: string; fullName: string }
) {
  await page.goto(`/admin/lotes/${loteId}/vender`)
  await page.getByPlaceholder('Nombre completo del comprador').fill(datos.fullName)
  await page.getByPlaceholder('Email del comprador').fill(datos.email)
  await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('1')
  await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
  await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
  await page.waitForURL('**/admin/lotes')
}

/**
 * El cliente paga la (única) cuota de un lote vendido al contado (1 cuota).
 * Reusa el flujo real de `/portal-cliente/pagar/[id]` y espera el redirect a
 * la pantalla de comprobante -- eso confirma que el `insert` en `pagos` (con
 * su `lote_id`) ya terminó antes de que el test siga.
 */
async function pagarCuotaPorUI(page: import('@playwright/test').Page, cuotaId: string, monto: number) {
  await page.goto(`/portal-cliente/pagar/${cuotaId}`)
  await page.getByPlaceholder('Monto transferido').fill(String(monto))
  await page.getByRole('button', { name: 'Ya transferí' }).click()
  await page.waitForURL('**/portal-cliente/pagos/**/comprobante')
}

test.describe('Cliente con varios lotes', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('vender un segundo lote al mismo email reutiliza la cuenta, sin invitar de nuevo', async ({
    page,
  }) => {
    const emailComprador = `comprador.repetido.${Date.now()}@sima-e2e.invalid`

    const loteAId = await crearLoteReservadoListoParaVender(
      `E2E Multi Lote A ${Date.now()}`,
      5000,
      fixtures.acreedorConDatos.id
    )
    const loteBId = await crearLoteReservadoListoParaVender(
      `E2E Multi Lote B ${Date.now()}`,
      8000,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.admin.email, fixtures.password)

    await venderLotePorUI(page, loteAId, { email: emailComprador, fullName: 'Comprador Repetido' })
    await venderLotePorUI(page, loteBId, { email: emailComprador, fullName: 'Comprador Repetido' })

    const admin = createAdminClient()
    const { data: loteA } = await admin.from('lotes').select('cliente_id').eq('id', loteAId).single()
    const { data: loteB } = await admin.from('lotes').select('cliente_id').eq('id', loteBId).single()

    expect(loteA?.cliente_id).toBeTruthy()
    expect(loteB?.cliente_id).toBe(loteA?.cliente_id)

    const { count } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('email', emailComprador)
    expect(count).toBe(1)
  })

  test('el portal del cliente lista todos sus lotes', async ({ page }) => {
    const emailComprador = `comprador.portal.${Date.now()}@sima-e2e.invalid`

    const loteAId = await crearLoteReservadoListoParaVender(
      `E2E Multi Portal A ${Date.now()}`,
      5000,
      fixtures.acreedorConDatos.id
    )
    const loteBId = await crearLoteReservadoListoParaVender(
      `E2E Multi Portal B ${Date.now()}`,
      6000,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await venderLotePorUI(page, loteAId, { email: emailComprador, fullName: 'Comprador Portal' })

    const admin = createAdminClient()
    const { data: loteAVendido } = await admin
      .from('lotes')
      .select('cliente_id')
      .eq('id', loteAId)
      .single()

    await venderLotePorUI(page, loteBId, { email: emailComprador, fullName: 'Comprador Portal' })

    const { error: errorSetPassword } = await admin.auth.admin.updateUserById(
      loteAVendido!.cliente_id,
      { password: 'Sima123!', email_confirm: true }
    )
    if (errorSetPassword) {
      throw new Error(`No se pudo setear la contraseña del cliente: ${errorSetPassword.message}`)
    }

    const { data: identificadorLoteA } = await admin
      .from('lotes')
      .select('identificador')
      .eq('id', loteAId)
      .single()
    const { data: identificadorLoteB } = await admin
      .from('lotes')
      .select('identificador')
      .eq('id', loteBId)
      .single()

    const { data: cliente } = await admin
      .from('profiles')
      .select('email')
      .eq('id', loteAVendido!.cliente_id)
      .single()

    await login(page, cliente!.email!, 'Sima123!')
    await page.goto('/portal-cliente')

    await expect(page.getByText(identificadorLoteA!.identificador)).toBeVisible()
    await expect(page.getByText(identificadorLoteB!.identificador)).toBeVisible()
  })

  test('pagar una cuota de un lote no toca las cuotas del otro lote del mismo cliente', async ({
    page,
  }) => {
    const emailComprador = `comprador.pagos.${Date.now()}@sima-e2e.invalid`

    const loteAId = await crearLoteReservadoListoParaVender(
      `E2E Multi Pagos A ${Date.now()}`,
      5000,
      fixtures.acreedorConDatos.id
    )
    const loteBId = await crearLoteReservadoListoParaVender(
      `E2E Multi Pagos B ${Date.now()}`,
      6000,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await venderLotePorUI(page, loteAId, { email: emailComprador, fullName: 'Comprador Pagos' })
    await venderLotePorUI(page, loteBId, { email: emailComprador, fullName: 'Comprador Pagos' })

    const admin = createAdminClient()
    const { data: loteA } = await admin.from('lotes').select('cliente_id').eq('id', loteAId).single()
    await admin.auth.admin.updateUserById(loteA!.cliente_id, {
      password: 'Sima123!',
      email_confirm: true,
    })
    const { data: cliente } = await admin
      .from('profiles')
      .select('email')
      .eq('id', loteA!.cliente_id)
      .single()

    const { data: cuotaLoteA } = await admin
      .from('cuotas')
      .select('id, saldo_pendiente')
      .eq('lote_id', loteAId)
      .single()
    const { data: cuotaLoteB } = await admin
      .from('cuotas')
      .select('id, saldo_pendiente')
      .eq('lote_id', loteBId)
      .single()

    await login(page, cliente!.email!, 'Sima123!')
    await pagarCuotaPorUI(page, cuotaLoteA!.id, 5000)

    const { data: pagoCreado } = await admin
      .from('pagos')
      .select('id, lote_id')
      .eq('cliente_id', loteA!.cliente_id)
      .eq('lote_id', loteAId)
      .single()
    expect(pagoCreado?.lote_id).toBe(loteAId)

    const { data: cuotaBSinCambios } = await admin
      .from('cuotas')
      .select('saldo_pendiente')
      .eq('id', cuotaLoteB!.id)
      .single()
    expect(cuotaBSinCambios?.saldo_pendiente).toBe(cuotaLoteB!.saldo_pendiente)
  })

  test('un acreedor solo ve en /admin/pagos los pagos de SUS lotes, aunque el cliente tenga otro lote de otro acreedor', async ({
    page,
  }) => {
    const emailComprador = `comprador.acreedores.${Date.now()}@sima-e2e.invalid`

    const loteDelAcreedorId = await crearLoteReservadoListoParaVender(
      `E2E Multi Acreedor Propio ${Date.now()}`,
      5000,
      fixtures.acreedorConDatos.id
    )
    const loteDeOtroAcreedorId = await crearLoteReservadoListoParaVender(
      `E2E Multi Acreedor Ajeno ${Date.now()}`,
      6000,
      fixtures.acreedorSecundario.id
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await venderLotePorUI(page, loteDelAcreedorId, {
      email: emailComprador,
      fullName: 'Comprador Acreedores',
    })
    await venderLotePorUI(page, loteDeOtroAcreedorId, {
      email: emailComprador,
      fullName: 'Comprador Acreedores',
    })

    // El mismo cliente paga la cuota de AMBOS lotes -- uno pertenece a
    // acreedorConDatos, el otro a acreedorSecundario. Esto es lo que hace
    // que el escenario sea realmente "cliente con varios lotes de distintos
    // acreedores" y no solo "el listado no rompe": ahora hay dos pagos
    // reales, uno por lote, para poder probar que el filtro por
    // `acreedor_id` (vía `lote_id`) separa correctamente uno del otro.
    const admin = createAdminClient()
    const { data: loteDelAcreedor } = await admin
      .from('lotes')
      .select('cliente_id')
      .eq('id', loteDelAcreedorId)
      .single()

    await admin.auth.admin.updateUserById(loteDelAcreedor!.cliente_id, {
      password: 'Sima123!',
      email_confirm: true,
    })
    const { data: cliente } = await admin
      .from('profiles')
      .select('email')
      .eq('id', loteDelAcreedor!.cliente_id)
      .single()

    const { data: cuotaPropia } = await admin
      .from('cuotas')
      .select('id')
      .eq('lote_id', loteDelAcreedorId)
      .single()
    const { data: cuotaAjena } = await admin
      .from('cuotas')
      .select('id')
      .eq('lote_id', loteDeOtroAcreedorId)
      .single()

    await login(page, cliente!.email!, 'Sima123!')
    await pagarCuotaPorUI(page, cuotaPropia!.id, 5000)
    await pagarCuotaPorUI(page, cuotaAjena!.id, 6000)

    const { data: identificadorPropio } = await admin
      .from('lotes')
      .select('identificador')
      .eq('id', loteDelAcreedorId)
      .single()
    const { data: identificadorAjeno } = await admin
      .from('lotes')
      .select('identificador')
      .eq('id', loteDeOtroAcreedorId)
      .single()

    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto('/admin/pagos')

    await expect(page.getByRole('heading', { name: 'Pagos' })).toBeVisible()

    // acreedorConDatos ve la fila del pago de SU lote...
    await expect(page.getByRole('cell', { name: identificadorPropio!.identificador })).toBeVisible()
    // ...pero no la del pago del lote de acreedorSecundario, aunque sea del
    // mismo cliente.
    await expect(
      page.getByRole('cell', { name: identificadorAjeno!.identificador })
    ).toHaveCount(0)
  })

  test('pagar/[id] con una cuota de un lote ajeno (de otro cliente) es rechazado', async ({
    page,
  }) => {
    const admin = createAdminClient()

    // fixtures.cliente es dueño de fixtures.loteId en el fixture estándar --
    // para simular "cuota ajena" hace falta un cliente DISTINTO, dueño de su
    // propio lote. Se reusa el flujo de venta para generar uno nuevo y se
    // prueba que el cliente del fixture estándar no puede abrir/pagar esa
    // cuota ajena.
    await login(page, fixtures.admin.email, fixtures.password)
    const loteAjenoId = await crearLoteReservadoListoParaVender(
      `E2E Multi Cuota Ajena ${Date.now()}`,
      5000,
      fixtures.acreedorConDatos.id
    )
    await venderLotePorUI(page, loteAjenoId, {
      email: `otro.cliente.${Date.now()}@sima-e2e.invalid`,
      fullName: 'Otro Cliente',
    })
    const { data: cuotaDelOtro } = await admin
      .from('cuotas')
      .select('id')
      .eq('lote_id', loteAjenoId)
      .single()

    await login(page, fixtures.cliente.email, fixtures.password)
    const respuesta = await page.goto(`/portal-cliente/pagar/${cuotaDelOtro!.id}`)
    expect(respuesta?.status()).toBe(404)
  })
})
