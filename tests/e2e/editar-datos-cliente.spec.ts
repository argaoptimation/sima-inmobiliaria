// tests/e2e/editar-datos-cliente.spec.ts
import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures, TEST_USERS } from './fixtures/test-data'
import { login } from './utils/login'

test.describe('Editar datos del cliente', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('admin edita nombre, DNI, domicilio y teléfono de un cliente', async ({ page }) => {
    const admin = createAdminClient()
    const dni = `${Date.now()}`.slice(-8)

    try {
      await login(page, fixtures.admin.email, fixtures.password)
      await page.goto(`/admin/clientes/${fixtures.cliente.id}`)

      await page.getByLabel('Nombre completo').fill('E2E Cliente Editado')
      await page.getByLabel('DNI').fill(dni)
      await page.getByLabel('Domicilio').fill('Domicilio Editado 111')
      await page.getByLabel('Prefijo de país').selectOption('54')
      await page.getByPlaceholder('9351234567').fill('3515555555')
      await page.getByRole('button', { name: 'Guardar datos' }).click()

      await expect(page.getByText('Datos actualizados')).toBeVisible()
      await expect(page.getByText(`DNI: ${dni}`)).toBeVisible()

      const { data: cliente } = await admin
        .from('profiles')
        .select('full_name, dni, domicilio, telefono')
        .eq('id', fixtures.cliente.id)
        .single()
      expect(cliente?.full_name).toBe('E2E Cliente Editado')
      expect(cliente?.dni).toBe(dni)
      expect(cliente?.domicilio).toBe('Domicilio Editado 111')
      expect(cliente?.telefono).toBe('543515555555')
    } finally {
      await admin
        .from('profiles')
        .update({ full_name: TEST_USERS.cliente.fullName, dni: null, domicilio: null, telefono: null })
        .eq('id', fixtures.cliente.id)
    }
  })

  test('admin: guardar un DNI que ya pertenece a otro cliente es rechazado', async ({ page }) => {
    const admin = createAdminClient()
    const dniOcupado = `${Date.now()}`.slice(-8)
    const emailOtro = `otro.cliente.dni.${Date.now()}@sima-e2e.invalid`

    const { data: invited } = await admin.auth.admin.inviteUserByEmail(emailOtro)
    await admin.from('profiles').insert({
      id: invited!.user.id,
      role: 'cliente',
      full_name: 'Otro Cliente Con DNI',
      email: emailOtro,
      dni: dniOcupado,
    })

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/clientes/${fixtures.cliente.id}`)
    await page.getByLabel('DNI').fill(dniOcupado)
    await page.getByRole('button', { name: 'Guardar datos' }).click()

    await expect(page.getByText('Ese DNI ya pertenece a otro cliente')).toBeVisible()
  })

  test('el cliente edita sus propios datos desde Mi perfil', async ({ page }) => {
    const admin = createAdminClient()
    const dni = `${Date.now()}`.slice(-8)

    try {
      await login(page, fixtures.cliente.email, fixtures.password)
      await page.goto('/portal-cliente/mi-perfil')

      await page.getByLabel('Nombre completo').fill('E2E Cliente Autoeditado')
      await page.getByLabel('DNI').fill(dni)
      await page.getByLabel('Domicilio').fill('Mi Domicilio 222')
      await page.getByLabel('Prefijo de país').selectOption('54')
      await page.getByPlaceholder('9351234567').fill('3516666666')
      await page.getByRole('button', { name: 'Guardar datos' }).click()

      await expect(page.getByText('Guardado.')).toBeVisible()

      const { data: cliente } = await admin
        .from('profiles')
        .select('full_name, dni, domicilio, telefono')
        .eq('id', fixtures.cliente.id)
        .single()
      expect(cliente?.full_name).toBe('E2E Cliente Autoeditado')
      expect(cliente?.dni).toBe(dni)
      expect(cliente?.telefono).toBe('543516666666')
    } finally {
      await admin
        .from('profiles')
        .update({ full_name: TEST_USERS.cliente.fullName, dni: null, domicilio: null, telefono: null })
        .eq('id', fixtures.cliente.id)
    }
  })

  test('el cliente: guardar un DNI que ya pertenece a otro cliente es rechazado', async ({ page }) => {
    const admin = createAdminClient()
    const dniOcupado = `${Date.now()}`.slice(-8)
    const emailOtro = `otro.cliente.autoedit.${Date.now()}@sima-e2e.invalid`

    const { data: invited } = await admin.auth.admin.inviteUserByEmail(emailOtro)
    await admin.from('profiles').insert({
      id: invited!.user.id,
      role: 'cliente',
      full_name: 'Otro Cliente Autoedit',
      email: emailOtro,
      dni: dniOcupado,
    })

    await login(page, fixtures.cliente.email, fixtures.password)
    await page.goto('/portal-cliente/mi-perfil')
    await page.getByLabel('DNI').fill(dniOcupado)
    await page.getByRole('button', { name: 'Guardar datos' }).click()

    await expect(page.getByText('Ese DNI ya pertenece a otro cliente')).toBeVisible()
  })
})
