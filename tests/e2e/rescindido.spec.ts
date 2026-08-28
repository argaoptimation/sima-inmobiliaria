import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login, logout } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

async function crearLoteVendidoConPagoConfirmado(
  identificador: string,
  clienteId: string,
  acreedorId: string
) {
  const admin = createAdminClient()

  const { data: lote, error: errorLote } = await admin
    .from('lotes')
    .insert({
      identificador,
      moneda: 'USD',
      estado: 'vendido',
      cliente_id: clienteId,
      acreedor_id: acreedorId,
      cantidad_cuotas: 2,
      monto_cuota_base: 1000,
    })
    .select('id')
    .single()

  if (errorLote || !lote) {
    throw new Error(`No se pudo crear el lote de prueba: ${errorLote?.message}`)
  }

  const { data: cuotas, error: errorCuotas } = await admin
    .from('cuotas')
    .insert([
      { lote_id: lote.id, numero: 1, monto_base: 1000, saldo_pendiente: 0, fecha_vencimiento: '2027-01-10' },
      { lote_id: lote.id, numero: 2, monto_base: 1000, saldo_pendiente: 1000, fecha_vencimiento: '2027-02-10' },
    ])
    .select('id, numero')

  if (errorCuotas || !cuotas) {
    throw new Error(`No se pudieron crear las cuotas de prueba: ${errorCuotas?.message}`)
  }

  const cuota1 = cuotas.find((c) => c.numero === 1)!

  // Un pago CONFIRMADO imputado a la cuota 1 (ya saldada) -- esto es lo
  // que "total cobrado mientras estuvo vendido" tiene que sumar.
  const { data: pago, error: errorPago } = await admin
    .from('pagos')
    .insert({ cliente_id: clienteId, lote_id: lote.id, monto: 1000, moneda: 'USD', estado: 'confirmado' })
    .select('id')
    .single()

  if (errorPago || !pago) {
    throw new Error(`No se pudo crear el pago de prueba: ${errorPago?.message}`)
  }

  const { error: errorImputacion } = await admin
    .from('pago_imputaciones')
    .insert({ pago_id: pago.id, cuota_id: cuota1.id, monto_imputado: 1000 })

  if (errorImputacion) {
    throw new Error(`No se pudo imputar el pago de prueba: ${errorImputacion.message}`)
  }

  return { loteId: lote.id as string, cuotaIds: cuotas.map((c) => c.id as string) }
}

