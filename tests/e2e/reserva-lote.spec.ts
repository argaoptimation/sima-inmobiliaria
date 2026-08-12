import { test, expect, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login, logout } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

async function crearLoteDisponible(identificador: string, acreedorId?: string) {
  const admin = createAdminClient()
  const { data: lote, error } = await admin
    .from('lotes')
    .insert({
      identificador,
      moneda: 'USD',
      estado: 'disponible',
      cantidad_cuotas: 1,
      monto_cuota_base: 1,
      acreedor_id: acreedorId ?? null,
    })
    .select('id')
    .single()

  if (error || !lote) {
    throw new Error(`No se pudo crear el lote disponible de prueba: ${error?.message}`)
  }

  return lote.id as string
}

async function completarDatosBasicosDeReserva(page: Page) {
  await page.getByPlaceholder('Nombre completo').fill('Comprador E2E')
  await page.getByPlaceholder('DNI').fill('30111222')
  await page.getByPlaceholder('Domicilio').fill('Calle Falsa 123')
  await page.getByPlaceholder('Email').fill('comprador.e2e@sima-demo.invalid')
  await page.getByPlaceholder('Teléfono', { exact: true }).fill('3511234567')
  await page.selectOption('select[name="estadoCivil"]', 'soltero')
  await page.getByPlaceholder('Monto de la seña').fill('500')
  await page.setInputFiles('input[name="comprobante"]', {
    name: `e2e-reserva-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    buffer: COMPROBANTE_BYTES,
  })
}

test.describe('Reserva de lote (fase 1: texto + comprobante de seña)', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('un vendedor reserva un lote disponible y queda asignado como vendedor_id', async ({
    page,
  }) => {
    const loteId = await crearLoteDisponible(
      `E2E Lote Disponible Vendedor ${Date.now()}`,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.vendedorSinLotes.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await completarDatosBasicosDeReserva(page)
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: lote } = await admin
      .from('lotes')
      .select('estado, vendedor_id')
      .eq('id', loteId)
      .single()

    expect(lote?.estado).toBe('reservado')
    expect(lote?.vendedor_id).toBe(fixtures.vendedorSinLotes.id)
  })

  test('un cobrador reserva un lote disponible y el lote queda sin vendedor asignado', async ({
    page,
  }) => {
    const loteId = await crearLoteDisponible(`E2E Lote Disponible Cobrador ${Date.now()}`)

    await login(page, fixtures.cobrador.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await completarDatosBasicosDeReserva(page)
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: lote } = await admin
      .from('lotes')
      .select('estado, vendedor_id')
      .eq('id', loteId)
      .single()

    expect(lote?.estado).toBe('reservado')
    expect(lote?.vendedor_id).toBeNull()
  })

  test('un acreedor puede reservar su propio lote', async ({ page }) => {
    const loteId = await crearLoteDisponible(
      `E2E Lote Propio Acreedor ${Date.now()}`,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await completarDatosBasicosDeReserva(page)
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: lote } = await admin.from('lotes').select('estado').eq('id', loteId).single()

    expect(lote?.estado).toBe('reservado')
  })

  test('un acreedor no puede reservar un lote que no es suyo', async ({ page }) => {
    const loteId = await crearLoteDisponible(
      `E2E Lote Ajeno ${Date.now()}`,
      fixtures.acreedorSecundario.id
    )

    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await page.waitForURL('**/admin/lotes')
    await expect(page).toHaveURL(/\/admin\/lotes$/)
  })

  test('no se puede reservar un lote que ya no está disponible', async ({ page }) => {
    const loteId = await crearLoteDisponible(`E2E Lote Ya Reservado ${Date.now()}`)
    const admin = createAdminClient()
    await admin.from('lotes').update({ estado: 'reservado' }).eq('id', loteId)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)

    await expect(page.getByText('Este lote ya no está disponible para reservar')).toBeVisible()
    // 'main form' (no 'form' a secas): el nav de arriba ahora tiene su propio
    // <form> para el botón de cerrar sesión, fuera de <main>.
    await expect(page.locator('main form')).toHaveCount(0)
  })

  test('vendedor y cobrador no pueden abrir el detalle del lote ni ven Pagos/Usuarios', async ({
    page,
  }) => {
    await test.step('vendedor', async () => {
      const loteId = await crearLoteDisponible(`E2E Lote Detalle Bloqueado Vendedor ${Date.now()}`)

      await login(page, fixtures.vendedorSinLotes.email, fixtures.password)

      await test.step('no puede abrir el detalle', async () => {
        await page.goto(`/admin/lotes/${loteId}`)
        await page.waitForURL('**/admin/lotes')
        await expect(page).toHaveURL(/\/admin\/lotes$/)
      })

      await test.step('no ve Pagos ni Usuarios en la nav', async () => {
        await page.goto('/admin/lotes')
        await expect(page.getByRole('link', { name: 'Pagos' })).toHaveCount(0)
        await expect(page.getByRole('link', { name: 'Usuarios' })).toHaveCount(0)
        await expect(page.getByRole('link', { name: 'Mi perfil' })).toBeVisible()
      })
    })

    await test.step('cobrador', async () => {
      const loteId = await crearLoteDisponible(`E2E Lote Detalle Bloqueado Cobrador ${Date.now()}`)

      await logout(page)
      await login(page, fixtures.cobrador.email, fixtures.password)

      await test.step('no puede abrir el detalle', async () => {
        await page.goto(`/admin/lotes/${loteId}`)
        await page.waitForURL('**/admin/lotes')
        await expect(page).toHaveURL(/\/admin\/lotes$/)
      })

      await test.step('no ve Pagos ni Usuarios en la nav', async () => {
        await page.goto('/admin/lotes')
        await expect(page.getByRole('link', { name: 'Pagos' })).toHaveCount(0)
        await expect(page.getByRole('link', { name: 'Usuarios' })).toHaveCount(0)
        await expect(page.getByRole('link', { name: 'Mi perfil' })).toBeVisible()
      })
    })
  })

  test('el listado de lotes de un vendedor solo muestra lotes disponibles', async ({ page }) => {
    const identificadorVisible = `E2E Lote Visible Para Vendedor ${Date.now()}`
    const identificadorOculto = `E2E Lote Oculto Para Vendedor ${Date.now()}`
    await crearLoteDisponible(identificadorVisible)
    const loteReservadoId = await crearLoteDisponible(identificadorOculto)
    const admin = createAdminClient()
    await admin.from('lotes').update({ estado: 'reservado' }).eq('id', loteReservadoId)

    await login(page, fixtures.vendedorSinLotes.email, fixtures.password)
    await page.goto('/admin/lotes')

    await expect(page.getByText(identificadorVisible, { exact: true })).toBeVisible()
    await expect(page.getByText(identificadorOculto, { exact: true })).toHaveCount(0)
  })

  test('vendedor no puede abrir /admin/pagos navegando directo por URL', async ({ page }) => {
    await login(page, fixtures.vendedorSinLotes.email, fixtures.password)
    await page.goto('/admin/pagos')
    await page.waitForURL('**/admin/lotes')
    await expect(page).toHaveURL(/\/admin\/lotes$/)
  })

  test('vendedor no puede abrir /admin/lotes/nuevo navegando directo por URL', async ({ page }) => {
    await login(page, fixtures.vendedorSinLotes.email, fixtures.password)
    await page.goto('/admin/lotes/nuevo')
    await page.waitForURL('**/admin/lotes')
    await expect(page).toHaveURL(/\/admin\/lotes$/)
  })

  test('vendedor y cobrador no pueden abrir /admin/usuarios navegando directo por URL', async ({
    page,
  }) => {
    await test.step('vendedor', async () => {
      await login(page, fixtures.vendedorSinLotes.email, fixtures.password)
      await page.goto('/admin/usuarios')
      await page.waitForURL('**/admin/lotes')
      await expect(page).toHaveURL(/\/admin\/lotes$/)
    })

    await test.step('cobrador', async () => {
      await logout(page)
      await login(page, fixtures.cobrador.email, fixtures.password)
      await page.goto('/admin/usuarios')
      await page.waitForURL('**/admin/lotes')
      await expect(page).toHaveURL(/\/admin\/lotes$/)
    })
  })

  test('el selector "recibido por" permite elegir a alguien de la lista o escribir un nombre libre', async ({
    page,
  }) => {
    const loteId = await crearLoteDisponible(`E2E Lote Recibido Otro ${Date.now()}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)

    await page.selectOption('select[name="recibidoPor"]', '')
    await page
      .getByPlaceholder('Si no está en la lista: nombre de quien la recibió')
      .fill('Persona Externa Sin Cuenta')

    await completarDatosBasicosDeReserva(page)
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: reserva } = await admin
      .from('reservas')
      .select('recibido_por, recibido_por_otro')
      .eq('lote_id', loteId)
      .single()

    expect(reserva?.recibido_por).toBeNull()
    expect(reserva?.recibido_por_otro).toBe('Persona Externa Sin Cuenta')
  })
})
