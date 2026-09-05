import { Page } from '@playwright/test'

/**
 * Elige la forma de pago del formulario de reserva si todavía no está
 * elegida.
 *
 * Desde el 04/09 la forma de pago y la instrumentación son obligatorias
 * (antes la instrumentación era opcional y la forma de pago no existía), así
 * que un submit sin completarlas queda bloqueado por la validación nativa
 * del browser y el test se cuelga esperando una navegación que nunca pasa.
 *
 * Elegir la forma de pago alcanza: la instrumentación se autocompleta a
 * partir de ella (financiado → boleto, contado → escritura). Por defecto se
 * usa "contado", que NO dispara la generación automática del boleto -- los
 * tests que quieran ejercitar esa generación pasan 'financiado'
 * explícitamente.
 */
export async function elegirFormaPago(page: Page, forma: 'contado' | 'financiado' = 'contado') {
  const select = page.locator('select[name="formaPago"]')
  if ((await select.count()) === 0) return
  await select.selectOption(forma)
}
