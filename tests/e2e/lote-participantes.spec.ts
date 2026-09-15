import { test, expect } from '@playwright/test'
import { createAdminClient, ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

/**
 * Abre el desplegable "+ Agregar participante al lote" de la sección de cobro.
 *
 * Desde el 05/09 la sección dejó de estar siempre desplegada: quedó como una
 * línea debajo de los roles del lote y el formulario aparece recién al
 * apretar el "+", para que no haga tanto ruido. Y desde el 06/09 esa sección
 * vive en /distribucion, no en el detalle del lote -- por eso el nombre dice
 * "al lote", para distinguirla del "+ Agregar participante a esta cuota" del
 * reparto por cuota, que ahora está en la misma pantalla.
 */
async function abrirFormularioParticipante(page: import('@playwright/test').Page) {
  // El <details> a veces no queda abierto con un solo click: si la
  // navegación de Next todavía está reemplazando el árbol, el click llega
  // al summary viejo y el nuevo se renderiza cerrado. Se reintenta hasta
  // que el formulario esté realmente visible, en vez de asumirlo.
  const selectorParticipante = page.locator('select[name="participanteId"]')

  await expect(async () => {
    if (!(await selectorParticipante.isVisible())) {
      await page.getByText('+ Agregar participante al lote', { exact: true }).click()
    }
    await expect(selectorParticipante).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15000 })
}

/**
 * La ficha de un integrante en "Entre estos se reparte cada cuota". Desde el
 * 15/09 los participantes se ven (y se quitan) solo ahí: la lista de "Otros
 * participantes" con su tacho se sacó porque repetía las mismas personas.
 */
function fichaDe(page: import('@playwright/test').Page, nombre: string) {
  return page.getByTestId('ficha-integrante').filter({ hasText: nombre })
}

/** Quitar pasa por un aviso previo: se abre y se confirma. */
async function quitarDelLote(page: import('@playwright/test').Page, nombre: string) {
  await page.getByRole('button', { name: `Quitar a ${nombre} del lote` }).click()
  await expect(page.getByTestId('aviso-quitar-integrante')).toBeVisible()
  await page.getByRole('button', { name: `Sí, quitar a ${nombre}` }).click()
}

test.describe('Múltiples participantes por lote', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('agregar un profile (vendedor no asociado a este lote) como participante adicional', async ({
    page,
  }) => {
    const admin = createAdminClient()

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)

    try {
      await abrirFormularioParticipante(page)
      await page.selectOption('select[name="participanteId"]', { label: 'E2E Vendedor B (vendedor)' })
      await page.getByLabel('Etiqueta (opcional)').fill('Vendedor 2')
      await page.getByRole('button', { name: 'Agregar al lote' }).click()

      // La etiqueta es el papel que muestra su ficha.
      await expect(fichaDe(page, 'E2E Vendedor B')).toContainText('Vendedor 2')
    } finally {
      await admin
        .from('lote_participantes')
        .delete()
        .eq('lote_id', fixtures.loteId)
        .eq('profile_id', fixtures.vendedorLoteB.id)
    }
  })

  test('agregar una cuenta externa como participante adicional', async ({ page }) => {
    const admin = createAdminClient()

    await login(page, fixtures.admin.email, fixtures.password)

    await page.goto('/admin/cuentas-externas/nuevo')
    const nombreCuentaExterna = `E2E Participante Externo ${Date.now()}`
    await page.getByLabel('Nombre del destinatario').fill(nombreCuentaExterna)
    await page.getByLabel('Titular de la cuenta').fill('Corralón Participante')
    await page.getByLabel('Alias').fill('corralon.participante')
    await page.getByLabel('Banco').fill('Banco Test')
    await page.getByRole('button', { name: 'Crear cuenta externa' }).click()
    await page.waitForURL(/\/admin\/cuentas-externas\/([0-9a-f-]{36})$/)
    const cuentaExternaId = page.url().match(/\/admin\/cuentas-externas\/([0-9a-f-]{36})$/)![1]

    try {
      await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)
      await abrirFormularioParticipante(page)
      await page.selectOption('select[name="participanteId"]', {
        label: `${nombreCuentaExterna} (cuenta externa)`,
      })
      await page.getByRole('button', { name: 'Agregar al lote' }).click()

      // Se acota a la lista de participantes del lote: getByText
      // matchearía también la opción homónima del <select> de "Cuenta de
      // cobro actual", y desde el 06/09 además la lista de "entre estos se
      // reparte cada cuota", que está en la misma pantalla.
      await expect(fichaDe(page, nombreCuentaExterna)).toContainText('Cuenta externa')
    } finally {
      await admin.from('lote_participantes').delete().eq('cuenta_externa_id', cuentaExternaId)
      await admin.from('cuentas_externas').delete().eq('id', cuentaExternaId)
    }
  })

  test('agregar como participante a alguien que ya es admin/acreedor/vendedor de este lote es rechazado', async ({
    page,
  }) => {
    const admin = createAdminClient()

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)

    // fixtures.acreedorConDatos ya es el acreedor de este lote al momento
    // de cargar la página, así que el filtro `participantesElegibles` (a
    // propósito: no tiene sentido ofrecerlo en el dropdown) ya lo excluye
    // de las <option> del <select> — no hay forma de elegirlo por UI, y
    // manipular el DOM a mano no sirve porque React lo revierte en la
    // siguiente hidratación/reconciliación.
    //
    // En cambio, se elige acá a fixtures.vendedorLoteB, que SÍ está
    // disponible en el dropdown porque todavía no está asociado a este
    // lote. Antes de enviar el formulario se lo asigna como vendedor del
    // lote por otra vía (simulando una asignación concurrente desde otra
    // pestaña/usuario), dejando el formulario ya abierto desactualizado.
    // Esto ejercita el mismo guard del lado servidor (comparación contra
    // admin_id/acreedor_id/vendedor_id) de forma realista, sin pelear con
    // el DOM manejado por React.
    await abrirFormularioParticipante(page)
    await page.selectOption('select[name="participanteId"]', { label: 'E2E Vendedor B (vendedor)' })

    try {
      await admin.from('lotes').update({ vendedor_id: fixtures.vendedorLoteB.id }).eq('id', fixtures.loteId)

      // Mismo criterio de polling de lectura-después-de-escritura que el
      // resto del suite: se confirma que la asignación ya es visible antes
      // de enviar el formulario.
      await expect
        .poll(
          async () => {
            const { data: lote } = await admin
              .from('lotes')
              .select('vendedor_id')
              .eq('id', fixtures.loteId)
              .single()
            return lote?.vendedor_id ?? null
          },
          { timeout: 10000 }
        )
        .toBe(fixtures.vendedorLoteB.id)

      await page.getByRole('button', { name: 'Agregar al lote' }).click()

      await expect(
        page.getByText('Esa persona ya es admin, acreedor o vendedor de este lote')
      ).toBeVisible()
    } finally {
      await admin.from('lotes').update({ vendedor_id: fixtures.vendedorLoteA.id }).eq('id', fixtures.loteId)
    }
  })

  test('agregar dos veces al mismo participante es rechazado', async ({ page }) => {
    const admin = createAdminClient()

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)

    try {
      await abrirFormularioParticipante(page)
      await page.selectOption('select[name="participanteId"]', { label: 'E2E Vendedor B (vendedor)' })
      await page.getByRole('button', { name: 'Agregar al lote' }).click()
      // getByText matchearía también la opción homónima del <select> de
      // "Agregar participante": se acota al <li> de la lista.
      await expect(fichaDe(page, 'E2E Vendedor B')).toBeVisible()

      await abrirFormularioParticipante(page)
      await page.selectOption('select[name="participanteId"]', { label: 'E2E Vendedor B (vendedor)' })
      await page.getByRole('button', { name: 'Agregar al lote' }).click()

      await expect(page.getByText('Ese participante ya está agregado a este lote')).toBeVisible()
    } finally {
      await admin
        .from('lote_participantes')
        .delete()
        .eq('lote_id', fixtures.loteId)
        .eq('profile_id', fixtures.vendedorLoteB.id)
    }
  })

  test('quitar un participante que no es la cuenta de cobro actual funciona', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteSecundarioId}/distribucion`)

    await abrirFormularioParticipante(page)
    await page.selectOption('select[name="participanteId"]', { label: 'E2E Vendedor A (vendedor)' })
    await page.getByRole('button', { name: 'Agregar al lote' }).click()
    // getByText matchearía también la opción homónima del <select> de
    // "Agregar participante": se acota al <li> de la lista.
    await expect(fichaDe(page, 'E2E Vendedor A')).toBeVisible()

    // Desde el 15/09 quitar pasa por un aviso previo de qué cuotas toca. Sin
    // cuotas atadas, lo dice y se confirma igual.
    await page.getByRole('button', { name: 'Quitar a E2E Vendedor A del lote' }).click()
    await expect(page.getByTestId('aviso-quitar-integrante')).toContainText(
      'No tiene cuotas asignadas en este lote'
    )
    // Cancelar no toca nada.
    await page.getByTestId('aviso-quitar-integrante').getByRole('button', { name: 'Cancelar' }).click()
    await expect(page.getByTestId('aviso-quitar-integrante')).toHaveCount(0)
    await expect(fichaDe(page, 'E2E Vendedor A')).toBeVisible()

    await quitarDelLote(page, 'E2E Vendedor A')

    await expect(page.getByText('E2E Vendedor A ya no es integrante del lote.')).toBeVisible()
    await expect(fichaDe(page, 'E2E Vendedor A')).toHaveCount(0)
  })

  test('quitar un participante que es la cuenta de cobro actual es rechazado', async ({ page }) => {
    const admin = createAdminClient()

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteSecundarioId}/distribucion`)

    await abrirFormularioParticipante(page)
    await page.selectOption('select[name="participanteId"]', {
      label: 'E2E Acreedor Con Datos (acreedor)',
    })
    await page.getByRole('button', { name: 'Agregar al lote' }).click()
    // getByText matchearía también la opción homónima del <select> de
    // "Agregar participante": se acota al <li> de la lista.
    await expect(fichaDe(page, 'E2E Acreedor Con Datos')).toBeVisible()

    try {
      // Se asigna directo por base (el selector de "Cuenta de cobro" solo
      // acepta participantes adicionales desde la Task 3 de este mismo
      // plan, que todavía no corrió en este punto) para poder probar el
      // guard de "quitarParticipante" de esta tarea de forma aislada.
      await admin
        .from('lotes')
        .update({ cuenta_cobro_id: fixtures.acreedorConDatos.id })
        .eq('id', fixtures.loteSecundarioId)

      // Misma demora corta y real de lectura-después-de-escritura ya
      // documentada en tests/e2e/cuentas-externas.spec.ts: se confirma por
      // polling que la asignación ya es visible antes de ejercitar el
      // guard, para no confundir esa demora con un guard roto.
      await expect
        .poll(
          async () => {
            const { data: lote } = await admin
              .from('lotes')
              .select('cuenta_cobro_id')
              .eq('id', fixtures.loteSecundarioId)
              .single()
            return lote?.cuenta_cobro_id ?? null
          },
          { timeout: 10000 }
        )
        .toBe(fixtures.acreedorConDatos.id)

      await page.reload()
      await quitarDelLote(page, 'E2E Acreedor Con Datos')

      await expect(
        page.getByText(
          'No se puede quitar: es la cuenta de cobro actual de este lote. Reasignala primero.'
        )
      ).toBeVisible()
    } finally {
      await admin.from('lotes').update({ cuenta_cobro_id: null }).eq('id', fixtures.loteSecundarioId)
      await admin
        .from('lote_participantes')
        .delete()
        .eq('lote_id', fixtures.loteSecundarioId)
        .eq('profile_id', fixtures.acreedorConDatos.id)
    }
  })

  test('un acreedor no puede ver la subsección de participantes ni sus acciones', async ({
    page,
  }) => {
    // Tiene que ser el acreedor REAL de este lote (fixtures.acreedorConDatos)
    // -- un acreedor sin relación con el lote (fixtures.acreedor) ni siquiera
    // llega a ver la página: requireAdminOAcreedor lo redirige antes.
    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)

    await expect(page.getByText('Otros participantes del cobro')).not.toBeVisible()
  })

  test('solo un integrante del lote puede cobrar una cuota', async ({ page }) => {
    const admin = createAdminClient()

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)

    // E2E Vendedor B no es acreedor/vendedor/admin de este lote (esos son
    // acreedorConDatos y vendedorLoteA, ver fixtures/test-data.ts) y todavía
    // no es participante, así que no tiene por qué figurar entre los que
    // pueden cobrar una cuota. Desde el 08/09 este selector es el único
    // lugar donde se elige el destino del cobro.
    const opcionesAntes = await page
      .locator('select[name="cuota1CuentaCobro"] option')
      .allTextContents()

    expect(opcionesAntes.some((texto) => texto.includes('E2E Vendedor B'))).toBe(false)

    try {
      await abrirFormularioParticipante(page)
      await page.selectOption('select[name="participanteId"]', { label: 'E2E Vendedor B (vendedor)' })
      await page.getByRole('button', { name: 'Agregar al lote' }).click()
      // getByText matchearía también las opciones homónimas de los <select>:
      // se acota al <li> de la lista, mismo criterio que el resto del suite.
      await expect(
        fichaDe(page, 'E2E Vendedor B')
      ).toBeVisible()

      await page.selectOption('select[name="cuota1CuentaCobro"]', {
        label: 'E2E Vendedor B (participante)',
      })
      await page.getByRole('button', { name: 'Guardar distribución' }).first().click()

      // El submit exitoso de un Server Action no dispara una navegación de
      // browser tradicional que Playwright pueda esperar automáticamente
      // tras el click. Mismo criterio de polling de lectura-después-de-
      // escritura que el resto del suite.
      await expect
        .poll(
          async () => {
            const { data: cuota } = await admin
              .from('cuotas')
              .select('cuenta_cobro_id')
              .eq('lote_id', fixtures.loteId)
              .eq('numero', 1)
              .single()
            return cuota?.cuenta_cobro_id ?? null
          },
          { timeout: 10000 }
        )
        .toBe(fixtures.vendedorLoteB.id)
    } finally {
      await admin
        .from('cuotas')
        .update({ cuenta_cobro_id: null, cuenta_cobro_externa_id: null })
        .eq('lote_id', fixtures.loteId)
      await admin
        .from('lote_participantes')
        .delete()
        .eq('lote_id', fixtures.loteId)
        .eq('profile_id', fixtures.vendedorLoteB.id)
    }
  })

  // Hasta el 15/09 quitar a alguien que cobraba una cuota se negaba, y si
  // solo tenía parte del reparto lo sacaba sin avisar. Ahora avisa antes
  // qué cuotas toca y, al confirmar: en las cuotas sin pagos le saca el
  // reparto y el destino; en las que ya tienen pagos no toca nada.
  test.describe('quitar a alguien con cuotas atadas', () => {
    let pagoId: string | null = null

    test.afterEach(async () => {
      const admin = createAdminClient()
      if (pagoId) {
        await admin.from('pago_imputaciones').delete().eq('pago_id', pagoId)
        await admin.from('pagos').delete().eq('id', pagoId)
        pagoId = null
      }
      await admin.from('cuota_distribuciones').delete().in('cuota_id', fixtures.cuotaIds)
      await admin.from('lote_distribucion_objetivos').delete().eq('lote_id', fixtures.loteId)
      await admin
        .from('cuotas')
        .update({ cuenta_cobro_id: null, cuenta_cobro_externa_id: null })
        .eq('lote_id', fixtures.loteId)
      await admin.from('lote_participantes').delete().eq('lote_id', fixtures.loteId)
      await admin.from('lotes').update({ vendedor_id: fixtures.vendedorLoteA.id }).eq('id', fixtures.loteId)
    })

    // Vendedor B participa del lote: cobra la cuota 1 (ya tiene un pago) y la
    // 2 (sin pagos), tiene parte del reparto en las tres y un 5% del lote.
    async function prepararVendedorBConCuotas(conPagoPendienteEnLaCuota2 = false) {
      const admin = createAdminClient()
      await admin.from('lote_participantes').insert({ lote_id: fixtures.loteId, profile_id: fixtures.vendedorLoteB.id })
      await admin
        .from('cuotas')
        .update({ cuenta_cobro_id: fixtures.vendedorLoteB.id })
        .in('id', [fixtures.cuotaIds[0], fixtures.cuotaIds[1]])
      await admin.from('cuota_distribuciones').insert(
        fixtures.cuotaIds.flatMap((cuotaId) => [
          { cuota_id: cuotaId, profile_id: fixtures.vendedorLoteB.id, monto: 50 },
          { cuota_id: cuotaId, profile_id: fixtures.acreedorConDatos.id, monto: 950 },
        ])
      )
      await admin
        .from('lote_distribucion_objetivos')
        .insert({ lote_id: fixtures.loteId, profile_id: fixtures.vendedorLoteB.id, porcentaje: 5 })

      const { data: pago } = await admin
        .from('pagos')
        .insert({
          cliente_id: fixtures.cliente.id,
          lote_id: fixtures.loteId,
          moneda: 'USD',
          motivo: 'cuota',
          medio_pago: 'transferencia',
          monto: 1000,
          estado: conPagoPendienteEnLaCuota2 ? 'pendiente' : 'confirmado',
          cuota_origen_id: conPagoPendienteEnLaCuota2 ? fixtures.cuotaIds[1] : fixtures.cuotaIds[0],
          confirmado_admin_por: conPagoPendienteEnLaCuota2 ? null : fixtures.admin.id,
        })
        .select('id')
        .single()
      pagoId = pago!.id
      if (!conPagoPendienteEnLaCuota2) {
        await admin
          .from('pago_imputaciones')
          .insert({ pago_id: pago!.id, cuota_id: fixtures.cuotaIds[0], monto_imputado: 1000 })
      }
    }

    test('avisa antes qué cuotas toca y al confirmar solo cambia las que no tienen pagos', async ({ page }) => {
      const admin = createAdminClient()
      await prepararVendedorBConCuotas()

      await login(page, fixtures.admin.email, fixtures.password)
      await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)

      await page.getByRole('button', { name: 'Quitar a E2E Vendedor B del lote' }).click()
      const aviso = page.getByTestId('aviso-quitar-integrante')
      await expect(aviso).toContainText('Tiene parte del reparto en las cuotas 2 y 3, que todavía no se cobraron')
      await expect(aviso).toContainText('La cuota 2 se le transfiere a E2E Vendedor B: queda sin destino')
      await expect(aviso).toContainText('Se borra su 5% del lote.')
      await expect(aviso).toContainText('En la cuota 1, que ya se cobró, no se toca nada')

      await page.getByRole('button', { name: 'Sí, quitar a E2E Vendedor B' }).click()
      await expect(
        page.getByText(
          'E2E Vendedor B ya no es integrante del lote. Se le sacó la parte del reparto en 2 cuotas sin cobrar. 1 cuota quedó sin destino: elegí a quién se le transfieren.'
        )
      ).toBeVisible()
      await expect(fichaDe(page, 'E2E Vendedor B')).toHaveCount(0)

      const { data: repartosDeB } = await admin
        .from('cuota_distribuciones')
        .select('cuota_id')
        .eq('profile_id', fixtures.vendedorLoteB.id)
        .in('cuota_id', fixtures.cuotaIds)
      expect((repartosDeB ?? []).map((fila) => fila.cuota_id)).toEqual([fixtures.cuotaIds[0]])

      const { data: cuotas } = await admin
        .from('cuotas')
        .select('numero, cuenta_cobro_id')
        .eq('lote_id', fixtures.loteId)
        .order('numero')
      expect(cuotas?.map((cuota) => cuota.cuenta_cobro_id)).toEqual([fixtures.vendedorLoteB.id, null, null])

      const { data: porcentaje } = await admin
        .from('lote_distribucion_objetivos')
        .select('id')
        .eq('lote_id', fixtures.loteId)
        .eq('profile_id', fixtures.vendedorLoteB.id)
      expect(porcentaje).toEqual([])

      // El reparto del acreedor en las tres cuotas no se tocó.
      const { count } = await admin
        .from('cuota_distribuciones')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', fixtures.acreedorConDatos.id)
        .in('cuota_id', fixtures.cuotaIds)
      expect(count).toBe(3)
    })

    test('con un pago informado sin confirmar en una cuota que cobra, no deja quitarlo', async ({ page }) => {
      const admin = createAdminClient()
      await prepararVendedorBConCuotas(true)

      await login(page, fixtures.admin.email, fixtures.password)
      await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)

      await page.getByRole('button', { name: 'Quitar a E2E Vendedor B del lote' }).click()
      const aviso = page.getByTestId('aviso-quitar-integrante')
      await expect(aviso).toContainText(
        'Todavía no se puede quitar: el cliente ya informó un pago de la cuota 2, que se le transfiere a E2E Vendedor B, y falta confirmarlo.'
      )
      await expect(aviso.getByRole('button', { name: /Sí, quitar/ })).toHaveCount(0)

      const { data: participante } = await admin
        .from('lote_participantes')
        .select('id')
        .eq('lote_id', fixtures.loteId)
        .eq('profile_id', fixtures.vendedorLoteB.id)
      expect(participante).toHaveLength(1)
    })

    test('cambiar el vendedor en "Roles del lote" avisa antes y saca al anterior de sus cuotas sin pagos', async ({
      page,
    }) => {
      const admin = createAdminClient()
      await admin.from('cuota_distribuciones').insert([
        { cuota_id: fixtures.cuotaIds[1], profile_id: fixtures.vendedorLoteA.id, monto: 50 },
        { cuota_id: fixtures.cuotaIds[2], profile_id: fixtures.vendedorLoteA.id, monto: 50 },
      ])

      await login(page, fixtures.admin.email, fixtures.password)
      await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)

      await expect(page.getByTestId('aviso-cambio-de-rol')).toHaveCount(0)
      await page.selectOption('select[name="vendedorId"]', { label: 'E2E Vendedor B' })

      const aviso = page.getByTestId('aviso-cambio-de-rol')
      await expect(aviso).toContainText('Al guardar, E2E Vendedor A deja de ser integrante del lote')
      await expect(aviso).toContainText('Tiene parte del reparto en las cuotas 2 y 3')

      await page.getByRole('button', { name: 'Guardar y sacar a E2E Vendedor A de sus cuotas' }).click()
      await expect(page.getByText(/Datos de cobro guardados\. E2E Vendedor A ya no es integrante del lote\./)).toBeVisible()

      const { data: lote } = await admin.from('lotes').select('vendedor_id').eq('id', fixtures.loteId).single()
      expect(lote?.vendedor_id).toBe(fixtures.vendedorLoteB.id)

      const { count } = await admin
        .from('cuota_distribuciones')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', fixtures.vendedorLoteA.id)
        .in('cuota_id', fixtures.cuotaIds)
      expect(count).toBe(0)
    })

    test('el vendedor se quita desde su ficha; el admin y el acreedor no tienen ese botón', async ({ page }) => {
      await login(page, fixtures.admin.email, fixtures.password)
      await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)

      await expect(page.getByRole('button', { name: 'Quitar a E2E Acreedor Con Datos del lote' })).toHaveCount(0)
      await expect(fichaDe(page, 'E2E Acreedor Con Datos').getByRole('button')).toHaveCount(0)

      await quitarDelLote(page, 'E2E Vendedor A')
      await expect(page.getByText('E2E Vendedor A ya no es integrante del lote.')).toBeVisible()

      const { data: lote } = await createAdminClient()
        .from('lotes')
        .select('vendedor_id')
        .eq('id', fixtures.loteId)
        .single()
      expect(lote?.vendedor_id).toBeNull()
    })
  })
})
