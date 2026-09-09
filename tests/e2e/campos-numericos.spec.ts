import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient } from './fixtures/test-data'
import { login } from './utils/login'

// El valor de un campo numérico SOLO se cambia tipeando (Gabriel: la rueda
// el 09/09, las flechas del teclado el 10/09). Es una regla invisible: si se
// rompe, nadie la ve hasta que alguien confirma una seña equivocada.
test.describe('Campos numéricos: solo se cambian tipeando', () => {
  async function abrirFormularioConMontos(page: import('@playwright/test').Page) {
    const fixtures = await ensureTestFixtures()
    await login(page, fixtures.admin.email, fixtures.password)

    const { data: lote } = await createAdminClient()
      .from('lotes')
      .select('id')
      .eq('estado', 'disponible')
      .limit(1)
      .single()

    await page.goto(`/admin/lotes/${lote!.id}/reservar`)
    const monto = page.locator('input[name="montoSena"]')
    await monto.fill('500')
    return monto
  }

  test('la rueda del mouse no cambia el valor, y deja de tener el foco para que la página scrollee', async ({
    page,
  }) => {
    const monto = await abrirFormularioConMontos(page)

    await monto.hover()
    await page.mouse.wheel(0, -120)
    await expect(monto).toHaveValue('500')

    await page.mouse.wheel(0, 120)
    await expect(monto).toHaveValue('500')
  })

  test('las flechas arriba y abajo no cambian el valor', async ({ page }) => {
    const monto = await abrirFormularioConMontos(page)

    await monto.focus()
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await expect(monto).toHaveValue('500')

    await page.keyboard.press('ArrowDown')
    await expect(monto).toHaveValue('500')
  })

  test('las flechas izquierda y derecha SÍ siguen moviendo el cursor: son las que sirven para corregir un dígito', async ({
    page,
  }) => {
    const monto = await abrirFormularioConMontos(page)

    await monto.focus()
    // El cursor arranca al final ("500|"). Una flecha a la izquierda lo deja
    // entre el 0 y el 0, y tipear un 9 tiene que dar 5090.
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.type('9')
    await expect(monto).toHaveValue('5090')
  })
})
