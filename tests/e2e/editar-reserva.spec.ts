import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

async function crearLoteReservado(identificador: string, acreedorId: string, adminId: string) {
  const admin = createAdminClient()
  const { data: lote, error } = await admin
    .from('lotes')
    .insert({ identificador, moneda: 'USD', estado: 'disponible', acreedor_id: acreedorId })
    .select('id')
    .single()
  if (error || !lote) throw new Error(`No se pudo crear el lote: ${error?.message}`)

  const { error: errorReserva } = await admin.from('reservas').insert({
    lote_id: lote.id,
    nombre_completo: 'Comprador Original',
    dni: '11111111',
    domicilio: 'Calle Falsa 123',
    email: 'original@sima-e2e.invalid',
    telefono_numero: '3511111111',
    estado_civil: 'soltero',
    monto_sena: 500,
    moneda_sena: 'USD',
    comprobante_sena_path: 'reservas/seed/comprobante-original.pdf',
    dni_frente_path: 'reservas/seed/dni-frente-original.pdf',
    dni_dorso_path: 'reservas/seed/dni-dorso-original.pdf',
    recibido_por: adminId,
    created_by: adminId,
  })
  if (errorReserva) throw new Error(`No se pudo crear la reserva: ${errorReserva.message}`)

  await admin.from('lotes').update({ estado: 'reservado' }).eq('id', lote.id)

  return lote.id as string
}

