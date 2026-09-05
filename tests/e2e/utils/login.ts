import { Page } from '@playwright/test'

/**
 * Loguea usando el form real de `/login` (mismo flujo que un usuario real,
 * nada de bypass) y espera a que termine de resolver el redirect de `/`
 * hacia `/admin` o `/portal-cliente` según el rol del perfil.
 */
export async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  // Por `name`, no por placeholder: el rediseño del login (commit 2c9b9b5)
  // cambió los placeholders a "tu@email.com" y "••••••••" y dejó a toda la
  // suite sin poder loguearse. El atributo `name` es el que el form action
  // realmente lee, así que es el selector estable.
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.waitForURL(/\/(admin|portal-cliente)/)
}

/**
 * Esta app no tiene un botón/route de logout explícito. Para poder cambiar
 * de usuario entre pasos del test, limpiamos las cookies de sesión del
 * contexto del browser y volvemos a `/login`.
 */
export async function logout(page: Page) {
  await page.context().clearCookies()
  await page.goto('/login')
}
