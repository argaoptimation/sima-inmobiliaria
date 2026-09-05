import { test, expect } from '@playwright/test'
import { createAdminClient, ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

/**
 * Abre el desplegable "+ Agregar participante" del detalle del lote.
 *
 * Desde el 05/09 la sección dejó de estar siempre desplegada: quedó como una
 * línea debajo de "Cuenta de cobro actual" y el formulario aparece recién al
 * apretar el "+", para que no haga tanto ruido.
 */
async function abrirFormularioParticipante(page: import('@playwright/test').Page) {
  const resumen = page.getByText('+ Agregar participante', { exact: true })
  if (await resumen.isVisible().catch(() => false)) {
    await resumen.click()
  }
  await expect(page.locator('select[name="participanteId"]')).toBeVisible()
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
    await page.goto(`/admin/lotes/${fixtures.loteId}`)

    try {
      await abrirFormularioParticipante(page)
      await page.selectOption('select[name="participanteId"]', { label: 'E2E Vendedor B (vendedor)' })
      await page.getByLabel('Etiqueta (opcional)').fill('Vendedor 2')
      await page.getByRole('button', { name: 'Agregar participante' }).click()

      await expect(page.getByText('E2E Vendedor B (vendedor) — Vendedor 2')).toBeVisible()
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
      await page.goto(`/admin/lotes/${fixtures.loteId}`)
      await abrirFormularioParticipante(page)
      await page.selectOption('select[name="participanteId"]', {
        label: `${nombreCuentaExterna} (cuenta externa)`,
      })
      await page.getByRole('button', { name: 'Agregar participante' }).click()

      // getByText matchearía también la opción homónima del <select> de
      // "Cuenta de cobro actual" (esa sección ya lista todas las cuentas
      // externas): se acota al <li> de la lista de participantes, mismo
      // criterio que ya usan los tests de "quitar" más abajo.
      await expect(
        page.locator('li', { hasText: `${nombreCuentaExterna} (cuenta externa)` })
      ).toBeVisible()
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
    await page.goto(`/admin/lotes/${fixtures.loteId}`)

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

      await page.getByRole('button', { name: 'Agregar participante' }).click()

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
    await page.goto(`/admin/lotes/${fixtures.loteId}`)

    try {
      await abrirFormularioParticipante(page)
      await page.selectOption('select[name="participanteId"]', { label: 'E2E Vendedor B (vendedor)' })
      await page.getByRole('button', { name: 'Agregar participante' }).click()
      // getByText matchearía también la opción homónima del <select> de
      // "Cuenta de cobro actual": se acota al <li> de la lista.
      await expect(page.locator('li', { hasText: 'E2E Vendedor B (vendedor)' })).toBeVisible()

      await abrirFormularioParticipante(page)
      await page.selectOption('select[name="participanteId"]', { label: 'E2E Vendedor B (vendedor)' })
      await page.getByRole('button', { name: 'Agregar participante' }).click()

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
    await page.goto(`/admin/lotes/${fixtures.loteSecundarioId}`)

    await abrirFormularioParticipante(page)
    await page.selectOption('select[name="participanteId"]', { label: 'E2E Vendedor A (vendedor)' })
    await page.getByRole('button', { name: 'Agregar participante' }).click()
    // getByText matchearía también la opción homónima del <select> de
    // "Cuenta de cobro actual": se acota al <li> de la lista.
    await expect(page.locator('li', { hasText: 'E2E Vendedor A (vendedor)' })).toBeVisible()

    // quitarParticipante no tiene ningún diálogo de confirmación de por
    // medio (a diferencia de eliminar una cuenta externa o un lote entero):
    // es un submit directo, mismo criterio que "agregar".
    const fila = page.locator('li', { hasText: 'E2E Vendedor A (vendedor)' })
    await fila.getByRole('button', { name: 'Quitar' }).click()

    await expect(page.getByText('Ninguno.')).toBeVisible()
  })

  test('quitar un participante que es la cuenta de cobro actual es rechazado', async ({ page }) => {
    const admin = createAdminClient()

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteSecundarioId}`)

    await abrirFormularioParticipante(page)
    await page.selectOption('select[name="participanteId"]', {
      label: 'E2E Acreedor Con Datos (acreedor)',
    })
    await page.getByRole('button', { name: 'Agregar participante' }).click()
    // getByText matchearía también la opción homónima del <select> de
    // "Cuenta de cobro actual": se acota al <li> de la lista.
    await expect(page.locator('li', { hasText: 'E2E Acreedor Con Datos (acreedor)' })).toBeVisible()

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
      const fila = page.locator('li', { hasText: 'E2E Acreedor Con Datos (acreedor)' })
      await fila.getByRole('button', { name: 'Quitar' }).click()

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
    await page.goto(`/admin/lotes/${fixtures.loteId}`)

    await expect(page.getByText('Otros participantes del cobro')).not.toBeVisible()
  })

  test('un participante adicional puede elegirse como cuenta de cobro; alguien no asociado, no', async ({
    page,
  }) => {
    const admin = createAdminClient()

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteSecundarioId}`)

    // E2E Vendedor A no es acreedor/vendedor/admin de loteSecundario (esos
    // son acreedorSecundario y vendedorLoteB, ver fixtures/test-data.ts) y sí
    // tiene datos de transferencia -- opción válida para este caso.
    // Todavía no es participante de este lote: la opción existe en el
    // selector (es global), pero el submit se rechaza.
    await page.selectOption('select[name="cuentaCobroId"]', { label: 'E2E Vendedor A (vendedor)' })
    await page.getByRole('button', { name: 'Guardar cobro' }).click()
    await expect(
      page.getByText(
        'La cuenta de cobro tiene que ser el admin, el acreedor, el vendedor o un participante adicional de este lote'
      )
    ).toBeVisible()

    try {
      await abrirFormularioParticipante(page)
      await page.selectOption('select[name="participanteId"]', { label: 'E2E Vendedor A (vendedor)' })
      await page.getByRole('button', { name: 'Agregar participante' }).click()
      // getByText matchearía también las opciones homónimas de los <select>
      // de "Cuenta de cobro actual" y "Agregar participante": se acota al
      // <li> de la lista, mismo criterio que el resto del suite.
      await expect(page.locator('li', { hasText: 'E2E Vendedor A (vendedor)' })).toBeVisible()

      await page.selectOption('select[name="cuentaCobroId"]', { label: 'E2E Vendedor A (vendedor)' })
      await page.getByRole('button', { name: 'Guardar cobro' }).click()

      // El submit exitoso de un Server Action no dispara una navegación de
      // browser tradicional que Playwright pueda esperar automáticamente
      // tras el click -- sin esta espera, el reload de abajo puede llegar
      // antes de que la mutación se haya confirmado. Mismo criterio de
      // polling de lectura-después-de-escritura que el resto del suite.
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
        .toBe(fixtures.vendedorLoteA.id)

      await page.reload()
      await expect(page.locator('select[name="cuentaCobroId"]')).toHaveValue(fixtures.vendedorLoteA.id)
    } finally {
      await admin.from('lotes').update({ cuenta_cobro_id: null }).eq('id', fixtures.loteSecundarioId)
      await admin
        .from('lote_participantes')
        .delete()
        .eq('lote_id', fixtures.loteSecundarioId)
        .eq('profile_id', fixtures.vendedorLoteA.id)
    }
  })
})
