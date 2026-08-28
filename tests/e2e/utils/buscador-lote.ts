import { Page, expect } from '@playwright/test'

/**
 * Interactúa con BuscadorLoteAmplio (app/admin/efectivo/BuscadorLoteAmplio.tsx):
 * escribe `texto` en el buscador y clickea la primera coincidencia del
 * desplegable -- a diferencia del viejo BuscadorLote (datalist nativo, match
 * exacto por identificador), este filtra por identificador, nombre o DNI y
 * requiere un click real en la opción para resolver el loteId.
 */
export async function elegirLoteEnBuscadorAmplio(page: Page, texto: string) {
  const input = page.locator('[data-testid="buscador-lote-amplio"]')
  await input.fill(texto)
  const primeraCoincidencia = page.locator('ul li button').first()
  await expect(primeraCoincidencia).toBeVisible()
  await primeraCoincidencia.click()
}
