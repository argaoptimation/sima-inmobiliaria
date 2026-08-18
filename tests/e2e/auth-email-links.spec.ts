import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'

// Estos tests no pueden leer el HTML pegado a mano en el dashboard de
// Supabase (Authentication > Email Templates) -- eso no es accesible por
// ninguna API. Lo que SÍ prueban, de punta a punta y con un navegador real,
// es que el link que esa plantilla arma (`{{ .SiteURL }}/auth/confirm?
// token_hash={{ .TokenHash }}&type=...&next=/set-password`) efectivamente
// deja al usuario logueado y le permite elegir contraseña -- exactamente el
// mecanismo que la plantilla depende de que funcione. `admin.generateLink`
// genera el mismo token_hash que recibiría el usuario real por mail, sin
// necesidad de leer una casilla de correo.

test.describe('Links de email de autenticación (invitación y recuperar contraseña)', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('el link de invitación autentica y permite elegir contraseña', async ({ page }) => {
    const admin = createAdminClient()
    const email = `auth-link-invite-${Date.now()}@sima-e2e.invalid`

    const { data, error } = await admin.auth.admin.generateLink({ type: 'invite', email })
    if (error || !data.user) throw new Error(`No se pudo generar el link de invitación: ${error?.message}`)

    // Mismo insert que hace `venderLote`/`crearUsuarioStaff` justo después de
    // invitar -- sin esto la app no tiene ningún profile para este usuario,
    // un caso que no representa el uso real (siempre se crea junto con la
    // invitación).
    await admin.from('profiles').insert({ id: data.user.id, role: 'cliente', full_name: 'Auth Link Invite', email })

    try {
      const tokenHash = data.properties.hashed_token
      await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=invite&next=/set-password`)

      await expect(page).toHaveURL(/\/set-password$/)
      await expect(page.getByRole('heading', { name: 'Elegí tu contraseña' })).toBeVisible()

      await page.getByPlaceholder('Nueva contraseña').fill('Sima123!')
      await page.getByRole('button', { name: 'Guardar' }).click()

      await expect(page).not.toHaveURL(/\/set-password/)
    } finally {
      await admin.from('profiles').delete().eq('id', data.user.id)
      await admin.auth.admin.deleteUser(data.user.id)
    }
  })

  test('el link de recuperar contraseña autentica y permite elegir una nueva', async ({ page }) => {
    const admin = createAdminClient()

    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: fixtures.cliente.email,
    })
    if (error || !data.user) throw new Error(`No se pudo generar el link de recuperación: ${error?.message}`)

    try {
      const tokenHash = data.properties.hashed_token
      await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=recovery&next=/set-password`)

      await expect(page).toHaveURL(/\/set-password$/)
      await expect(page.getByRole('heading', { name: 'Elegí tu contraseña' })).toBeVisible()

      // Tiene que ser distinta a la que ya tenía el fixture (Sima123!) --
      // Supabase rechaza reponer la misma contraseña.
      await page.getByPlaceholder('Nueva contraseña').fill('Sima123!Recovery')
      await page.getByRole('button', { name: 'Guardar' }).click()

      await expect(page).not.toHaveURL(/\/set-password/)
    } finally {
      // Restaurar la contraseña del fixture -- otros specs asumen que
      // fixtures.cliente puede loguearse con fixtures.password (Sima123!).
      await admin.auth.admin.updateUserById(data.user.id, { password: 'Sima123!' })
    }
  })

  test('un token_hash inválido no autentica -- vuelve a /login con error', async ({ page }) => {
    await page.goto('/auth/confirm?token_hash=token-que-no-existe&type=invite&next=/set-password')

    await expect(page).toHaveURL(/\/login/)
    await expect(page).toHaveURL(/error=/)
  })
})
