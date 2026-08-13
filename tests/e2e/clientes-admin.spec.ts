import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

async function crearClienteDescartable(nombre: string) {
  const admin = createAdminClient()
  const email = `${nombre.toLowerCase().replace(/\s+/g, '.')}.${Date.now()}@sima-e2e.invalid`

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'Sima123!',
    email_confirm: true,
  })

  if (error || !data.user) {
    throw new Error(`No se pudo crear el cliente descartable: ${error?.message}`)
  }

  const { error: errorProfile } = await admin
    .from('profiles')
    .insert({ id: data.user.id, role: 'cliente', full_name: nombre, email })

  if (errorProfile) {
    throw new Error(`No se pudo crear el profile descartable: ${errorProfile.message}`)
  }

  return { id: data.user.id, email }
}

test.describe('Vista de clientes desde Admin', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('el administrador ve el listado de clientes con su cantidad de lotes', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/clientes')

    const fila = page.getByRole('row', { name: new RegExp(fixtures.cliente.email) })
    await expect(fila).toBeVisible()
    // fixtures.cliente es dueño de "E2E Test Lote" -- al menos 1 lote.
    await expect(fila.locator('td').nth(2)).not.toHaveText('0')
  })

  test('un acreedor no puede abrir /admin/clientes navegando directo por URL', async ({ page }) => {
    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto('/admin/clientes')

    await expect(page).toHaveURL(/\/admin\/lotes/)
  })

  test('el detalle de un cliente muestra sus lotes con saldo pendiente', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/clientes')

    const fila = page.getByRole('row', { name: new RegExp(fixtures.cliente.email) })
    await fila.getByRole('link', { name: 'Ver detalle' }).click()
    await page.waitForURL(/\/admin\/clientes\/.+$/)

    await expect(page.getByRole('heading', { name: 'E2E Cliente' })).toBeVisible()
    await expect(page.getByRole('row', { name: /E2E Test Lote/ })).toBeVisible()
  })

  test('resetear la contraseña de un cliente le permite loguearse con la nueva', async ({
    page,
  }) => {
    const cliente = await crearClienteDescartable(`E2E Cliente Reset ${Date.now()}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/clientes/${cliente.id}`)

    await page.getByPlaceholder('Nueva contraseña').fill('NuevaClave456!')
    await page.getByRole('button', { name: 'Guardar' }).click()
    await page.waitForURL(new RegExp(`/admin/clientes/${cliente.id}`))
    await expect(page.getByText('Contraseña actualizada')).toBeVisible()

    await page.context().clearCookies()
    await login(page, cliente.email, 'NuevaClave456!')
    await expect(page).toHaveURL(/\/portal-cliente/)
  })

  test('eliminar un cliente sin ningún lote asociado funciona', async ({ page }) => {
    const cliente = await crearClienteDescartable(`E2E Cliente Sin Lote ${Date.now()}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/clientes/${cliente.id}`)

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Eliminar usuario' }).click()
    await page.waitForURL(/\/admin\/clientes$/)

    const admin = createAdminClient()
    await expect(async () => {
      const { data } = await admin.from('profiles').select('id').eq('id', cliente.id).maybeSingle()
      expect(data).toBeNull()
    }).toPass({ timeout: 5000 })
  })

  test('eliminar un cliente CON un lote asociado es rechazado con un mensaje claro', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/clientes/${fixtures.cliente.id}`)

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Eliminar usuario' }).click()
    await page.waitForURL(new RegExp(`/admin/clientes/${fixtures.cliente.id}`))

    await expect(page.getByText(/todavía tiene lotes o pagos asociados/)).toBeVisible()

    const admin = createAdminClient()
    const { data: sigueExistiendo } = await admin
      .from('profiles')
      .select('id')
      .eq('id', fixtures.cliente.id)
      .maybeSingle()
    expect(sigueExistiendo).not.toBeNull()
  })
})