test.describe('Rescindido de lote (24/08)', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('vendido -> rescindido -> disponible, con historial y total cobrado', async ({ page }) => {
    const { loteId } = await crearLoteVendidoConPagoConfirmado(
      `E2E Rescindido ${Date.now()}`,
      fixtures.cliente.id,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}`)

    await expect(page.getByRole('button', { name: 'Rescindir' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Volver a disponible' })).toHaveCount(0)

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Rescindir' }).click()
    await page.waitForURL(`**/admin/lotes/${loteId}`)

    const admin = createAdminClient()
    await expect(async () => {
      const { data: lote } = await admin.from('lotes').select('estado').eq('id', loteId).single()
      expect(lote?.estado).toBe('rescindido')
    }).toPass({ timeout: 5000 })

    await page.reload()

    await expect(page.getByText('Estado: rescindido')).toBeVisible()
    // El historial de estados va colapsado dentro de un <details> (pedido
    // de Gabriel 24/08: que no ocupe lugar visual salvo que se abra).
    await page.getByText(/Historial de estados del lote/).click()
    await expect(page.getByText('Total cobrado mientras estuvo vendido: 1000 USD')).toBeVisible()
    await expect(page.getByText('vendido → rescindido')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Rescindir' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Volver a disponible' })).toBeVisible()

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Volver a disponible' }).click()
    await page.waitForURL(`**/admin/lotes/${loteId}`)

    await expect(async () => {
      const { data: lote } = await admin.from('lotes').select('estado, cliente_id').eq('id', loteId).single()
      expect(lote?.estado).toBe('disponible')
      expect(lote?.cliente_id).toBeNull()
    }).toPass({ timeout: 5000 })

    await page.reload()
    await page.getByText(/Historial de estados del lote/).click()
    await expect(page.getByText('vendido → rescindido')).toBeVisible()
    await expect(page.getByText('rescindido → disponible')).toBeVisible()
    // El total cobrado sigue mostrándose -- es el historial de ese ciclo,
    // no depende del estado actual.
    await expect(page.getByText('Total cobrado mientras estuvo vendido: 1000 USD')).toBeVisible()
  })

  test('no se puede rescindir un lote que no está vendido (gate server-side)', async ({ page }) => {
    const admin = createAdminClient()
    const { data: lote, error } = await admin
      .from('lotes')
      .insert({
        identificador: `E2E Rescindir Disponible ${Date.now()}`,
        moneda: 'USD',
        estado: 'disponible',
        acreedor_id: fixtures.acreedorConDatos.id,
        cantidad_cuotas: 1,
        monto_cuota_base: 1,
      })
      .select('id')
      .single()

    if (error || !lote) throw new Error(`No se pudo crear el lote: ${error?.message}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${lote.id}`)

    // Un lote disponible no tiene botón "Rescindir" en la UI -- confirmamos
    // también el rechazo server-side por si alguien fuerza el submit.
    await expect(page.getByRole('button', { name: 'Rescindir' })).toHaveCount(0)
  })

  test('un acreedor no ve los botones de rescindir ni volver a disponible', async ({ page }) => {
    const { loteId } = await crearLoteVendidoConPagoConfirmado(
      `E2E Rescindido Acreedor ${Date.now()}`,
      fixtures.cliente.id,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}`)

    await expect(page.getByRole('button', { name: 'Rescindir' })).toHaveCount(0)
  })

  test('regresión 24/08: revender un lote rescindido-y-disponible no choca con las cuotas viejas (ciclo de venta)', async ({
    page,
  }) => {
    const admin = createAdminClient()

    // Ciclo 1: lote vendido con deuda sin cobrar -- esto es justo lo que
    // antes rompía al revender (unique(lote_id, numero) sin distinguir
    // ciclo).
    const { data: lote, error } = await admin
      .from('lotes')
      .insert({
        identificador: `E2E Reventa ${Date.now()}`,
        moneda: 'USD',
        estado: 'vendido',
        precio_total: 2000,
        cliente_id: fixtures.cliente.id,
        acreedor_id: fixtures.acreedorConDatos.id,
      })
      .select('id')
      .single()
    if (error || !lote) throw new Error(`No se pudo crear el lote: ${error?.message}`)

    const { error: errorCuota } = await admin
      .from('cuotas')
      .insert({ lote_id: lote.id, numero: 1, monto_base: 500, saldo_pendiente: 500, fecha_vencimiento: '2027-01-10' })
    if (errorCuota) throw new Error(`No se pudo crear la cuota: ${errorCuota.message}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${lote.id}`)

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Rescindir' }).click()
    await page.waitForURL(`**/admin/lotes/${lote.id}`)

    await expect(async () => {
      const { data: l } = await admin.from('lotes').select('estado').eq('id', lote.id).single()
      expect(l?.estado).toBe('rescindido')
    }).toPass({ timeout: 5000 })

    await page.reload()
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Volver a disponible' }).click()
    await page.waitForURL(`**/admin/lotes/${lote.id}`)

    await expect(async () => {
      const { data: l } = await admin.from('lotes').select('estado, ciclo_actual').eq('id', lote.id).single()
      expect(l?.estado).toBe('disponible')
      expect(l?.ciclo_actual).toBe(2)
    }).toPass({ timeout: 5000 })

    // Bypass del flujo de reserva (no es lo que este test verifica) --
    // vender exige estado "reservado".
    await admin.from('lotes').update({ estado: 'reservado' }).eq('id', lote.id)

    const email = `comprador.reventa.${Date.now()}@sima-e2e.invalid`
    await page.goto(`/admin/lotes/${lote.id}/vender`)
    await page.getByPlaceholder('Nombre completo del comprador').fill('Comprador Reventa E2E')
    await page.getByPlaceholder('Email del comprador').fill(email)
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2027-06-01')
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('2')
    await page.setInputFiles('[data-testid="documentoFirmado"]', {
      name: `e2e-documento-reventa-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      buffer: COMPROBANTE_BYTES,
    })
    // Sube directo a Storage en cuanto se elige -- esperar a que termine o
    // el submit se bloquea en silencio (campo oculto todavía vacío).
    await expect(page.locator('[data-testid="documentoFirmado"]')).toBeEnabled()
    await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
    await page.waitForURL('**/admin/lotes')

    // Sin choque: la venta se completó y quedó vendido de nuevo.
    const { data: loteFinal } = await admin
      .from('lotes')
      .select('estado, ciclo_actual')
      .eq('id', lote.id)
      .single()
    expect(loteFinal?.estado).toBe('vendido')
    expect(loteFinal?.ciclo_actual).toBe(2)

    const { data: todasLasCuotas } = await admin
      .from('cuotas')
      .select('numero, ciclo, saldo_pendiente')
      .eq('lote_id', lote.id)
      .order('ciclo', { ascending: true })
      .order('numero', { ascending: true })

    // Ciclo 1 (la deuda vieja) queda intacta, sin tocar.
    expect(todasLasCuotas?.filter((c) => c.ciclo === 1)).toEqual([{ numero: 1, ciclo: 1, saldo_pendiente: 500 }])
    // Ciclo 2 (la venta nueva) tiene sus 2 cuotas propias, numero 1 y 2 --
    // el mismo "numero 1" que ya existía en el ciclo 1, sin violar
    // ningún unique constraint.
    expect(todasLasCuotas?.filter((c) => c.ciclo === 2)).toHaveLength(2)

    // El detalle del lote solo muestra las cuotas del ciclo VIGENTE (2),
    // no mezcla la deuda vieja del ciclo 1 en la tabla activa.
    await page.goto(`/admin/lotes/${lote.id}`)
    const tablaCuotas = page.locator('h2', { hasText: 'Cuotas' }).locator('xpath=following-sibling::table[1]')
    await expect(tablaCuotas.locator('tbody tr')).toHaveCount(2)

    // Regresión 26/08 (bug real encontrado revisando refinanciación): el
    // portal del CLIENTE NUEVO tampoco tiene que mezclar la deuda vieja del
    // ciclo 1 (que era de otro comprador) con la suya del ciclo 2.
    const { data: compradorNuevo } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single()
    // inviteUserByEmail deja el mail sin confirmar (a diferencia de
    // ensureTestFixtures, que usa createUser con email_confirm: true) --
    // hay que confirmarlo a mano para poder loguearse con contraseña acá.
    await admin.auth.admin.updateUserById(compradorNuevo!.id, {
      password: fixtures.password,
      email_confirm: true,
    })

    await logout(page)
    await login(page, email, fixtures.password)
    await page.goto(`/portal-cliente/lotes/${lote.id}`)

    await expect(page.locator('tbody tr')).toHaveCount(2)
    await expect(page.getByText('Todavía no registraste ningún pago.')).toBeVisible()
  })

  test('destinos: muestra a quién se distribuyó cada cuota, sumado por participante (pedido 24/08)', async ({
    page,
  }) => {
    const { loteId, cuotaIds } = await crearLoteVendidoConPagoConfirmado(
      `E2E Destinos ${Date.now()}`,
      fixtures.cliente.id,
      fixtures.acreedorConDatos.id
    )

    const admin = createAdminClient()
    // El acreedor cobra de las 2 cuotas (300 + 400 = 700 en total), el
    // vendedor solo de la primera (200).
    await admin.from('cuota_distribuciones').insert([
      { cuota_id: cuotaIds[0], profile_id: fixtures.acreedorConDatos.id, monto: 300 },
      { cuota_id: cuotaIds[0], profile_id: fixtures.vendedorLoteA.id, monto: 200 },
      { cuota_id: cuotaIds[1], profile_id: fixtures.acreedorConDatos.id, monto: 400 },
    ])

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}`)
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Rescindir' }).click()
    await page.waitForURL(`**/admin/lotes/${loteId}`)

    await page.reload()

    const seccionDestinos = page.locator('h2', { hasText: 'Destinos' }).locator('xpath=..')
    await expect(seccionDestinos.getByText('E2E Acreedor Con Datos — 700 USD')).toBeVisible()
    await expect(seccionDestinos.getByText('E2E Vendedor A — 200 USD')).toBeVisible()
  })

  test('historial global (/admin/historial-lotes): lista el cambio de todos los lotes, filtrable por estado (pedido 25/08)', async ({
    page,
  }) => {
    const { loteId } = await crearLoteVendidoConPagoConfirmado(
      `E2E HistorialGlobal ${Date.now()}`,
      fixtures.cliente.id,
      fixtures.acreedorConDatos.id
    )

    const admin = createAdminClient()
    const { data: lote } = await admin.from('lotes').select('identificador').eq('id', loteId).single()
    const identificador = lote!.identificador as string

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}`)
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Rescindir' }).click()
    await page.waitForURL(`**/admin/lotes/${loteId}`)

    await page.goto('/admin/historial-lotes')
    // Es una vista GLOBAL (todos los lotes) -- puede haber muchas otras
    // filas "vendido → rescindido" de corridas anteriores, por eso se
    // acota a la fila de ESTE lote en vez de buscar el texto suelto.
    // toPass + reload: mismo quirk de lectura stale ya documentado en este
    // proyecto en otros specs (el insert ya está confirmado, pero la
    // primera lectura después puede no verlo todavía).
    const filaDeEsteLote = page.locator('tbody tr', { hasText: identificador })
    await expect(async () => {
      await page.reload()
      await expect(filaDeEsteLote).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 10000 })
    await expect(filaDeEsteLote.getByText('vendido → rescindido')).toBeVisible()

    // Filtrar por estado "disponible" -- este lote pasó a "rescindido", no
    // a "disponible", así que no debería aparecer.
    await page.getByLabel('Pasó a estado').selectOption('disponible')
    await page.getByRole('button', { name: 'Filtrar' }).click()
    await expect(page.getByRole('link', { name: identificador })).toHaveCount(0)
  })

  // 25/08: Nicolás confirmó que el cobrador también puede ver el historial
  // global de lotes -- solo acreedor/vendedor quedan afuera.
  test('un cobrador SÍ puede acceder a /admin/historial-lotes, un acreedor no', async ({ page }) => {
    await login(page, fixtures.cobrador.email, fixtures.password)
    await page.goto('/admin/historial-lotes')
    await expect(page).toHaveURL(/\/admin\/historial-lotes/)

    await logout(page)
    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto('/admin/historial-lotes')
    await expect(page).toHaveURL(/\/admin\/lotes/)
  })
})