test.describe('Editar reserva ya cargada', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('editar campos de texto persiste y no toca los archivos originales', async ({ page }) => {
    const admin = createAdminClient()
    const loteId = await crearLoteReservado(`E2E Editar Reserva Texto ${Date.now()}`, fixtures.acreedorConDatos.id, fixtures.admin.id)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar/editar`)

    await expect(page.getByPlaceholder('Nombre completo')).toHaveValue('Comprador Original')
    await page.getByPlaceholder('9351234567').fill('3512222222')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await page.waitForURL(`**/admin/lotes/${loteId}`)

    const { data: reserva } = await admin
      .from('reservas')
      .select('telefono_prefijo, telefono_numero, comprobante_sena_path, dni_frente_path')
      .eq('lote_id', loteId)
      .is('cancelada_at', null)
      .single()

    expect(reserva?.telefono_prefijo).toBe('54')
    expect(reserva?.telefono_numero).toBe('3512222222')
    expect(reserva?.comprobante_sena_path).toBe('reservas/seed/comprobante-original.pdf')
    expect(reserva?.dni_frente_path).toBe('reservas/seed/dni-frente-original.pdf')
  })

  test('reemplazar el comprobante sube uno nuevo y cambia el path guardado', async ({ page }) => {
    const admin = createAdminClient()
    const loteId = await crearLoteReservado(`E2E Editar Reserva Archivo ${Date.now()}`, fixtures.acreedorConDatos.id, fixtures.admin.id)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar/editar`)

    await page.setInputFiles('input[name="comprobante"]', {
      name: `comprobante-nuevo-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      buffer: COMPROBANTE_BYTES,
    })
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await page.waitForURL(`**/admin/lotes/${loteId}`)

    const { data: reserva } = await admin
      .from('reservas')
      .select('comprobante_sena_path')
      .eq('lote_id', loteId)
      .is('cancelada_at', null)
      .single()

    expect(reserva?.comprobante_sena_path).not.toBe('reservas/seed/comprobante-original.pdf')
    expect(reserva?.comprobante_sena_path).toBeTruthy()

    await page.goto(`/admin/lotes/${loteId}`)
    await expect(page.getByRole('link', { name: 'Ver comprobante de la seña' })).toBeVisible()
  })

  test('cambiar a "casado" sin DNI del cónyuge (nuevo ni existente) es rechazado', async ({ page }) => {
    const loteId = await crearLoteReservado(`E2E Editar Reserva Casado Rechazo ${Date.now()}`, fixtures.acreedorConDatos.id, fixtures.admin.id)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar/editar`)

    await page.selectOption('select[name="estadoCivil"]', 'casado')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()

    await expect(page.getByText('Subí el DNI del cónyuge')).toBeVisible()
  })

  test('cambiar a "casado" cuando ya había un DNI del cónyuge guardado no exige uno nuevo', async ({ page }) => {
    const admin = createAdminClient()
    const loteId = await crearLoteReservado(`E2E Editar Reserva Casado OK ${Date.now()}`, fixtures.acreedorConDatos.id, fixtures.admin.id)
    await admin
      .from('reservas')
      .update({ dni_conyuge_path: 'reservas/seed/dni-conyuge-original.pdf' })
      .eq('lote_id', loteId)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar/editar`)

    await page.selectOption('select[name="estadoCivil"]', 'casado')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await page.waitForURL(`**/admin/lotes/${loteId}`)

    const { data: reserva } = await admin
      .from('reservas')
      .select('estado_civil, dni_conyuge_path')
      .eq('lote_id', loteId)
      .is('cancelada_at', null)
      .single()

    expect(reserva?.estado_civil).toBe('casado')
    expect(reserva?.dni_conyuge_path).toBe('reservas/seed/dni-conyuge-original.pdf')
  })

  test('un lote que no está reservado muestra un aviso en vez del formulario', async ({ page }) => {
    const admin = createAdminClient()
    const { data: loteDisponible } = await admin
      .from('lotes')
      .insert({ identificador: `E2E Editar Reserva No Reservado ${Date.now()}`, moneda: 'USD', estado: 'disponible' })
      .select('id')
      .single()

    try {
      await login(page, fixtures.admin.email, fixtures.password)
      await page.goto(`/admin/lotes/${loteDisponible!.id}/reservar/editar`)

      await expect(page.getByText(/no está disponible para editar|no está reservado/)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0)
    } finally {
      await admin.from('lotes').delete().eq('id', loteDisponible!.id)
    }
  })

  test('un acreedor no puede acceder a editar reserva', async ({ page }) => {
    const loteId = await crearLoteReservado(`E2E Editar Reserva Sin Acceso ${Date.now()}`, fixtures.acreedorConDatos.id, fixtures.admin.id)

    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar/editar`)

    await expect(page).not.toHaveURL(`**/admin/lotes/${loteId}/reservar/editar`)
  })

  test('editar sin tocar "quién recibió la seña" no pisa un receptor "otro" ya guardado', async ({ page }) => {
    const admin = createAdminClient()
    const loteId = await crearLoteReservado(`E2E Editar Reserva Recibido Otro ${Date.now()}`, fixtures.acreedorConDatos.id, fixtures.admin.id)

    await admin
      .from('reservas')
      .update({ recibido_por: null, recibido_por_otro: 'Alguien Externo' })
      .eq('lote_id', loteId)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar/editar`)

    // El select tiene que quedar en "no está en la lista", no en el admin logueado.
    await expect(page.locator('select[name="recibidoPor"]')).toHaveValue('')

    // Editar un campo sin relación y guardar.
    await page.getByPlaceholder('9351234567').fill('3513333333')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await page.waitForURL(`**/admin/lotes/${loteId}`)

    const { data: reserva } = await admin
      .from('reservas')
      .select('recibido_por, recibido_por_otro, telefono_prefijo, telefono_numero')
      .eq('lote_id', loteId)
      .is('cancelada_at', null)
      .single()

    expect(reserva?.recibido_por).toBeNull()
    expect(reserva?.recibido_por_otro).toBe('Alguien Externo')
    expect(reserva?.telefono_prefijo).toBe('54')
    expect(reserva?.telefono_numero).toBe('3513333333')
  })

  test('los datos de texto se preservan si falla la validación', async ({ page }) => {
    const loteId = await crearLoteReservado(`E2E Editar Reserva Preservar ${Date.now()}`, fixtures.acreedorConDatos.id, fixtures.admin.id)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar/editar`)

    await page.getByPlaceholder('Nombre completo').fill('Nombre Corregido')
    await page.selectOption('select[name="estadoCivil"]', 'casado')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()

    await expect(page.getByText('Subí el DNI del cónyuge')).toBeVisible()
    await expect(page.getByPlaceholder('Nombre completo')).toHaveValue('Nombre Corregido')
  })
})
