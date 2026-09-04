import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { actualizarMisDatosCliente } from './actions'
import { CampoTelefono, AyudaTelefono } from '@/components/CampoTelefono'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'

export default async function MiPerfilClientePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>
}) {
  const { error, ok } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: perfil } = await supabase
    .from('profiles')
    .select('full_name, role, dni, domicilio, telefono_prefijo, telefono_numero')
    .eq('id', user!.id)
    .single()

  if (!perfil || perfil.role !== 'cliente') {
    redirect('/mi-perfil')
  }

  return (
    <div className="mx-auto max-w-md px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-blue-900">Mi perfil</h1>
        <EnlaceBoton
          href="/portal-cliente"
          className="text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
        >
          ← Volver a tus lotes
        </EnlaceBoton>
      </div>
      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {ok && <p className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">Guardado.</p>}

      <div className="mb-6 rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-lg font-bold text-blue-900">Mis datos</h2>
        {/* Nombre/DNI/domicilio ya no son editables por el cliente (04/09,
            pedido de Gabriel): son los datos que figuran en el contrato y en
            los recibos -- si el cliente los cambia libremente, dejan de
            coincidir con el papel firmado. Solo el teléfono (un dato de
            contacto, no legal) sigue siendo editable acá. */}
        <p className="mb-4 text-xs text-slate-500">
          Nombre, DNI y domicilio son los que figuran en tu contrato — si necesitás corregir alguno,
          pedíselo a la inmobiliaria.
        </p>
        <dl className="mb-4 flex flex-col gap-3 text-sm">
          <div>
            <dt className="font-medium text-slate-500">Nombre completo</dt>
            <dd className="text-slate-800">{perfil!.full_name}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">DNI</dt>
            <dd className="text-slate-800">{perfil!.dni ?? '—'}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Domicilio</dt>
            <dd className="text-slate-800">{perfil!.domicilio ?? '—'}</dd>
          </div>
        </dl>
        <form action={actualizarMisDatosCliente} className="flex flex-col gap-4">
          <label className="text-sm font-medium text-slate-700">
            Teléfono (para WhatsApp)
            <CampoTelefono
              prefijoGuardado={perfil!.telefono_prefijo}
              numeroGuardado={perfil!.telefono_numero}
            />
            <AyudaTelefono />
          </label>
          <BotonEnvio className="self-start rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-900 cursor-pointer">
            Guardar teléfono
          </BotonEnvio>
        </form>
      </div>

      <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
        <h2 className="mb-2 text-lg font-bold text-blue-900">Contraseña</h2>
        <EnlaceBoton
          href="/set-password"
          className="text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
        >
          Cambiar contraseña
        </EnlaceBoton>
      </div>
    </div>
  )
}
