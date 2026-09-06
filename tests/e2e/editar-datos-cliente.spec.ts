// tests/e2e/editar-datos-cliente.spec.ts
import { test, expect, Page } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures, TEST_USERS } from './fixtures/test-data'
import { login } from './utils/login'

// El prefijo de país dejó de ser un <select> nativo (27/08, ver
// SelectorPrefijoTelefono.tsx) -- un <option> no puede llevar la bandera
// como ícono real, así que ahora es un combobox propio: abrir, buscar,
// elegir de la lista.
async function elegirPrefijo(page: Page, nombrePais: string) {
  await page.getByLabel('Prefijo de país').click()
  await page.getByPlaceholder('Buscar país o código...').fill(nombrePais)
  await page.getByRole('option', { name: new RegExp(nombrePais) }).click()
}

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
      await elegirPrefijo(page, 'Argentina')
      await page.getByPlaceholder('9351234567').fill('3515555555')
      await page.getByRole('button', { name: 'Guardar datos' }).click()

      await expect(page.getByText('Datos actualizados')).toBeVisible()
      await expect(page.getByText(`DNI: ${dni}`)).toBeVisible()

      const { data: cliente } = await admin
        .from('profiles')
        .select('full_name, dni, domicilio, telefono_prefijo, telefono_numero')
        .eq('id', fixtures.cliente.id)
        .single()
      expect(cliente?.full_name).toBe('E2E Cliente Editado')
      expect(cliente?.dni).toBe(dni)
      expect(cliente?.domicilio).toBe('Domicilio Editado 111')
      expect(cliente?.telefono_prefijo).toBe('54')
      expect(cliente?.telefono_numero).toBe('3515555555')
    } finally {
      await admin
        .from('profiles')
        .update({
          full_name: TEST_USERS.cliente.fullName,
          dni: null,
          domicilio: null,
          telefono_prefijo: null,
          telefono_numero: null,
        })
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

  // Los dos tests que había acá ("el cliente edita sus propios datos desde
  // Mi perfil" y su variante de DNI repetido) se borraron el 06/09: el
  // portal del cliente ya no tiene "Mi perfil". Los datos del cliente
  // (nombre, DNI, domicilio, teléfono) los mantiene la inmobiliaria desde
  // /admin/clientes, que es lo que cubren los tests de arriba.
  test('el cliente ya no tiene pantalla de perfil en su portal', async ({ page }) => {
    await login(page, fixtures.cliente.email, fixtures.password)
    await page.goto('/portal-cliente')

    await expect(page.getByRole('link', { name: 'Mi perfil' })).toHaveCount(0)

    const respuesta = await page.goto('/portal-cliente/mi-perfil')
    expect(respuesta?.status()).toBe(404)
  })
})
