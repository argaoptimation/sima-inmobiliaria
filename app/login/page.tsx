import Image from 'next/image'
import { login } from './actions'
import { CampoPassword } from '@/components/CampoPassword'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-blue-100 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Image src="/logo.png" alt="SIMA" width={64} height={64} className="rounded-lg" />
          <h1 className="text-xl font-extrabold text-blue-900">Ingresar a SIMA</h1>
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}

        <form action={login} className="flex flex-col gap-3">
          <input
            name="email"
            type="email"
            placeholder="Email"
            required
            autoComplete="email"
            className="rounded-lg border border-blue-100 px-3 py-2 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <CampoPassword name="password" placeholder="Contraseña" required autoComplete="current-password" />
          <BotonEnvio className="cursor-pointer rounded-lg bg-blue-800 px-3 py-2 font-semibold text-white transition-colors hover:bg-blue-900">
            Ingresar
          </BotonEnvio>
        </form>

        <EnlaceBoton
          href="/login/recuperar-contrasena"
          className="mt-4 block text-center text-sm text-blue-800 underline-offset-2 hover:underline"
        >
          ¿Olvidaste tu contraseña?
        </EnlaceBoton>
      </div>
    </main>
  )
}
