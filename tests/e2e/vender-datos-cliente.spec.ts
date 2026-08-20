import { test, expect, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

async function crearLoteDisponibleConPrecio(identificador: string, precioTotal: number) {
  const admin = createAdminClient()
  const { data: lote, error } = await admin
    .from('lotes')
    .insert({
      identificador,
      moneda: 'USD',
      estado: 'disponible',
      ubicacion: 'Ubicación E2E',
      precio_total: precioTotal,
    })
    .select('id')
    .single()

  if (error || !lote) {
    throw new Error(`No se pudo crear el lote de prueba: ${error?.message}`)
  }

  return lote.id as string
}

async function reservarLotePorUI(
  page: Page,
  loteId: string,
  datos: {
    nombreCompleto: string
    dni: string
    domicilio: string
    telefono: string
    email: string
    montoSena: string
  }
) {
  await page.goto(`/admin/lotes/${loteId}/reservar`)
  await page.getByPlaceholder('Nombre completo').fill(datos.nombreCompleto)
  await page.getByPlaceholder('DNI', { exact: true }).fill(datos.dni)
  await page.getByPlaceholder('Domicilio').fill(datos.domicilio)
  await page.getByPlaceholder('Email').fill(datos.email)
  await page.getByPlaceholder('9351234567').fill(datos.telefono)
  await page.selectOption('select[name="estadoCivil"]', 'soltero')
  await page.getByPlaceholder('Monto de la seña').fill(datos.montoSena)
  await page.selectOption('select[name="monedaSena"]', 'USD')
  await page.setInputFiles('input[name="comprobante"]', {
    name: `e2e-comprobante-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    buffer: COMPROBANTE_BYTES,
  })
  await page.setInputFiles('input[name="dniFrente"]', {
    name: `e2e-dni-frente-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    buffer: COMPROBANTE_BYTES,
  })
  await page.setInputFiles('input[name="dniDorso"]', {
    name: `e2e-dni-dorso-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    buffer: COMPROBANTE_BYTES,
  })
  await page.getByRole('button', { name: 'Confirmar reserva' }).click()
  await page.waitForURL('**/admin/lotes')
}

async function venderLotePorUI(page: Page, loteId: string, datos: { email: string; fullName: string }) {
  await page.goto(`/admin/lotes/${loteId}/vender`)
  await page.getByPlaceholder('Nombre completo del comprador').fill(datos.fullName)
  await page.getByPlaceholder('Email del comprador').fill(datos.email)
  await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('1')
  await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
  await page.setInputFiles('input[name="documentoFirmado"]', {
    name: `e2e-documento-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    buffer: COMPROBANTE_BYTES,
  })
  await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
  await page.waitForURL(
    (url) => url.pathname === '/admin/lotes' || url.searchParams.has('confirmarClienteId')
  )
}

test.describe('Datos del cliente al vender', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('cliente nuevo: DNI, domicilio y teléfono quedan copiados en su perfil', async ({ page }) => {
    const admin = createAdminClient()
    const loteId = await crearLoteDisponibleConPrecio(`E2E Vender DNI Nuevo ${Date.now()}`, 5000)
    const email = `sena.dni.nuevo.${Date.now()}@sima-e2e.invalid`
    const dni = `${Date.now()}`.slice(-8)

    await login(page, fixtures.admin.email, fixtures.password)
    await reservarLotePorUI(page, loteId, {
      nombreCompleto: 'Cliente DNI Nuevo',
      dni,
      domicilio: 'Domicilio E2E 123',
      telefono: '3511111111',
      email,
      montoSena: '100',
    })

    await venderLotePorUI(page, loteId, { email, fullName: 'Cliente DNI Nuevo' })
    await page.waitForURL('**/admin/lotes')

    const { data: lote } = await admin.from('lotes').select('cliente_id').eq('id', loteId).single()
    const { data: cliente } = await admin
      .from('profiles')
      .select('dni, domicilio, telefono')
      .eq('id', lote!.cliente_id)
      .single()

    expect(cliente?.dni).toBe(dni)
    expect(cliente?.domicilio).toBe('Domicilio E2E 123')
    expect(cliente?.telefono).toBe('54|3511111111')
  })

  test('cliente existente sin esos datos cargados: se completan con los de la nueva reserva', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const email = `cliente.sin.datos.${Date.now()}@sima-e2e.invalid`

    const { data: invited } = await admin.auth.admin.inviteUserByEmail(email)
    await admin.from('profiles').insert({
      id: invited!.user.id,
      role: 'cliente',
      full_name: 'Cliente Sin Datos',
      email,
    })

    const loteId = await crearLoteDisponibleConPrecio(`E2E Vender Completar Datos ${Date.now()}`, 5000)
    const dni = `${Date.now()}`.slice(-8)

    await login(page, fixtures.admin.email, fixtures.password)
    await reservarLotePorUI(page, loteId, {
      nombreCompleto: 'Cliente Sin Datos',
      dni,
      domicilio: 'Domicilio Completado 456',
      telefono: '3512222222',
      email,
      montoSena: '100',
    })

    await venderLotePorUI(page, loteId, { email, fullName: 'Cliente Sin Datos' })
    if (page.url().includes('confirmarClienteId')) {
      await page.setInputFiles('input[name="documentoFirmado"]', {
        name: `e2e-documento-${Date.now()}.pdf`,
        mimeType: 'application/pdf',
        buffer: COMPROBANTE_BYTES,
      })
      await page.getByRole('button', { name: 'Confirmar venta con esta cuenta existente' }).click()
    }
    await page.waitForURL('**/admin/lotes')

    const { data: cliente } = await admin
      .from('profiles')
      .select('dni, domicilio, telefono')
      .eq('id', invited!.user.id)
      .single()

    expect(cliente?.dni).toBe(dni)
    expect(cliente?.domicilio).toBe('Domicilio Completado 456')
    expect(cliente?.telefono).toBe('54|3512222222')
  })

  test('cliente existente con DNI ya cargado, distinto al de la nueva reserva: aviso visible, se mantiene el guardado', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const email = `cliente.dni.distinto.${Date.now()}@sima-e2e.invalid`
    const dniOriginal = `${Date.now()}`.slice(-8)
    const dniNuevo = `${Number(dniOriginal) + 1}`

    const { data: invited } = await admin.auth.admin.inviteUserByEmail(email)
    await admin.from('profiles').insert({
      id: invited!.user.id,
      role: 'cliente',
      full_name: 'Cliente DNI Distinto',
      email,
      dni: dniOriginal,
    })

    const loteId = await crearLoteDisponibleConPrecio(`E2E Vender DNI Distinto ${Date.now()}`, 5000)

    await login(page, fixtures.admin.email, fixtures.password)
    await reservarLotePorUI(page, loteId, {
      nombreCompleto: 'Cliente DNI Distinto',
      dni: dniNuevo,
      domicilio: 'Domicilio E2E 789',
      telefono: '3513333333',
      email,
      montoSena: '100',
    })

    await venderLotePorUI(page, loteId, { email, fullName: 'Cliente DNI Distinto' })
    await page.waitForURL((url) => url.searchParams.has('confirmarClienteId'))

    await expect(page.getByText(/no coincide con el que ya tenía guardado/)).toBeVisible()
    await expect(page.getByText(dniOriginal, { exact: false })).toBeVisible()

    await page.setInputFiles('input[name="documentoFirmado"]', {
      name: `e2e-documento-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      buffer: COMPROBANTE_BYTES,
    })
    await page.getByRole('button', { name: 'Confirmar venta con esta cuenta existente' }).click()
    await page.waitForURL('**/admin/lotes')

    const { data: cliente } = await admin.from('profiles').select('dni').eq('id', invited!.user.id).single()
    expect(cliente?.dni).toBe(dniOriginal)
  })

  test('cliente nuevo con DNI que ya pertenece a otro cliente: la venta se completa igual, DNI queda vacío', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const dniYaUsado = `${Date.now()}`.slice(-8)
    const emailDuenioOriginal = `dueno.dni.${Date.now()}@sima-e2e.invalid`

    const { data: invitedOriginal } = await admin.auth.admin.inviteUserByEmail(emailDuenioOriginal)
    await admin.from('profiles').insert({
      id: invitedOriginal!.user.id,
      role: 'cliente',
      full_name: 'Dueño DNI Original',
      email: emailDuenioOriginal,
      dni: dniYaUsado,
    })

    const loteId = await crearLoteDisponibleConPrecio(`E2E Vender DNI Choque ${Date.now()}`, 5000)
    const emailNuevo = `nuevo.con.dni.usado.${Date.now()}@sima-e2e.invalid`

    await login(page, fixtures.admin.email, fixtures.password)
    await reservarLotePorUI(page, loteId, {
      nombreCompleto: 'Nuevo Con DNI Usado',
      dni: dniYaUsado,
      domicilio: 'Domicilio E2E 999',
      telefono: '3514444444',
      email: emailNuevo,
      montoSena: '100',
    })

    await venderLotePorUI(page, loteId, { email: emailNuevo, fullName: 'Nuevo Con DNI Usado' })
    await page.waitForURL('**/admin/lotes')

    const { data: lote } = await admin.from('lotes').select('cliente_id, estado').eq('id', loteId).single()
    expect(lote?.estado).toBe('vendido')

    const { data: clienteNuevo } = await admin
      .from('profiles')
      .select('dni')
      .eq('id', lote!.cliente_id)
      .single()
    expect(clienteNuevo?.dni).toBeNull()
  })
})
