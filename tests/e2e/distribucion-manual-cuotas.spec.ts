import { test, expect, Page } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

// El selector de participante es un input de texto con búsqueda (datalist)
// -- la clave real que viaja al servidor vive en un <input type="hidden">
// con el mismo `name` que antes tenía el <select>, como hermano inmediato
// en el DOM del input visible ("Buscar participante...", sin `name`, así
// que no se puede escopear por atributo). Se ubica el hidden por nombre+
// índice (igual que antes con el <select>) y desde ahí su hermano visible
// para tipear el nombre del participante.
async function seleccionarParticipante(page: Page, nombreHidden: string, indice: number, nombreParticipante: string) {
  const hidden = page.locator(`input[name="${nombreHidden}"]`).nth(indice)
  const visible = hidden.locator('xpath=preceding-sibling::input[1]')
  await visible.fill(nombreParticipante)
  await expect(hidden).not.toHaveValue('')
}

test.describe('Distribución manual por cuota', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test.afterEach(async () => {
    const admin = createAdminClient()
    await admin.from('cuota_distribuciones').delete().in('cuota_id', fixtures.cuotaIds)
    await admin.from('lote_distribucion_objetivos').delete().eq('lote_id', fixtures.loteId)
  })

  test('cargar distribución en una cuota (suma distinta al monto de la cuota) persiste al recargar', async ({
    page,
  }) => {
    const admin = createAdminClient()

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)

    await page.getByRole('button', { name: '+ Agregar participante a esta cuota' }).nth(0).click()
    await seleccionarParticipante(page, 'cuota1Participante', 0, 'E2E Vendedor A (vendedor)')
    await page.locator('input[name="cuota1Monto"]').nth(0).fill('400')

    await page.getByRole('button', { name: '+ Agregar participante a esta cuota' }).nth(0).click()
    await seleccionarParticipante(page, 'cuota1Participante', 1, 'E2E Acreedor Con Datos (acreedor)')
    await page.locator('input[name="cuota1Monto"]').nth(1).fill('300')

    // Cuota 1 es de 1000 -- 400 + 300 = 700, suma distinta al monto de la
    // cuota, y el guardado tiene que funcionar igual sin ningún error.
    await page.getByRole('button', { name: 'Guardar distribución' }).click()
    await page.waitForURL(/ok=1/)

    await expect(page.getByText('Distribución guardada.')).toBeVisible()

    const { data: distribuciones } = await admin
      .from('cuota_distribuciones')
      .select('profile_id, monto')
      .eq('cuota_id', fixtures.cuotaIds[0])
      .order('monto', { ascending: false })

    expect(distribuciones).toEqual([
      { profile_id: fixtures.vendedorLoteA.id, monto: 400 },
      { profile_id: fixtures.acreedorConDatos.id, monto: 300 },
    ])

    // Ninguno de los dos tiene objetivo cargado -- el resumen tiene que
    // mostrar solo el acumulado, sin comparar contra nada ("—").
    const filaResumen = page.locator('tr', { hasText: 'E2E Vendedor A (vendedor)' })
    await expect(filaResumen.getByText('—')).toBeVisible()

    await page.reload()
    await expect(page.locator('input[name="cuota1Participante"]').nth(0)).toHaveValue(
      `profile:${fixtures.vendedorLoteA.id}`
    )
    await expect(page.getByPlaceholder('Buscar participante...').nth(0)).toHaveValue(
      'E2E Vendedor A (vendedor)'
    )
    await expect(page.locator('input[name="cuota1Monto"]').nth(0)).toHaveValue('400')
  })

  test('objetivo opcional: el resumen pasa a "Saldado" en vivo al cargar la segunda cuota, sin guardar', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)

    await page.getByRole('button', { name: '+ Agregar objetivo' }).click()
    await seleccionarParticipante(page, 'objetivoParticipante', 0, 'E2E Vendedor A (vendedor)')
    await page.locator('input[name="objetivoMonto"]').nth(0).fill('1000')

    await page.getByRole('button', { name: '+ Agregar participante a esta cuota' }).nth(0).click()
    await seleccionarParticipante(page, 'cuota1Participante', 0, 'E2E Vendedor A (vendedor)')
    await page.locator('input[name="cuota1Monto"]').nth(0).fill('500')

    await expect(page.getByText('500 de 1000, faltan 500')).toBeVisible()

    await page.getByRole('button', { name: '+ Agregar participante a esta cuota' }).nth(1).click()
    await seleccionarParticipante(page, 'cuota2Participante', 0, 'E2E Vendedor A (vendedor)')
    await page.locator('input[name="cuota2Monto"]').nth(0).fill('500')

    // Todo esto pasó sin ningún guardado ni recarga -- el resumen cruzó
    // las dos cuotas al instante, del lado del cliente.
    await expect(page.getByText('Saldado')).toBeVisible()
  })

  test('modificar la distribución de una cuota puntual no toca las demás cuotas', async ({ page }) => {
    const admin = createAdminClient()

    await admin.from('cuota_distribuciones').insert([
      { cuota_id: fixtures.cuotaIds[0], profile_id: fixtures.vendedorLoteA.id, monto: 500 },
      { cuota_id: fixtures.cuotaIds[1], profile_id: fixtures.acreedorConDatos.id, monto: 700 },
    ])

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)

    await expect(page.locator('input[name="cuota1Monto"]').nth(0)).toHaveValue('500')
    await expect(page.locator('input[name="cuota2Monto"]').nth(0)).toHaveValue('700')

    await page.locator('input[name="cuota1Monto"]').nth(0).fill('600')
    await page.getByRole('button', { name: 'Guardar distribución' }).click()
    await page.waitForURL(/ok=1/)

    const { data: distribucionCuota1 } = await admin
      .from('cuota_distribuciones')
      .select('monto')
      .eq('cuota_id', fixtures.cuotaIds[0])
      .single()
    expect(distribucionCuota1?.monto).toBe(600)

    const { data: distribucionCuota2 } = await admin
      .from('cuota_distribuciones')
      .select('monto')
      .eq('cuota_id', fixtures.cuotaIds[1])
      .single()
    expect(distribucionCuota2?.monto).toBe(700)
  })

  test('una cuenta externa y un profile pueden ser beneficiarios de la misma cuota, sin conflicto', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const nombreCuentaExterna = `E2E Distribución Externa ${Date.now()}`
    const { data: cuentaExterna } = await admin
      .from('cuentas_externas')
      .insert({
        nombre: nombreCuentaExterna,
        titular: 'Corralón Distribución',
        alias: 'corralon.distribucion',
        banco: 'Banco Test',
      })
      .select('id')
      .single()

    // Desde el 05/09 la distribución solo ofrece a los integrantes del lote,
    // así que una cuenta externa recién creada primero hay que sumarla al
    // lote como participante (es lo mismo que hace el admin desde la
    // sección de cobro).
    await admin
      .from('lote_participantes')
      .insert({ lote_id: fixtures.loteId, cuenta_externa_id: cuentaExterna!.id })

    try {
      await login(page, fixtures.admin.email, fixtures.password)
      await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)

      // Fila 0 de la cuota 1: la cuenta externa.
      await page.getByRole('button', { name: '+ Agregar participante a esta cuota' }).nth(0).click()
      await seleccionarParticipante(page, 'cuota1Participante', 0, `${nombreCuentaExterna} (cuenta externa)`)
      await page.locator('input[name="cuota1Monto"]').nth(0).fill('250')

      // Fila 1 de la MISMA cuota 1: un profile.
      await page.getByRole('button', { name: '+ Agregar participante a esta cuota' }).nth(0).click()
      await seleccionarParticipante(page, 'cuota1Participante', 1, 'E2E Vendedor A (vendedor)')
      await page.locator('input[name="cuota1Monto"]').nth(1).fill('150')

      await page.getByRole('button', { name: 'Guardar distribución' }).click()
      await page.waitForURL(/ok=1/)

      const { data: distribuciones } = await admin
        .from('cuota_distribuciones')
        .select('profile_id, cuenta_externa_id, monto')
        .eq('cuota_id', fixtures.cuotaIds[0])
        .order('monto', { ascending: false })

      expect(distribuciones).toEqual([
        { profile_id: null, cuenta_externa_id: cuentaExterna!.id, monto: 250 },
        { profile_id: fixtures.vendedorLoteA.id, cuenta_externa_id: null, monto: 150 },
      ])
    } finally {
      await admin.from('cuota_distribuciones').delete().eq('cuenta_externa_id', cuentaExterna!.id)
      await admin.from('lote_participantes').delete().eq('cuenta_externa_id', cuentaExterna!.id)
      await admin.from('cuentas_externas').delete().eq('id', cuentaExterna!.id)
    }
  })

  test('seleccionar el mismo participante dos veces en la misma cuota suma los montos en vez de fallar', async ({
    page,
  }) => {
    const admin = createAdminClient()

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)

    await page.getByRole('button', { name: '+ Agregar participante a esta cuota' }).nth(0).click()
    await seleccionarParticipante(page, 'cuota1Participante', 0, 'E2E Vendedor A (vendedor)')
    await page.locator('input[name="cuota1Monto"]').nth(0).fill('200')

    await page.getByRole('button', { name: '+ Agregar participante a esta cuota' }).nth(0).click()
    await seleccionarParticipante(page, 'cuota1Participante', 1, 'E2E Vendedor A (vendedor)')
    await page.locator('input[name="cuota1Monto"]').nth(1).fill('300')

    await page.getByRole('button', { name: 'Guardar distribución' }).click()
    await page.waitForURL(/ok=1/)

    const { data: distribuciones } = await admin
      .from('cuota_distribuciones')
      .select('profile_id, monto')
      .eq('cuota_id', fixtures.cuotaIds[0])

    expect(distribuciones).toEqual([{ profile_id: fixtures.vendedorLoteA.id, monto: 500 }])
  })

  test('un lote que no está vendido muestra un aviso en vez del formulario de distribución', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const { data: loteDisponible } = await admin
      .from('lotes')
      .insert({
        identificador: `E2E Distribución No Vendido ${Date.now()}`,
        moneda: 'USD',
        estado: 'disponible',
      })
      .select('id')
      .single()

    try {
      await login(page, fixtures.admin.email, fixtures.password)
      await page.goto(`/admin/lotes/${loteDisponible!.id}/distribucion`)

      await expect(page.getByText(/no está vendido/)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Guardar distribución' })).toHaveCount(0)
    } finally {
      await admin.from('lotes').delete().eq('id', loteDisponible!.id)
    }
  })

  test('el gate server-side de "lote vendido" rechaza el guardado si el lote deja de estar vendido entre cargar la pantalla y guardar', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const { data: loteTemporal } = await admin
      .from('lotes')
      .insert({
        identificador: `E2E Distribución Race Condition ${Date.now()}`,
        moneda: 'USD',
        estado: 'vendido',
        // Con vendedor asignado: la distribución solo ofrece a los
        // integrantes del lote, y un lote sin nadie asignado no tiene a
        // quién repartirle nada.
        vendedor_id: fixtures.vendedorLoteA.id,
      })
      .select('id')
      .single()

    const { data: cuotaTemporal } = await admin
      .from('cuotas')
      .insert({
        lote_id: loteTemporal!.id,
        numero: 1,
        monto_base: 1000,
        saldo_pendiente: 1000,
        fecha_vencimiento: '2026-09-01',
      })
      .select('id')
      .single()

    try {
      await login(page, fixtures.admin.email, fixtures.password)
      await page.goto(`/admin/lotes/${loteTemporal!.id}/distribucion`)

      await page.getByRole('button', { name: '+ Agregar participante a esta cuota' }).nth(0).click()
      await seleccionarParticipante(page, 'cuota1Participante', 0, 'E2E Vendedor A (vendedor)')
      await page.locator('input[name="cuota1Monto"]').nth(0).fill('500')

      await admin.from('lotes').update({ estado: 'reservado' }).eq('id', loteTemporal!.id)

      await expect
        .poll(
          async () => {
            const { data: lote } = await admin.from('lotes').select('estado').eq('id', loteTemporal!.id).single()
            return lote?.estado ?? null
          },
          { timeout: 10000 }
        )
        .toBe('reservado')

      await page.getByRole('button', { name: 'Guardar distribución' }).click()

      await expect(page.getByText('Este lote no está vendido, no se puede guardar una distribución')).toBeVisible()

      const { data: distribuciones } = await admin
        .from('cuota_distribuciones')
        .select('id')
        .eq('cuota_id', cuotaTemporal!.id)
      expect(distribuciones).toEqual([])
    } finally {
      await admin.from('cuota_distribuciones').delete().eq('cuota_id', cuotaTemporal!.id)
      await admin.from('cuotas').delete().eq('id', cuotaTemporal!.id)
      await admin.from('lotes').delete().eq('id', loteTemporal!.id)
    }
  })

  test('quitar una fila y guardar borra esa distribución de la base (dirección de borrado del reemplazo completo)', async ({
    page,
  }) => {
    const admin = createAdminClient()

    await admin.from('cuota_distribuciones').insert({
      cuota_id: fixtures.cuotaIds[0],
      profile_id: fixtures.vendedorLoteA.id,
      monto: 500,
    })

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)

    await expect(page.locator('input[name="cuota1Monto"]').nth(0)).toHaveValue('500')

    await page.getByRole('button', { name: 'Quitar' }).first().click()
    await page.getByRole('button', { name: 'Guardar distribución' }).click()
    await page.waitForURL(/ok=1/)

    const { data: distribuciones } = await admin
      .from('cuota_distribuciones')
      .select('id')
      .eq('cuota_id', fixtures.cuotaIds[0])
    expect(distribuciones).toEqual([])
  })
})
