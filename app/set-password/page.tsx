import Image from 'next/image'
import { setPassword } from './actions'
import { CampoPassword } from '@/components/CampoPassword'
import { BotonEnvio } from '@/components/BotonEnvio'

export default async function SetPasswordPage({
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
          <h1 className="text-xl font-extrabold text-blue-900">Elegí tu contraseña</h1>
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}

        <p className="mb-3 text-sm text-slate-600">
          Mínimo 8 caracteres, incluyendo un signo (ej. ! ? . # -)
        </p>

        <form action={setPassword} className="flex flex-col gap-3">
          <CampoPassword
            name="password"
            placeholder="Nueva contraseña"
            required
            minLength={8}
            autoComplete="new-password"
          />
          <BotonEnvio className="cursor-pointer rounded-lg bg-blue-800 px-3 py-2 font-semibold text-white transition-colors hover:bg-blue-900">
            Guardar
          </BotonEnvio>
        </form>
      </div>
    </main>
  )
}
