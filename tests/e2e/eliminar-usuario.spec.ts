import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

async function crearAcreedorDescartable(nombre: string) {
  const admin = createAdminClient()
  const email = `${nombre.toLowerCase().replace(/\s+/g, '.')}.${Date.now()}@sima-e2e.invalid`

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'Sima123!',
    email_confirm: true,
  })

  if (error || !data.user) {
    throw new Error(`No se pudo crear el usuario descartable: ${error?.message}`)
  }

  const { error: errorProfile } = await admin
    .from('profiles')
    .insert({ id: data.user.id, role: 'acreedor', full_name: nombre, email })

  if (errorProfile) {
    throw new Error(`No se pudo crear el profile descartable: ${errorProfile.message}`)
  }

  return { id: data.user.id, email }
}

test.describe('Eliminar usuarios de staff', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('el administrador ve el email de cada usuario en la tabla', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/usuarios')

    await expect(page.getByText(fixtures.vendedorLoteA.email)).toBeVisible()
  })

  test('el administrador puede eliminar un usuario de staff sin referencias', async ({ page }) => {
    const acreedor = await crearAcreedorDescartable(`E2E Acreedor Descartable ${Date.now()}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/usuarios')

    const fila = page.getByRole('row', { name: new RegExp(acreedor.email) })
    page.once('dialog', (dialog) => dialog.accept())
    await fila.getByRole('button', { name: 'Eliminar usuario' }).click()

    // La acción redirige a la misma URL en la que ya estamos (/admin/usuarios),
    // así que waitForURL resolvería antes de que termine el round-trip real.
    // Se sondea la base directamente en su lugar (mismo patrón ya usado para
    // cancelarReserva).
    const admin = createAdminClient()
    await expect(async () => {
      const { data } = await admin.from('profiles').select('id').eq('id', acreedor.id).maybeSingle()
      expect(data).toBeNull()
    }).toPass({ timeout: 5000 })
  })

  test('el administrador no ve el botón de eliminar en su propia fila', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/usuarios')

    const filaPropia = page.getByRole('row', { name: new RegExp(fixtures.admin.email) })
    await expect(filaPropia.getByRole('button', { name: 'Eliminar usuario' })).toHaveCount(0)
  })

  test('eliminar un acreedor todavía referenciado por un lote falla con un mensaje claro', async ({
    page,
  }) => {
    const acreedor = await crearAcreedorDescartable(`E2E Acreedor Referenciado ${Date.now()}`)

    const admin = createAdminClient()
    const { error: errorLote } = await admin.from('lotes').insert({
      identificador: `E2E Lote Acreedor Referenciado ${Date.now()}`,
      moneda: 'USD',
      estado: 'disponible',
      ubicacion: 'Ubicación E2E',
      precio_total: 5000,
      acreedor_id: acreedor.id,
    })

    if (errorLote) {
      throw new Error(`No se pudo crear el lote de prueba: ${errorLote.message}`)
    }

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/usuarios')

    const fila = page.getByRole('row', { name: new RegExp(acreedor.email) })
    page.once('dialog', (dialog) => dialog.accept())
    await fila.getByRole('button', { name: 'Eliminar usuario' }).click()

    await expect(
      page.getByText(/todavía está referenciada en lotes, reservas o pagos/)
    ).toBeVisible()

    const { data: profileTrasIntento } = await admin
      .from('profiles')
      .select('id')
      .eq('id', acreedor.id)
      .maybeSingle()
    expect(profileTrasIntento).not.toBeNull()
  })
})
