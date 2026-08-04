import { Page } from '@playwright/test'

/**
 * Loguea usando el form real de `/login` (mismo flujo que un usuario real,
 * nada de bypass) y espera a que termine de resolver el redirect de `/`
 * hacia `/admin` o `/portal-cliente` según el rol del perfil.
 */
export async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Contraseña').fill(password)
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
