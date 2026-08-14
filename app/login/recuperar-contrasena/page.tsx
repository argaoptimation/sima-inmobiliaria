import { solicitarRecuperacion } from './actions'

export default async function RecuperarContrasenaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>
}) {
  const { error, ok } = await searchParams

  return (
    <main className="mx-auto mt-24 max-w-sm p-6">
      <h1 className="mb-6 text-xl font-semibold">Recuperar contraseña</h1>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      {ok ? (
        <p className="mb-4 rounded bg-green-100 p-2 text-sm text-green-700">
          Si ese email tiene una cuenta en SIMA, te va a llegar un mail con un link para elegir una
          contraseña nueva.
        </p>
      ) : (
        <form action={solicitarRecuperacion} className="flex flex-col gap-3">
          <input
            name="email"
            type="email"
            placeholder="Email"
            required
            className="rounded border px-3 py-2"
          />
          <button type="submit" className="rounded bg-black px-3 py-2 text-white">
            Enviar link
          </button>
        </form>
      )}
      <a href="/login" className="mt-4 inline-block text-sm underline">
        ← Volver a ingresar
      </a>
    </main>
  )
}
