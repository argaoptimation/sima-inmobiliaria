import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

async function crearLoteDisponible(identificador: string) {
  const admin = createAdminClient()
  const { data: lote, error } = await admin
    .from('lotes')
    .insert({ identificador, moneda: 'USD', estado: 'disponible' })
    .select('id')
    .single()

  if (error || !lote) {
    throw new Error(`No se pudo crear el lote de prueba: ${error?.message}`)
  }

  return lote.id as string
}

test.describe('Buscar cliente por DNI al reservar', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('buscar por DNI o nombre y elegir de la lista precarga los datos, sin recargar la página', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const dni = `${Date.now()}`.slice(-8)
    const email = `cliente.buscar.dni.${Date.now()}@sima-e2e.invalid`

    const { data: invited } = await admin.auth.admin.inviteUserByEmail(email)
    await admin.from('profiles').insert({
      id: invited!.user.id,
      role: 'cliente',
      full_name: 'Juan Encontrado',
      email,
      dni,
      domicilio: 'Domicilio Encontrado 333',
      telefono_numero: '3517777777',
    })

    const loteId = await crearLoteDisponible(`E2E Buscar DNI Match ${Date.now()}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)

    // Escribe algo en OTRO campo primero -- el punto del rediseño (bug real
    // reportado 01/09) es justamente que buscar no tiene que borrar esto.
    await page.getByPlaceholder('Domicilio').fill('Borrador que no se tiene que perder')

    await page.getByPlaceholder('Buscar cliente por DNI o nombre').fill(dni)
    await page.getByRole('button', { name: new RegExp(`${dni}.*Juan Encontrado`) }).click()

    await expect(page.getByText(/Encontramos a Juan Encontrado/)).toBeVisible()
    await expect(page.getByPlaceholder('Nombre completo')).toHaveValue('Juan Encontrado')
    await expect(page.getByPlaceholder('DNI *', { exact: true })).toHaveValue(dni)
    await expect(page.getByPlaceholder('Domicilio')).toHaveValue('Domicilio Encontrado 333')
    await expect(page.getByPlaceholder('Email')).toHaveValue(email)
    await expect(page.getByPlaceholder('9351234567')).toHaveValue('3517777777')
  })

  test('buscar por nombre también encuentra al cliente (no solo por DNI)', async ({ page }) => {
    const admin = createAdminClient()
    const nombreUnico = `Nombre Buscable ${Date.now()}`
    const email = `cliente.buscar.nombre.${Date.now()}@sima-e2e.invalid`

    const { data: invited } = await admin.auth.admin.inviteUserByEmail(email)
    await admin.from('profiles').insert({
      id: invited!.user.id,
      role: 'cliente',
      full_name: nombreUnico,
      email,
    })

    const loteId = await crearLoteDisponible(`E2E Buscar Nombre Match ${Date.now()}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await page.getByPlaceholder('Buscar cliente por DNI o nombre').fill('Nombre Buscable')

    await expect(page.getByRole('button', { name: new RegExp(nombreUnico) })).toBeVisible()
  })

  test('buscar algo que no coincide con nadie muestra el aviso, sin tocar el resto del formulario', async ({
    page,
  }) => {
    const loteId = await crearLoteDisponible(`E2E Buscar Sin Match ${Date.now()}`)
    const textoInexistente = `zzz-inexistente-${Date.now()}`

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await page.getByPlaceholder('Domicilio').fill('Esto tampoco se tiene que borrar')
    await page.getByPlaceholder('Buscar cliente por DNI o nombre').fill(textoInexistente)

    await expect(page.getByText('No encontramos ningún cliente con eso')).toBeVisible()
    await expect(page.getByPlaceholder('Nombre completo')).toHaveValue('')
    await expect(page.getByPlaceholder('Domicilio')).toHaveValue('Esto tampoco se tiene que borrar')
  })

  test('sin usar el buscador, el formulario de reservar se comporta igual que siempre', async ({
    page,
  }) => {
    const loteId = await crearLoteDisponible(`E2E Sin Buscador ${Date.now()}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)

    await expect(page.getByPlaceholder('Nombre completo')).toHaveValue('')
    await expect(page.getByText(/Encontramos a/)).toHaveCount(0)
    await expect(page.getByText('No encontramos ningún cliente')).toHaveCount(0)
  })
})
