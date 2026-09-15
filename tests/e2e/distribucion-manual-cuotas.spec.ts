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
    await page.getByRole('button', { name: 'Guardar distribución' }).first().click()
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
    const filaResumen = page.getByTestId('resumen-participante').filter({ hasText: 'E2E Vendedor A (vendedor)' })
    await expect(filaResumen.getByText('—')).toBeVisible()

    // Al recargar, dentro de la cuota va primero el que se lleva más (400).
    // Antes del 15/09 el orden salía al azar y este test pasaba por suerte.
    await page.reload()
    await expect(page.locator('input[name="cuota1Participante"]').nth(0)).toHaveValue(
      `profile:${fixtures.vendedorLoteA.id}`
    )
    await expect(page.getByPlaceholder('Buscar participante...').nth(0)).toHaveValue(
      'E2E Vendedor A (vendedor)'
    )
    await expect(page.locator('input[name="cuota1Monto"]').nth(0)).toHaveValue('400')
  })

  test('porcentaje del lote: la tarjeta compara en vivo lo repartido contra lo que le toca, sin guardar', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)

    // El lote de prueba tiene 3 cuotas de 1000: el 50% son 1500.
    await page.getByRole('spinbutton', { name: 'Porcentaje del lote de E2E Vendedor A (vendedor)' }).fill('50')

    await page.getByRole('button', { name: '+ Agregar participante a esta cuota' }).nth(0).click()
    await seleccionarParticipante(page, 'cuota1Participante', 0, 'E2E Vendedor A (vendedor)')
    await page.locator('input[name="cuota1Monto"]').nth(0).fill('500')

    const tarjeta = page.getByTestId('resumen-participante').filter({ hasText: 'E2E Vendedor A (vendedor)' })
    await expect(tarjeta).toContainText('50% = 1500: faltan 1000')

    await page.locator('tr[data-cuota="2"]').getByRole('button', { name: '+ Agregar participante a esta cuota' }).click()
    await seleccionarParticipante(page, 'cuota2Participante', 0, 'E2E Vendedor A (vendedor)')
    await page.locator('input[name="cuota2Monto"]').nth(0).fill('1000')

    // Todo esto pasó sin ningún guardado ni recarga: la tarjeta cruzó las
    // dos cuotas al instante, del lado del cliente.
    await expect(tarjeta).toContainText('50% · repartido completo')
  })

  test('repartir con porcentajes llena las cuotas sin pagos, no toca las que tienen pagos, y guardar persiste todo', async ({
    page,
  }) => {
    const admin = createAdminClient()

    // La cuota 1 ya tiene un pago imputado con su reparto de antes: eso ya
    // se anotó en la cuenta corriente y no se puede pisar.
    const { data: pago } = await admin
      .from('pagos')
      .insert({
        cliente_id: fixtures.cliente.id,
        lote_id: fixtures.loteId,
        moneda: 'USD',
        motivo: 'cuota',
        medio_pago: 'efectivo',
        monto: 1000,
        estado: 'confirmado',
        confirmado_admin_por: fixtures.admin.id,
      })
      .select('id')
      .single()
    await admin.from('pago_imputaciones').insert({ pago_id: pago!.id, cuota_id: fixtures.cuotaIds[0], monto_imputado: 1000 })
    await admin.from('cuota_distribuciones').insert([
      { cuota_id: fixtures.cuotaIds[0], profile_id: fixtures.acreedorConDatos.id, monto: 1000 },
      // La cuota 3 tenía un reparto cargado a mano: se avisa que se pisa.
      { cuota_id: fixtures.cuotaIds[2], profile_id: fixtures.vendedorLoteA.id, monto: 300 },
    ])

    try {
      await login(page, fixtures.admin.email, fixtures.password)
      await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)

      await expect(page.getByTestId('aviso-cuotas-sin-repartir')).toContainText('La cuota 2 no tiene reparto todavía')

      const seccion = page.getByTestId('porcentajes-del-lote')
      await seccion.getByRole('spinbutton', { name: /E2E Acreedor Con Datos/ }).fill('85')
      await seccion.getByRole('spinbutton', { name: /E2E Vendedor A/ }).fill('5')
      await expect(page.getByTestId('suma-porcentajes')).toHaveText('Suman 90% · falta 10%')

      // Admin del lote: el que está por defecto (el único administrador).
      const campoAdmin = seccion.locator('tr', { hasText: '(admin)' }).getByRole('spinbutton')
      await campoAdmin.fill('10')
      await expect(page.getByTestId('suma-porcentajes')).toHaveText('Suman 100% ✓')

      await expect(seccion).toContainText('las 2 cuotas que todavía no se cobraron')
      await expect(seccion).toContainText('Ojo: la cuota 3 ya tiene otro reparto cargado y se va a pisar.')

      await seccion.getByRole('button', { name: 'Repartir las cuotas con estos porcentajes' }).click()
      await expect(page.getByTestId('porcentajes-aplicados')).toContainText('se repartieron 2 cuotas')

      await expect(page.locator('tr[data-cuota="2"]')).toContainText('Repartida completa')
      await expect(page.locator('tr[data-cuota="3"]')).toContainText('Repartida completa')
      await expect(page.locator('tr[data-cuota="1"]')).toContainText('Con pagos')

      await page.getByRole('button', { name: 'Guardar distribución' }).first().click()
      await page.waitForURL(/ok=1/)

      const montosDe = async (cuotaId: string) => {
        const { data } = await admin.from('cuota_distribuciones').select('profile_id, monto').eq('cuota_id', cuotaId)
        return Object.fromEntries((data ?? []).map((fila) => [fila.profile_id, fila.monto]))
      }

      expect(await montosDe(fixtures.cuotaIds[0])).toEqual({ [fixtures.acreedorConDatos.id]: 1000 })
      expect(await montosDe(fixtures.cuotaIds[1])).toEqual({
        [fixtures.acreedorConDatos.id]: 850,
        [fixtures.vendedorLoteA.id]: 50,
        [fixtures.admin.id]: 100,
      })
      expect(await montosDe(fixtures.cuotaIds[2])).toEqual({
        [fixtures.acreedorConDatos.id]: 850,
        [fixtures.vendedorLoteA.id]: 50,
        [fixtures.admin.id]: 100,
      })

      const { data: porcentajes } = await admin
        .from('lote_distribucion_objetivos')
        .select('profile_id, porcentaje')
        .eq('lote_id', fixtures.loteId)
      expect(Object.fromEntries((porcentajes ?? []).map((fila) => [fila.profile_id, Number(fila.porcentaje)]))).toEqual({
        [fixtures.acreedorConDatos.id]: 85,
        [fixtures.vendedorLoteA.id]: 5,
        [fixtures.admin.id]: 10,
      })

      await page.reload()
      await expect(page.getByTestId('suma-porcentajes')).toHaveText('Suman 100% ✓')
    } finally {
      await admin.from('pago_imputaciones').delete().eq('pago_id', pago!.id)
      await admin.from('pagos').delete().eq('id', pago!.id)
    }
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
    await page.getByRole('button', { name: 'Guardar distribución' }).first().click()
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

      await page.getByRole('button', { name: 'Guardar distribución' }).first().click()
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

    await page.getByRole('button', { name: 'Guardar distribución' }).first().click()
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

      await page.getByRole('button', { name: 'Guardar distribución' }).first().click()

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

    // Exacto y dentro de la cuota: desde el 15/09 las fichas de los
    // integrantes también tienen un "Quitar a ... del lote".
    await page.locator('tr[data-cuota="1"]').getByRole('button', { name: 'Quitar', exact: true }).click()
    await page.getByRole('button', { name: 'Guardar distribución' }).first().click()
    await page.waitForURL(/ok=1/)

    const { data: distribuciones } = await admin
      .from('cuota_distribuciones')
      .select('id')
      .eq('cuota_id', fixtures.cuotaIds[0])
    expect(distribuciones).toEqual([])
  })
})
