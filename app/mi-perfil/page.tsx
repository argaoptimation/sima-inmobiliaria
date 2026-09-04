import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { actualizarDatosPersonales, actualizarDatosTransferencia } from './actions'
import { CampoTelefono, AyudaTelefono } from '@/components/CampoTelefono'
import { Obligatorio } from '@/components/Obligatorio'
import { AdminShell } from '@/components/AdminShell'
import { contarPagosPendientes } from '@/lib/pagos-pendientes'
import { calcularSaldoCuentaCorrientePorMoneda } from '@/lib/cuenta-corriente/calcular-saldo'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import { ENTRADA, BOTON_PRIMARIO, ENLACE, TITULO_H1, TITULO_H2, BANNER_ERROR, BANNER_OK, TARJETA } from '@/lib/ui/clases'

export default async function MiPerfilPage({
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
    .select('full_name, role, alias, banco, cbu, titular, email, telefono_prefijo, telefono_numero')
    .eq('id', user!.id)
    .single()

  if (!perfil) {
    redirect('/login')
  }

  if (perfil!.role === 'cliente') {
    redirect('/portal-cliente')
  }

  const pagosPendientes = await contarPagosPendientes(supabase, perfil!.role, user!.id)

  const { data: movimientosCuentaCorriente } = await supabase
    .from('movimientos_cuenta_corriente')
    .select('tipo, monto, moneda')
    .eq('profile_id', user!.id)

  const saldosCuentaCorriente = calcularSaldoCuentaCorrientePorMoneda(
    (movimientosCuentaCorriente ?? []).map((m) => ({
      tipo: m.tipo as 'debe' | 'haber',
      monto: m.monto,
      moneda: m.moneda,
    }))
  )
  const entradasSaldoCuentaCorriente = Object.entries(saldosCuentaCorriente).filter(
    ([, monto]) => monto !== 0
  )

  const esStaff = ['administrador', 'acreedor', 'vendedor', 'cobrador'].includes(perfil!.role)

  const contenido = (
    <div className={`mx-auto max-w-md p-6 ${esStaff ? 'w-full' : 'mt-12'}`}>
        <h1 className={`mb-6 ${TITULO_H1}`}>Mi perfil</h1>
        {error && <p className={BANNER_ERROR}>{error}</p>}
        {ok && <p className={BANNER_OK}>Guardado.</p>}

        <div className={`mb-8 ${TARJETA}`}>
          <h2 className="mb-2 text-lg font-bold text-blue-900">Mi cuenta corriente</h2>
          <p className="mb-1 text-sm text-slate-800">
            {entradasSaldoCuentaCorriente.length === 0
              ? 'Sin movimientos todavía.'
              : entradasSaldoCuentaCorriente.map(([moneda, monto]) => `${monto} ${moneda}`).join(' / ')}
          </p>
          <p className="mb-2 text-xs text-slate-600">
            Positivo: la empresa todavía te debe. Negativo: cobraste de más y le debés a la empresa.
          </p>
          {['acreedor', 'vendedor', 'cobrador'].includes(perfil!.role) && (
            <EnlaceBoton href={`/admin/cuentas-corrientes/${user!.id}`} className={`inline-block ${ENLACE}`}>
              Ver detalle de movimientos →
            </EnlaceBoton>
          )}
        </div>

        <h2 className={`mb-2 ${TITULO_H2}`}>Mis datos</h2>
        <p className="mb-3 text-sm text-slate-600">
          El email es con el que iniciás sesión: si necesitás cambiarlo, pedíselo a un
          administrador.
        </p>
        <form action={actualizarDatosPersonales} className="mb-8 flex flex-col gap-3">
          <label className="text-sm text-slate-600">
            Nombre completo
            <Obligatorio />
            <input name="fullName" defaultValue={perfil!.full_name} required className={`w-full ${ENTRADA}`} />
          </label>
          <div className="text-sm text-slate-600">
            Email
            <p className="mt-1 text-sm font-medium text-slate-800">{perfil!.email ?? user!.email ?? '—'}</p>
          </div>
          <label className="text-sm text-slate-600">
            Teléfono
            <Obligatorio />
            <CampoTelefono
              prefijoGuardado={perfil!.telefono_prefijo}
              numeroGuardado={perfil!.telefono_numero}
              requerido
            />
            <AyudaTelefono />
          </label>
          <BotonEnvio className={`cursor-pointer self-start ${BOTON_PRIMARIO}`}>Guardar</BotonEnvio>
        </form>

        <h2 className={`mb-2 ${TITULO_H2}`}>Datos de transferencia</h2>
        <p className="mb-3 text-sm text-slate-600">
          Así los va a ver el cliente para corroborar antes de transferir. El titular tiene que ser
          el nombre tal cual figura en la cuenta bancaria de destino (puede no coincidir con tu
          nombre de arriba). Sin alias cargado, un cliente al que le toque pagarte a vos no tiene a
          dónde transferir.
        </p>
        <form action={actualizarDatosTransferencia} className="flex flex-col gap-3">
          <label className="text-sm text-slate-600">
            Titular de la cuenta
            <Obligatorio />
            <input name="titular" defaultValue={perfil!.titular ?? ''} required className={`w-full ${ENTRADA}`} />
          </label>
          <label className="text-sm text-slate-600">
            Alias
            <Obligatorio />
            <input name="alias" defaultValue={perfil!.alias ?? ''} required className={`w-full ${ENTRADA}`} />
          </label>
          <label className="text-sm text-slate-600">
            Banco
            <Obligatorio />
            <input name="banco" defaultValue={perfil!.banco ?? ''} required className={`w-full ${ENTRADA}`} />
          </label>
          <label className="text-sm text-slate-600">
            CBU (opcional)
            <input name="cbu" defaultValue={perfil!.cbu ?? ''} className={`w-full ${ENTRADA}`} />
          </label>
          <BotonEnvio className={`cursor-pointer self-start ${BOTON_PRIMARIO}`}>Guardar</BotonEnvio>
        </form>
    </div>
  )

  if (!esStaff) return contenido

  return (
    <AdminShell
      role={perfil!.role}
      pagosPendientes={pagosPendientes}
      userId={user!.id}
      nombreUsuario={perfil!.full_name ?? user!.email ?? 'Usuario'}
      cotizacion={null}
    >
      {contenido}
    </AdminShell>
  )
}
