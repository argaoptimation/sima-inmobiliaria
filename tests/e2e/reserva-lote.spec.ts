import { test, expect, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login, logout } from './utils/login'
import { elegirFormaPago } from './utils/reserva'

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
  await page.getByPlaceholder('DNI *', { exact: true }).fill('30111222')
  await page.getByPlaceholder('Domicilio').fill('Calle Falsa 123')
  await page.getByPlaceholder('Email').fill('comprador.e2e@sima-demo.invalid')
  await page.getByPlaceholder('9351234567').fill('3511234567')
  await page.selectOption('select[name="estadoCivil"]', 'soltero')
  await page.getByPlaceholder('Monto de la seña').fill('500')
  await page.setInputFiles('[data-testid="comprobante"]', {
    name: `e2e-reserva-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    buffer: COMPROBANTE_BYTES,
  })
  await page.setInputFiles('[data-testid="dniFrente"]', {
    name: `e2e-dni-frente-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    buffer: COMPROBANTE_BYTES,
  })
  await page.setInputFiles('[data-testid="dniDorso"]', {
    name: `e2e-dni-dorso-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    buffer: COMPROBANTE_BYTES,
  })
  // Los 3 archivos suben directo a Storage en cuanto se eligen (no esperan
  // al submit) -- hay que dejar que terminen o el campo oculto con el path
  // sigue vacío y el submit se bloquea en silencio por el required.
  await expect(page.locator('[data-testid="comprobante"]')).toBeEnabled()
  await expect(page.locator('[data-testid="dniFrente"]')).toBeEnabled()
  await expect(page.locator('[data-testid="dniDorso"]')).toBeEnabled()
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
    await elegirFormaPago(page)
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await page.waitForURL((url) => url.pathname === '/admin/lotes')

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
    await elegirFormaPago(page)
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await page.waitForURL((url) => url.pathname === '/admin/lotes')

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
    await elegirFormaPago(page)
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await page.waitForURL((url) => url.pathname === '/admin/lotes')

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
    await page.waitForURL((url) => url.pathname === '/admin/lotes')
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

  test('vendedor no puede abrir el detalle del lote ni ve Pagos/Usuarios', async ({ page }) => {
    const loteId = await crearLoteDisponible(`E2E Lote Detalle Bloqueado Vendedor ${Date.now()}`)

    await login(page, fixtures.vendedorSinLotes.email, fixtures.password)

    await test.step('no puede abrir el detalle', async () => {
      await page.goto(`/admin/lotes/${loteId}`)
      await page.waitForURL((url) => url.pathname === '/admin/lotes')
      await expect(page).toHaveURL(/\/admin\/lotes$/)
    })

    await test.step('no ve Pagos ni Usuarios en la nav', async () => {
      await page.goto('/admin/lotes')
      await expect(page.getByRole('link', { name: 'Pagos' })).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Usuarios' })).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Mi perfil' })).toBeVisible()
    })
  })

  // 25/08: Nicolás confirmó que el cobrador SÍ puede ver el detalle
  // completo del lote (si pagó, historial, etc.) -- lo único que no tiene
  // que ver es el reparto entre acreedores (Destinos/Cobro/Participantes,
  // ya gateados aparte) ni editar datos generales/documentos.
  test('cobrador puede abrir el detalle del lote pero no ve Datos generales ni Cobro', async ({
    page,
  }) => {
    const loteId = await crearLoteDisponible(`E2E Lote Detalle Cobrador ${Date.now()}`)

    await login(page, fixtures.cobrador.email, fixtures.password)

    await page.goto(`/admin/lotes/${loteId}`)
    await expect(page).toHaveURL(new RegExp(`/admin/lotes/${loteId}$`))
    await expect(page.getByText('Estado: disponible')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Datos generales' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Cobro' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Participantes adicionales' })).toHaveCount(0)

    await page.goto('/admin/lotes')
    await expect(page.getByRole('link', { name: 'Pagos' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Usuarios' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Mi perfil' })).toBeVisible()
  })

  test('el listado de lotes de un vendedor muestra disponibles y reservados (por cualquiera), pero "Reservar" solo aparece en los disponibles', async ({
    page,
  }) => {
    const identificadorDisponible = `E2E Lote Visible Para Vendedor ${Date.now()}`
    const identificadorReservado = `E2E Lote Oculto Para Vendedor ${Date.now()}`
    await crearLoteDisponible(identificadorDisponible)
    const loteReservadoId = await crearLoteDisponible(identificadorReservado)
    const admin = createAdminClient()
    await admin.from('lotes').update({ estado: 'reservado' }).eq('id', loteReservadoId)

    await login(page, fixtures.vendedorSinLotes.email, fixtures.password)
    await page.goto('/admin/lotes')

    const tablaGeneral = page.getByRole('table').last()
    const filaDisponible = tablaGeneral.getByRole('row', { name: identificadorDisponible })
    const filaReservada = tablaGeneral.getByRole('row', { name: identificadorReservado })

    await expect(filaDisponible).toBeVisible()
    await expect(filaReservada).toBeVisible()
    await expect(filaDisponible.getByRole('link', { name: 'Reservar' })).toBeVisible()
    await expect(filaReservada.getByRole('link', { name: 'Reservar' })).toHaveCount(0)
  })

  test('vendedor no puede abrir /admin/pagos navegando directo por URL', async ({ page }) => {
    await login(page, fixtures.vendedorSinLotes.email, fixtures.password)
    await page.goto('/admin/pagos')
    await page.waitForURL((url) => url.pathname === '/admin/lotes')
    await expect(page).toHaveURL(/\/admin\/lotes$/)
  })

  test('vendedor no puede abrir /admin/lotes/nuevo navegando directo por URL', async ({ page }) => {
    await login(page, fixtures.vendedorSinLotes.email, fixtures.password)
    await page.goto('/admin/lotes/nuevo')
    await page.waitForURL((url) => url.pathname === '/admin/lotes')
    await expect(page).toHaveURL(/\/admin\/lotes$/)
  })

  test('vendedor y cobrador no pueden abrir /admin/usuarios navegando directo por URL', async ({
    page,
  }) => {
    await test.step('vendedor', async () => {
      await login(page, fixtures.vendedorSinLotes.email, fixtures.password)
      await page.goto('/admin/usuarios')
      await page.waitForURL((url) => url.pathname === '/admin/lotes')
      await expect(page).toHaveURL(/\/admin\/lotes$/)
    })

    await test.step('cobrador', async () => {
      await logout(page)
      await login(page, fixtures.cobrador.email, fixtures.password)
      await page.goto('/admin/usuarios')
      await page.waitForURL((url) => url.pathname === '/admin/lotes')
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
    await elegirFormaPago(page)
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await page.waitForURL((url) => url.pathname === '/admin/lotes')

    const admin = createAdminClient()
    const { data: reserva } = await admin
      .from('reservas')
      .select('recibido_por, recibido_por_otro')
      .eq('lote_id', loteId)
      .single()

    expect(reserva?.recibido_por).toBeNull()
    expect(reserva?.recibido_por_otro).toBe('Persona Externa Sin Cuenta')
  })

  test('el administrador puede cancelar la reserva de un lote, aunque no la haya hecho él', async ({
    page,
  }) => {
    const loteId = await crearLoteDisponible(`E2E Lote Cancelar Admin ${Date.now()}`)

    await login(page, fixtures.vendedorSinLotes.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await completarDatosBasicosDeReserva(page)
    await elegirFormaPago(page)
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await page.waitForURL((url) => url.pathname === '/admin/lotes')

    await logout(page)
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}`)

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Cancelar reserva' }).click()
    await page.waitForURL((url) => url.pathname === '/admin/lotes')

    const admin = createAdminClient()
    const { data: lote } = await admin
      .from('lotes')
      .select('estado, vendedor_id')
      .eq('id', loteId)
      .single()
    expect(lote?.estado).toBe('disponible')
    expect(lote?.vendedor_id).toBeNull()

    const { data: reserva } = await admin
      .from('reservas')
      .select('cancelada_por, cancelada_at')
      .eq('lote_id', loteId)
      .single()
    expect(reserva?.cancelada_at).not.toBeNull()
    expect(reserva?.cancelada_por).toBe(fixtures.admin.id)
  })

  test('un vendedor puede cancelar la reserva que él mismo cargó, desde "Lotes que reservaste"', async ({
    page,
  }) => {
    const identificadorLote = `E2E Lote Cancelar Vendedor ${Date.now()}`
    const loteId = await crearLoteDisponible(identificadorLote)

    await login(page, fixtures.vendedorSinLotes.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await completarDatosBasicosDeReserva(page)
    await elegirFormaPago(page)
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await page.waitForURL((url) => url.pathname === '/admin/lotes')

    // El vendedor de prueba acumula reservas de otros tests en la misma
    // corrida -- hay que apuntar al botón de ESTA fila puntual, no
    // "Cancelar reserva" a secas (ambiguo si hay más de una reserva activa).
    // Y hay que buscarla específicamente dentro de la tabla "Lotes que
    // reservaste" (la primera de la página): una vez cancelada, el MISMO
    // identificador vuelve a aparecer -- correctamente -- en la tabla de
    // "Lotes disponibles" de abajo, así que un locator sin acotar a tabla
    // nunca bajaría a 0.
    const tablaMisReservas = page.getByRole('table').first()
    const filaDeEsteLote = tablaMisReservas.getByRole('row', { name: identificadorLote })
    page.once('dialog', (dialog) => dialog.accept())
    await filaDeEsteLote.getByRole('button', { name: 'Cancelar reserva' }).click()
    await page.waitForURL((url) => url.pathname === '/admin/lotes')

    const admin = createAdminClient()
    await expect(async () => {
      const { data: lote } = await admin.from('lotes').select('estado').eq('id', loteId).single()
      expect(lote?.estado).toBe('disponible')
    }).toPass({ timeout: 5000 })

    // La action redirige a la MISMA url (/admin/lotes) donde ya estábamos --
    // forzamos una navegación real para confirmar que la UI también refleja
    // el cambio, no solo la base de datos.
    await page.goto('/admin/lotes')
    await expect(page.getByRole('table').first().getByRole('row', { name: identificadorLote })).toHaveCount(0)
  })

  test('un vendedor ve la reserva de otro vendedor en el listado general, pero no puede cancelarla', async ({
    page,
  }) => {
    const identificadorLote = `E2E Lote Cancelar Ajena ${Date.now()}`
    const loteId = await crearLoteDisponible(identificadorLote)

    await login(page, fixtures.vendedorSinLotes.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await completarDatosBasicosDeReserva(page)
    await elegirFormaPago(page)
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await page.waitForURL((url) => url.pathname === '/admin/lotes')

    // El cobrador no cargó esta reserva -- no le aparece en "Lotes que
    // reservaste" (esa tabla sigue acotada a lo propio), pero sí en el
    // listado general de "Lotes disponibles y reservados", sin ningún botón
    // de "Cancelar reserva" (esa acción solo existe en la tabla de arriba).
    await logout(page)
    await login(page, fixtures.cobrador.email, fixtures.password)
    await page.goto('/admin/lotes')

    const tablaGeneral = page.getByRole('table').last()
    const filaDelLote = tablaGeneral.getByRole('row', { name: identificadorLote })
    await expect(filaDelLote).toBeVisible()
    await expect(filaDelLote.getByRole('button', { name: 'Cancelar reserva' })).toHaveCount(0)

    const admin = createAdminClient()
    const { data: loteSinCambios } = await admin
      .from('lotes')
      .select('estado')
      .eq('id', loteId)
      .single()
    expect(loteSinCambios?.estado).toBe('reservado')
  })
})
