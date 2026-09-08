import { expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const COMPROBANTE_BYTES = readFileSync(
  path.join(__dirname, '..', 'fixtures', 'comprobante-test.pdf')
)

interface OpcionesPago {
  monto: number | string
  moneda?: 'USD' | 'ARS'
  // Nombre del archivo del comprobante. Conviene único por corrida cuando el
  // test después ubica "su" pago por el href del link "Ver comprobante".
  nombreComprobante?: string
}

/**
 * Completa el formulario de /portal-cliente/pagar/[cuotaId] asumiendo que la
 * página ya está abierta. Desde el 06/09 "Ya transferí" y la subida del
 * comprobante son UN solo formulario (antes el comprobante era una pantalla
 * aparte, /portal-cliente/pagos/[id]/comprobante). Al terminar la navegación
 * queda en el detalle del lote, con el ?ok=... del pago registrado.
 *
 * Devuelve el nombre de archivo usado, para poder ubicar la fila del pago.
 */
export async function completarFormularioPagar(
  page: Page,
  { monto, moneda = 'USD', nombreComprobante = `e2e-comprobante-${Date.now()}.pdf` }: OpcionesPago
): Promise<string> {
  // La moneda primero: al cambiarla, MontoYMoneda reescribe el monto con el
  // total de la deuda convertido -- si se completara el monto antes, ese
  // cambio lo pisaría.
  await page.selectOption('select[name="moneda"]', moneda)
  await page.getByPlaceholder('Monto transferido').fill(String(monto))

  await page.setInputFiles('[data-testid="comprobante"]', {
    name: nombreComprobante,
    mimeType: 'application/pdf',
    buffer: COMPROBANTE_BYTES,
  })
  // CampoArchivoDirecto sube directo a Storage apenas se elige el archivo; el
  // input queda deshabilitado mientras tanto y el submit se traba en silencio
  // si el campo oculto del path todavía está vacío.
  await expect(page.locator('[data-testid="comprobante"]')).toBeEnabled()

  await page.getByRole('button', { name: 'Ya transferí' }).click()
  await page.waitForURL(/\/portal-cliente\/lotes\/[^/]+(\?|$)/)

  return nombreComprobante
}

/**
 * Variante que navega ella misma a la pantalla de pago. Para los tests que no
 * necesitan ejercitar el link "Pagar cuota" de la tabla de cuotas.
 */
export async function pagarCuotaPorUI(
  page: Page,
  cuotaId: string,
  opciones: OpcionesPago
): Promise<string> {
  await page.goto(`/portal-cliente/pagar/${cuotaId}`)
  return completarFormularioPagar(page, opciones)
}
