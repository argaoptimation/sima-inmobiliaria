import { setPassword } from './actions'

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="mx-auto mt-24 max-w-sm p-6">
      <h1 className="mb-6 text-xl font-semibold">Elegí tu contraseña</h1>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      <p className="mb-3 text-sm text-gray-600">
        Mínimo 8 caracteres, incluyendo un signo (ej. ! ? . # -)
      </p>
      <form action={setPassword} className="flex flex-col gap-3">
        <input
          name="password"
          type="password"
          placeholder="Nueva contraseña"
          required
          minLength={8}
          className="rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Guardar
        </button>
      </form>
    </main>
  )
}
