import { test, expect } from '@playwright/test'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { createAdminClient, ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

test.describe('Cuentas externas', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()

    // Limpieza de cuentas externas que hayan quedado de corridas anteriores
    // de ESTE spec: cada test usa un nombre con timestamp para no chocar
    // entre sí, así que no se borran solas. Sin esto, cada re-ejecución deja
    // basura acumulada en `cuentas_externas` (y sus movimientos).
    const admin = createAdminClient()
    const { data: cuentasViejas } = await admin
      .from('cuentas_externas')
      .select('id')
      .ilike('nombre', 'E2E %')
    const idsCuentasViejas = (cuentasViejas ?? []).map((c) => c.id)
    if (idsCuentasViejas.length > 0) {
      await admin.from('cuentas_externas_movimientos').delete().in('cuenta_externa_id', idsCuentasViejas)
      await admin.from('cuentas_externas').delete().in('id', idsCuentasViejas)
    }
  })

  test('crear una cuenta externa con deuda inicial y verla en el listado con el saldo correcto', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/cuentas-externas/nuevo')

    const nombre = `E2E Corralón ${Date.now()}`
    await page.getByLabel('Nombre del destinatario').fill(nombre)
    await page.getByLabel('Titular de la cuenta').fill('Materiales del Centro SRL')
    await page.getByLabel('Alias').fill('materiales.centro')
    await page.getByLabel('Banco').fill('Banco Test')
    await page.getByLabel('Monto').fill('2000')
    await page.getByLabel('Concepto').fill('Materiales de construcción')
    await page.getByRole('button', { name: 'Crear cuenta externa' }).click()

    // Regex de UUID, no ".+$" -- ese matcheaba tambien la propia URL de
    // origen "/admin/cuentas-externas/nuevo" (contiene "/admin/cuentas-
    // externas/" + algo), haciendo que waitForURL resolviera de inmediato
    // sin esperar la navegacion real si todavia no habia arrancado.
    await page.waitForURL(/\/admin\/cuentas-externas\/[0-9a-f-]{36}$/)

    // Hay una demora corta y real de lectura-despues-de-escritura entre el
    // insert del movimiento inicial y que aparezca en una navegacion fresca
    // al listado -- se reintenta la navegacion en vez de asumir un sleep fijo.
    await expect(async () => {
      await page.goto('/admin/cuentas-externas')
      await expect(page.getByRole('row', { name: new RegExp(nombre) })).toContainText('2000 USD')
    }).toPass({ timeout: 10000 })
  })

  test('crear una cuenta externa sin banco es rechazado', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/cuentas-externas/nuevo')

    await page.getByLabel('Nombre del destinatario').fill(`E2E Sin Banco ${Date.now()}`)
    await page.getByLabel('Titular de la cuenta').fill('Alguien')
    await page.getByLabel('Alias').fill('alguien.alias')
    // Banco NO se completa a propósito.
    await page.getByRole('button', { name: 'Crear cuenta externa' }).click()

    await expect(page.getByText('Titular, alias y banco son obligatorios')).toBeVisible()
  })

  test('un acreedor no puede acceder a /admin/cuentas-externas navegando directo por URL', async ({
    page,
  }) => {
    await login(page, fixtures.acreedor.email, fixtures.password)
    await page.goto('/admin/cuentas-externas')
    await expect(page).toHaveURL(/\/admin\/lotes$/)
  })

  test('agregar deuda pendiente desde el detalle actualiza el saldo, más de una vez', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/cuentas-externas/nuevo')

    await page.getByLabel('Nombre del destinatario').fill(`E2E Deuda ${Date.now()}`)
    await page.getByLabel('Titular de la cuenta').fill('Alguien')
    await page.getByLabel('Alias').fill('alguien.alias')
    await page.getByLabel('Banco').fill('Banco Test')
    await page.getByRole('button', { name: 'Crear cuenta externa' }).click()
    // Regex de UUID, no ".+$" -- ese matcheaba tambien la propia URL de
    // origen "/admin/cuentas-externas/nuevo" (contiene "/admin/cuentas-
    // externas/" + algo), haciendo que waitForURL resolviera de inmediato
    // sin esperar la navegacion real si todavia no habia arrancado.
    await page.waitForURL(/\/admin\/cuentas-externas\/[0-9a-f-]{36}$/)
    await page.waitForLoadState('networkidle')

    await page.getByLabel('Monto', { exact: true }).fill('1000')
    await page.getByLabel('Concepto').fill('Primera deuda')
    await page.getByRole('button', { name: 'Agregar movimiento' }).click()

    // Esperar a que el mensaje de guardado aparezca con reintentos por timing
    await expect(async () => {
      await expect(page.getByText('Guardado.')).toBeVisible()
    }).toPass({ timeout: 10000 })

    await page.getByLabel('Monto', { exact: true }).fill('500')
    await page.getByLabel('Concepto').fill('Segunda deuda')
    await page.getByRole('button', { name: 'Agregar movimiento' }).click()

    // Esperar y reintentar para el segundo agregado también
    await expect(async () => {
      await expect(page.getByText('1500 USD')).toBeVisible()
    }).toPass({ timeout: 10000 })
    await expect(page.getByText('Primera deuda')).toBeVisible()
    await expect(page.getByText('Segunda deuda')).toBeVisible()
  })

  test('editar datos de transferencia y eliminar una cuenta externa sin movimientos', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/cuentas-externas/nuevo')

    await page.getByLabel('Nombre del destinatario').fill(`E2E Editar ${Date.now()}`)
    await page.getByLabel('Titular de la cuenta').fill('Nombre Original')
    await page.getByLabel('Alias').fill('alias.original')
    await page.getByLabel('Banco').fill('Banco Test')
    await page.getByRole('button', { name: 'Crear cuenta externa' }).click()
    // Regex de UUID, no ".+$" -- ese matcheaba tambien la propia URL de
    // origen "/admin/cuentas-externas/nuevo" (contiene "/admin/cuentas-
    // externas/" + algo), haciendo que waitForURL resolviera de inmediato
    // sin esperar la navegacion real si todavia no habia arrancado.
    await page.waitForURL(/\/admin\/cuentas-externas\/[0-9a-f-]{36}$/)
    await page.waitForLoadState('networkidle')

    await page.getByLabel('Titular').fill('Nombre Corregido')
    await page.getByRole('button', { name: 'Guardar' }).click()

    // Esperar a que se guarde y la página se recargue con el nuevo valor
    await expect(async () => {
      await expect(page.getByText('Guardado.')).toBeVisible()
    }).toPass({ timeout: 10000 })

    await expect(async () => {
      await expect(page.getByLabel('Titular')).toHaveValue('Nombre Corregido')
    }).toPass({ timeout: 10000 })

    page.on('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Eliminar cuenta externa' }).click()
    await page.waitForURL('**/admin/cuentas-externas')
  })

  test('eliminar una cuenta externa con movimientos es rechazado', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/cuentas-externas/nuevo')

    await page.getByLabel('Nombre del destinatario').fill(`E2E No Borrable ${Date.now()}`)
    await page.getByLabel('Titular de la cuenta').fill('Alguien')
    await page.getByLabel('Alias').fill('alguien.alias')
    await page.getByLabel('Banco').fill('Banco Test')
    await page.getByLabel('Monto').fill('100')
    await page.getByLabel('Concepto').fill('Deuda que bloquea el borrado')
    await page.getByRole('button', { name: 'Crear cuenta externa' }).click()
    // Regex de UUID, no ".+$" -- ese matcheaba tambien la propia URL de
    // origen "/admin/cuentas-externas/nuevo" (contiene "/admin/cuentas-
    // externas/" + algo), haciendo que waitForURL resolviera de inmediato
    // sin esperar la navegacion real si todavia no habia arrancado.
    await page.waitForURL(/\/admin\/cuentas-externas\/[0-9a-f-]{36}$/)
    await page.waitForLoadState('networkidle')
    const cuentaExternaId = page.url().split('/').pop()!

    page.on('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Eliminar cuenta externa' }).click()

    await expect(async () => {
      await expect(page.getByText('No se puede eliminar: esta cuenta ya tiene movimientos')).toBeVisible()
    }).toPass({ timeout: 10000 })

    const admin = createAdminClient()
    const { data: cuentaExterna } = await admin
      .from('cuentas_externas')
      .select('id')
      .eq('id', cuentaExternaId)
      .maybeSingle()
    expect(cuentaExterna).not.toBeNull()
  })

  test('eliminar una cuenta externa asignada como cuenta de cobro de un lote es rechazado', async ({
    page,
  }) => {
    const admin = createAdminClient()

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/cuentas-externas/nuevo')

    await page.getByLabel('Nombre del destinatario').fill(`E2E Asignada ${Date.now()}`)
    await page.getByLabel('Titular de la cuenta').fill('Alguien')
    await page.getByLabel('Alias').fill('alguien.alias')
    await page.getByLabel('Banco').fill('Banco Test')
    await page.getByRole('button', { name: 'Crear cuenta externa' }).click()
    // Regex de UUID, no ".+$" -- ese matcheaba tambien la propia URL de
    // origen "/admin/cuentas-externas/nuevo" (contiene "/admin/cuentas-
    // externas/" + algo), haciendo que waitForURL resolviera de inmediato
    // sin esperar la navegacion real si todavia no habia arrancado.
    await page.waitForURL(/\/admin\/cuentas-externas\/[0-9a-f-]{36}$/)
    const cuentaExternaId = page.url().split('/').pop()!

    // Se asigna directo por base (el selector de cuenta de cobro todavía no
    // soporta cuentas externas por UI, eso lo agrega la Task 4) para poder
    // probar el guard de eliminarCuentaExterna de esta tarea de forma
    // aislada.
    await admin
      .from('lotes')
      .update({ cuenta_cobro_externa_id: cuentaExternaId })
      .eq('id', fixtures.loteSecundarioId)

    // Mismo fenómeno de lectura-después-de-escritura ya documentado: se
    // confirma por polling que la asignación ya es visible antes de ejercitar
    // el guard, para no confundir esa demora con un guard roto.
    await expect
      .poll(
        async () => {
          const { data: lote } = await admin
            .from('lotes')
            .select('cuenta_cobro_externa_id')
            .eq('id', fixtures.loteSecundarioId)
            .single()
          return lote?.cuenta_cobro_externa_id ?? null
        },
        { timeout: 10000 }
      )
      .toBe(cuentaExternaId)

    try {
      page.on('dialog', (dialog) => dialog.accept())
      await page.getByRole('button', { name: 'Eliminar cuenta externa' }).click()

      await expect(async () => {
        await expect(
          page.getByText('No se puede eliminar: está asignada como cuenta de cobro de algún lote')
        ).toBeVisible()
      }).toPass({ timeout: 10000 })
    } finally {
      await admin.from('lotes').update({ cuenta_cobro_externa_id: null }).eq('id', fixtures.loteSecundarioId)
    }
  })

  test('seleccionar una cuenta externa como cuenta de cobro de un lote, sin asociarla antes', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)

    await page.goto('/admin/cuentas-externas/nuevo')
    const nombreCuentaExterna = `E2E Cobro Externo ${Date.now()}`
    await page.getByLabel('Nombre del destinatario').fill(nombreCuentaExterna)
    await page.getByLabel('Titular de la cuenta').fill('Corralón Test')
    await page.getByLabel('Alias').fill('corralon.test')
    await page.getByLabel('Banco').fill('Banco Test')
    await page.getByRole('button', { name: 'Crear cuenta externa' }).click()
    // Regex de UUID, no ".+$" -- ese matcheaba tambien la propia URL de
    // origen "/admin/cuentas-externas/nuevo" (contiene "/admin/cuentas-
    // externas/" + algo), haciendo que waitForURL resolviera de inmediato
    // sin esperar la navegacion real si todavia no habia arrancado.
    await page.waitForURL(/\/admin\/cuentas-externas\/[0-9a-f-]{36}$/)

    try {
      await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)
      await page.selectOption('select[name="cuentaCobroId"]', {
        label: `${nombreCuentaExterna} (cuenta externa)`,
      })
      await page.getByRole('button', { name: 'Guardar cobro' }).click()

      // Mismo fenómeno de lectura-después-de-escritura ya documentado en
      // este spec: el update del lote puede no estar visible todavía en la
      // primera recarga inmediatamente después del redirect.
      await expect(async () => {
        await page.reload()
        await expect(page.locator('select[name="cuentaCobroId"]')).toHaveValue(
          new RegExp(`^externa:`)
        )
      }).toPass({ timeout: 10000 })
    } finally {
      // fixtures.loteId es compartido con otros specs (cuenta-cobro.spec.ts,
      // pase-a-vendido.spec.ts, etc.) -- se limpia la asignación para no
      // dejarles un estado inesperado, y porque la cuenta externa recién
      // creada quedaría referenciada por FK, haciendo fallar en silencio el
      // borrado por nombre "E2E %" del beforeAll de este mismo archivo en la
      // próxima corrida.
      const admin = createAdminClient()
      await admin.from('lotes').update({ cuenta_cobro_externa_id: null }).eq('id', fixtures.loteId)
    }
  })

  test('confirmar un pago redirigido a una cuenta externa: alcanza con el admin, se genera el crédito', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)

    await page.goto('/admin/cuentas-externas/nuevo')
    const nombreCuentaExterna = `E2E Credito Auto ${Date.now()}`
    await page.getByLabel('Nombre del destinatario').fill(nombreCuentaExterna)
    await page.getByLabel('Titular de la cuenta').fill('Corralón Crédito')
    await page.getByLabel('Alias').fill('corralon.credito')
    await page.getByLabel('Banco').fill('Banco Test')
    await page.getByRole('button', { name: 'Crear cuenta externa' }).click()
    // Regex de UUID, no ".+$" -- misma razón documentada en los otros tests
    // de este archivo.
    await page.waitForURL(/\/admin\/cuentas-externas\/[0-9a-f-]{36}$/)
    const cuentaExternaId = page.url().split('/').pop()!

    try {
      await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)
      await page.selectOption('select[name="cuentaCobroId"]', {
        label: `${nombreCuentaExterna} (cuenta externa)`,
      })
      await page.getByRole('button', { name: 'Guardar cobro' }).click()

      // Hay que esperar a que el guardado se confirme (mismo patrón que el
      // test de más arriba de esta misma suite) ANTES de limpiar cookies y
      // cambiar de usuario: si se navega a /login mientras el submit del
      // form todavía está en curso, esa navegación cancela la anterior y la
      // asignación de cuenta_cobro_externa_id nunca llega a persistirse.
      await expect(async () => {
        await page.reload()
        await expect(page.locator('select[name="cuentaCobroId"]')).toHaveValue(
          new RegExp(`^externa:`)
        )
      }).toPass({ timeout: 10000 })

      // El flujo exacto de "pagar una cuota" (nombres de botones/links) sigue
      // el mismo patrón verificado en pago-flujo-completo.spec.ts: el link
      // "Pagar" de la brief no existe tal cual en la UI real -- hay un paso
      // intermedio de "Monto transferido" + moneda + "Ya transferí" antes de
      // llegar a la pantalla de subir el comprobante.
      const nombreComprobante = `e2e-credito-auto-${Date.now()}.pdf`

      await page.context().clearCookies()
      await login(page, fixtures.cliente.email, fixtures.password)
      await page.goto(`/portal-cliente/lotes/${fixtures.loteId}`)

      const filaCuota1 = page.locator('main table').nth(0).locator('tbody tr').nth(0)
      await filaCuota1.getByRole('link', { name: 'Pagar cuota' }).click()
      await page.waitForURL(/\/portal-cliente\/pagar\//)

      await page.getByPlaceholder('Monto transferido').fill('1000')
      await page.selectOption('select[name="moneda"]', 'USD')
      await page.getByRole('button', { name: 'Ya transferí' }).click()
      await page.waitForURL(/\/portal-cliente\/pagos\/.+\/comprobante$/)

      await page.setInputFiles('[data-testid="comprobante"]', {
        name: nombreComprobante,
        mimeType: 'application/pdf',
        buffer: COMPROBANTE_BYTES,
      })
      await expect(page.locator('[data-testid="comprobante"]')).toBeEnabled()
      await page.getByRole('button', { name: 'Finalizar' }).click()
      await page.waitForURL(/\/portal-cliente$/)

      await page.context().clearCookies()
      await login(page, fixtures.admin.email, fixtures.password)
      await page.goto('/admin/pagos')
      const fila = page
        .locator('[data-testid="tarjeta-pago"]')
        .filter({ has: page.locator(`a[href*="${nombreComprobante}"]`) })
      // El pago se cobra en una cuenta externa (sin login): nadie del otro
      // lado puede hacer la primera confirmación, así que alcanza con el
      // admin. La tarjeta lo dice explícitamente.
      await expect(fila.getByText('Confirmación solo de Admin (Cuenta externa)')).toBeVisible()
      await fila.getByRole('button', { name: 'Confirmar mi parte' }).click()

      // Misma demora corta y real de lectura-después-de-escritura ya
      // documentada en este archivo: se reintenta la navegación al detalle de
      // la cuenta externa en vez de asumir que el crédito ya está visible en
      // la primera carga.
      await expect(async () => {
        await page.goto(`/admin/cuentas-externas/${cuentaExternaId}`)
        await expect(page.getByText('Crédito (nos debe / le pagamos)')).toBeVisible()
      }).toPass({ timeout: 10000 })
    } finally {
      // fixtures.loteId es compartido con otros specs -- se limpia la
      // asignación de cuenta de cobro externa para no dejarles un estado
      // inesperado. El pago real que este test generó (vía el flujo
      // completo del cliente) tiene que borrarse también: `pagos.lote_id`
      // no tiene "on delete cascade", así que si queda colgado bloquea el
      // DELETE de "E2E Test Lote" en el `ensureTestFixtures()` de la
      // PRÓXIMA corrida (se vio romper así: error de constraint de
      // identificador único, con la causa real -- un pago huérfano --
      // escondida detrás).
      const admin = createAdminClient()
      await admin.from('lotes').update({ cuenta_cobro_externa_id: null }).eq('id', fixtures.loteId)
      await admin.from('cuentas_externas_movimientos').delete().eq('cuenta_externa_id', cuentaExternaId)
      await admin.from('pagos').delete().eq('lote_id', fixtures.loteId).eq('cliente_id', fixtures.cliente.id)
      await admin.from('cuentas_externas').delete().eq('id', cuentaExternaId)
    }
  })
})
