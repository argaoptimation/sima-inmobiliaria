import { test, expect } from '@playwright/test'
import { createAdminClient, ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

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

    await page.waitForURL(/\/admin\/cuentas-externas\/.+$/)

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
    await page.waitForURL(/\/admin\/cuentas-externas\/.+$/)
    await page.waitForLoadState('networkidle')

    await page.getByLabel('Monto', { exact: true }).fill('1000')
    await page.getByLabel('Concepto').fill('Primera deuda')
    await page.getByRole('button', { name: 'Agregar deuda' }).click()

    // Esperar a que el mensaje de guardado aparezca con reintentos por timing
    await expect(async () => {
      await expect(page.getByText('Guardado.')).toBeVisible()
    }).toPass({ timeout: 10000 })

    await page.getByLabel('Monto', { exact: true }).fill('500')
    await page.getByLabel('Concepto').fill('Segunda deuda')
    await page.getByRole('button', { name: 'Agregar deuda' }).click()

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
    await page.waitForURL(/\/admin\/cuentas-externas\/.+$/)
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
})
