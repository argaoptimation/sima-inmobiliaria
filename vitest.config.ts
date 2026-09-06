import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Mismo alias que tsconfig.json ("@/*" -> raíz del proyecto). Sin esto,
  // cualquier módulo de `lib/` que importe con `@/...` -- que es la
  // convención del resto del código -- no se puede testear con Vitest.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    exclude: ['node_modules/**', 'tests/e2e/**'],
  },
})
