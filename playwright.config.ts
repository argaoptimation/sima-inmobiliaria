import { defineConfig, devices } from '@playwright/test'

// Configuración de Playwright para el suite E2E de SIMA Inmobiliaria.
//
// La suite reutiliza el servidor de desarrollo si ya hay uno corriendo en el
// puerto 3000 (reuseExistingServer: true) para no pelear con una sesión de
// testeo manual, pero también puede levantar el suyo si hace falta.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Next.js en modo dev compila cada ruta on-demand la primera vez que se
    // visita, lo que puede tardar bastante más que el default de Playwright.
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
