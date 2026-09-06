import { createClient } from '@/lib/supabase/server'
import { calcularEstadoCobranza, cuotasVencidas, type EstadoCobranza } from '@/lib/cobranza/estado-cliente'
import { calcularInteresMoratorio } from '@/lib/cobranza/interes-moratorio'
import { hoyArgentina } from '@/lib/fecha/hoy-argentina'
import { formatearFechaCorta } from '@/lib/fecha/formatear-fecha-corta'
import { inicialesDeNombre } from '@/lib/ui/iniciales'
import { redirect } from 'next/navigation'
import { logout } from '@/app/login/actions'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import { CircleCheck, TriangleAlert, CreditCard, LogOut } from 'lucide-react'
import {
  PORTAL_BANNER,
  PORTAL_BANNER_GRADIENTE,
  PORTAL_BANNER_RADIALES,
  PORTAL_BANNER_RADIALES_GRADIENTE,
  PORTAL_BANNER_SOMBRA,
  PORTAL_BANNER_SOMBRA_GRADIENTE,
  PORTAL_BANNER_CONTENIDO,
  PORTAL_TOPBAR_FILA,
  PORTAL_LOGO_WRAP,
  PORTAL_NAV,
  PORTAL_NAV_LINK_ACTIVO,
  PORTAL_NAV_LINK,
  PORTAL_AVATAR,
  PORTAL_SALUDO_WRAP,
  PORTAL_SALUDO_TITULO,
  PORTAL_SALUDO_SUB,
  PORTAL_PILL,
  PORTAL_TARJETA_LOTE,
  PORTAL_TARJETA_LOTE_BODY,
  PORTAL_ETIQUETA_LOTEO,
  PORTAL_TITULO_LOTE,
  PORTAL_BADGE_LOTE,
  PORTAL_BARRA_FONDO,
  PORTAL_DATO_MINI_LABEL,
  PORTAL_DATO_MINI_VALOR,
  PORTAL_BOTON_VER_DETALLE,
  PORTAL_BOTON_PAGAR,
  PORTAL_BOTON_REGULARIZAR,
  NUMERO_TABULAR,
} from '@/lib/ui/clases'

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function formatearDiaYMes(fechaISO: string): string {
  const [, mes, dia] = fechaISO.split('-').map(Number)
  return `${dia} de ${MESES[mes - 1]}`
}

const ETIQUETA_BADGE: Record<EstadoCobranza, string> = {
  normal: 'Al día',
  atrasado: '1 cuota vencida',
  moroso: '2 cuotas vencidas',
  prejudicial: '', // se arma en runtime, depende de cuántas
}

const CLASE_BADGE: Record<EstadoCobranza, string> = {
  normal: 'bg-green-50 text-green-700',
  atrasado: 'bg-amber-50 text-amber-700',
  moroso: 'bg-red-50 text-red-700',
  prejudicial: 'bg-orange-50 text-orange-700',
}

// Degradé de la barra de progreso por estado -- mismo criterio de color que
// el resto de la app (verde/ámbar/rojo/naranja para normal/atrasado/moroso/
// prejudicial), solo que acá es un degradé de 2 tonos en vez de un color
// sólido porque así lo pide el mockup para el caso "normal"/"atrasado".
const DEGRADE_BARRA: Record<EstadoCobranza, string> = {
  normal: 'linear-gradient(90deg,#3b82f6,#1e40af)',
  atrasado: 'linear-gradient(90deg,#f59e0b,#d97706)',
  moroso: 'linear-gradient(90deg,#dc2626,#991b1b)',
  prejudicial: 'linear-gradient(90deg,#f97316,#c2410c)',
}

// Portal del cliente (PR3 del rediseño, ver design-system/rediseno/PLAN.md,
// MOCKUP 2). Reemplaza la tabla de 4 columnas por una banda de saludo +
// una tarjeta full-width por lote. NO se tocó middleware/auth ni qué datos
// puede ver el cliente -- sigue sin ver disponibilidad, precios de otros
// lotes, ni mora de otros clientes (mismas consultas de siempre, acotadas a
// `cliente_id = user.id`).
export default async function PortalClientePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: perfil } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user!.id)
    .single()

  const nombreCompleto = perfil?.full_name ?? user!.email ?? 'Cliente'
  const primerNombre = nombreCompleto.split(' ')[0]

  const { data: lotes } = await supabase
    .from('lotes')
    .select('id, identificador, moneda, numero_lote, manzana, loteo_id, interes_moratorio_diario, ciclo_actual')
    .eq('cliente_id', user!.id)
    .order('identificador')

  const loteoIds = [...new Set((lotes ?? []).map((lote) => lote.loteo_id).filter(Boolean))]
  const { data: loteosData } =
    loteoIds.length > 0 ? await supabase.from('loteos').select('id, nombre').in('id', loteoIds) : { data: [] }
  const nombreLoteoPorId = new Map((loteosData ?? []).map((loteo) => [loteo.id, loteo.nombre]))

  const hoy = hoyArgentina()

  const lotesConDatos = await Promise.all(
    (lotes ?? []).map(async (lote) => {
      // Acotado al ciclo VIGENTE -- mismo criterio que ya usa el detalle del
      // lote (bug real encontrado 26/08: sin este filtro, un lote rescindido
      // y revendido mezclaba acá la deuda vieja del dueño anterior).
      const { data: cuotas } = await supabase
        .from('cuotas')
        .select('id, numero, monto_base, saldo_pendiente, fecha_vencimiento')
        .eq('lote_id', lote.id)
        .eq('ciclo', lote.ciclo_actual)
        .order('numero', { ascending: true })

      const listaCuotas = cuotas ?? []
      const cuotasParaEstado = listaCuotas.map((cuota) => ({
        saldoPendiente: cuota.saldo_pendiente,
        fechaVencimiento: cuota.fecha_vencimiento,
      }))
      const estado = calcularEstadoCobranza(cuotasParaEstado, hoy)
      const cantidadVencidas = cuotasVencidas(cuotasParaEstado, hoy).length

      const primeraImpaga = listaCuotas.find((cuota) => cuota.saldo_pendiente > 0) ?? null
      const totalCuotas = listaCuotas.length
      const cuotaActual = primeraImpaga ? primeraImpaga.numero : totalCuotas
      const saldoTotal = listaCuotas.reduce((acum, cuota) => acum + cuota.saldo_pendiente, 0)
      const vencida = primeraImpaga ? primeraImpaga.fecha_vencimiento < hoy : false
      const interes = primeraImpaga
        ? calcularInteresMoratorio(
            { saldoPendiente: primeraImpaga.saldo_pendiente, fechaVencimiento: primeraImpaga.fecha_vencimiento },
            lote.interes_moratorio_diario,
            hoy
          )
        : 0

      const nombreLoteo = lote.loteo_id ? (nombreLoteoPorId.get(lote.loteo_id) ?? null) : null
      const tieneDatosDeLote = Boolean(lote.numero_lote && lote.manzana)

      return {
        id: lote.id,
        identificador: lote.identificador,
        moneda: lote.moneda,
        // Sin loteo cargado, no repetir el identificador arriba Y abajo
        // (quedaba "E2E TEST LOTE" / "E2E Test Lote" duplicado) -- se omite
        // la etiqueta chica y el identificador queda como título, solo.
        etiquetaLoteo: nombreLoteo,
        tituloLote: tieneDatosDeLote ? `Manzana ${lote.manzana} · Lote ${lote.numero_lote}` : lote.identificador,
        estado,
        cantidadVencidas,
        totalCuotas,
        cuotaActual,
        saldoTotal,
        vencida,
        fechaRelevante: primeraImpaga?.fecha_vencimiento ?? null,
        montoRelevante: primeraImpaga ? (vencida ? primeraImpaga.saldo_pendiente + interes : primeraImpaga.monto_base) : null,
        cuotaIdParaPagar: primeraImpaga?.id ?? null,
      }
    })
  )

  const proximaFecha = lotesConDatos
    .map((lote) => lote.fechaRelevante)
    .filter((fecha): fecha is string => fecha !== null)
    .sort()[0]

  const algunoConDeuda = lotesConDatos.some((lote) => lote.estado !== 'normal')

  return (
    <div className="flex min-h-full flex-col">
      <div
        className={PORTAL_BANNER}
        style={{ background: PORTAL_BANNER_GRADIENTE, backgroundSize: '220% 220%', animation: 'simaFluido 16s ease-in-out infinite' }}
      >
        <div
          className={PORTAL_BANNER_RADIALES}
          style={{ background: PORTAL_BANNER_RADIALES_GRADIENTE, animation: 'simaFluido2 20s ease-in-out infinite' }}
        />
        <div className={PORTAL_BANNER_SOMBRA} style={{ background: PORTAL_BANNER_SOMBRA_GRADIENTE }} />

        <div className={PORTAL_BANNER_CONTENIDO}>
          <div className={PORTAL_TOPBAR_FILA}>
            <div className={PORTAL_LOGO_WRAP}>
              {/* eslint-disable-next-line @next/next/no-img-element -- logo con proporción propia, ver components/NavAdmin.tsx */}
              <img src="/logo.png" alt="SIMACOR" className="block h-[22px] w-auto" />
            </div>

            <div className={PORTAL_NAV}>
              <span className={PORTAL_NAV_LINK_ACTIVO}>Mis lotes</span>
              <EnlaceBoton href="/portal-cliente/mi-perfil" className={PORTAL_NAV_LINK}>
                Mi perfil
              </EnlaceBoton>
              <div className={PORTAL_AVATAR}>{inicialesDeNombre(nombreCompleto)}</div>
              <form action={logout}>
                <BotonEnvio
                  className="flex cursor-pointer items-center text-white/75 transition-colors hover:text-white"
                  cargandoTexto="…"
                >
                  <LogOut className="h-[17px] w-[17px]" />
                </BotonEnvio>
              </form>
            </div>
          </div>

          <div className={PORTAL_SALUDO_WRAP}>
            <div className="flex flex-col gap-[5px]">
              <h1 className={PORTAL_SALUDO_TITULO}>Hola, {primerNombre}</h1>
              <p className={PORTAL_SALUDO_SUB}>
                Tenés {lotesConDatos.length} {lotesConDatos.length === 1 ? 'lote' : 'lotes'} en curso.
                {proximaFecha
                  ? ` Tu próximo vencimiento es el ${formatearDiaYMes(proximaFecha)}.`
                  : ' Estás al día con todos tus pagos.'}
              </p>
            </div>
            {lotesConDatos.length > 0 && (
              <div className={`${PORTAL_PILL} ${algunoConDeuda ? 'text-amber-700' : 'text-green-700'}`}>
                {algunoConDeuda ? <TriangleAlert className="h-4 w-4" /> : <CircleCheck className="h-4 w-4" />}
                {algunoConDeuda ? 'Tenés pagos pendientes' : 'Estás al día'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fuera del banner -- contenido normal de página, con fondo propio
          (--background, gris clarito). Sin solape con la banda: es un
          margin-top NORMAL de 24px (el valor real del mockup), no un
          margin negativo -- ver el comentario largo en PORTAL_BANNER de
          lib/ui/clases.ts sobre por qué se sacó el solape. */}
      <div className="relative mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-[26px] px-4 pb-10 sm:px-12">
        <div className="flex flex-col gap-4 mt-[24px]">
          {lotesConDatos.length === 0 ? (
            <div className="rounded-[14px] border border-blue-100 bg-white p-6 text-center text-slate-600 shadow-sm">
              Todavía no tenés un lote asignado.
            </div>
          ) : (
            lotesConDatos.map((lote) => (
              <div key={lote.id} className={PORTAL_TARJETA_LOTE}>
                <div className={PORTAL_TARJETA_LOTE_BODY}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-col gap-1">
                      {lote.etiquetaLoteo && <span className={PORTAL_ETIQUETA_LOTEO}>{lote.etiquetaLoteo}</span>}
                      <span className={PORTAL_TITULO_LOTE}>{lote.tituloLote}</span>
                    </div>
                    <span className={`${PORTAL_BADGE_LOTE} ${CLASE_BADGE[lote.estado]}`}>
                      {lote.estado === 'prejudicial'
                        ? `${lote.cantidadVencidas} cuotas vencidas`
                        : ETIQUETA_BADGE[lote.estado]}
                    </span>
                  </div>

                  {lote.totalCuotas > 0 && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[13px] text-slate-500">
                          Cuota <strong className={`text-blue-900 ${NUMERO_TABULAR}`}>{lote.cuotaActual}</strong> de{' '}
                          <span className={NUMERO_TABULAR}>{lote.totalCuotas}</span>
                        </span>
                        <span className={`text-[13px] text-slate-500 ${NUMERO_TABULAR}`}>
                          Saldo <strong className="text-blue-900">
                            {lote.saldoTotal.toLocaleString('es-AR')} {lote.moneda}
                          </strong>
                        </span>
                      </div>
                      <div className={PORTAL_BARRA_FONDO}>
                        <div
                          className="h-full rounded-[4px]"
                          style={{
                            width: `${Math.round((lote.cuotaActual / lote.totalCuotas) * 100)}%`,
                            background: DEGRADE_BARRA[lote.estado],
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-[26px] pt-0.5">
                    {lote.fechaRelevante && (
                      <>
                        <div className="flex flex-col gap-[3px]">
                          <span className={PORTAL_DATO_MINI_LABEL}>
                            {lote.vencida ? 'Venció el' : 'Próximo vencimiento'}
                          </span>
                          <span className={`${PORTAL_DATO_MINI_VALOR} ${lote.vencida ? 'text-amber-700' : ''}`}>
                            {formatearFechaCorta(lote.fechaRelevante)}
                          </span>
                        </div>
                        <div className="flex flex-col gap-[3px]">
                          <span className={PORTAL_DATO_MINI_LABEL}>{lote.vencida ? 'Monto con interés' : 'Monto'}</span>
                          <span className={PORTAL_DATO_MINI_VALOR}>
                            {(lote.montoRelevante ?? 0).toLocaleString('es-AR')} {lote.moneda}
                          </span>
                        </div>
                      </>
                    )}
                    <div className="ml-auto flex gap-[9px]">
                      <EnlaceBoton href={`/portal-cliente/lotes/${lote.id}`} className={PORTAL_BOTON_VER_DETALLE}>
                        Ver detalle
                      </EnlaceBoton>
                      {lote.cuotaIdParaPagar && (
                        <EnlaceBoton
                          href={`/portal-cliente/pagar/${lote.cuotaIdParaPagar}`}
                          className={lote.vencida ? PORTAL_BOTON_REGULARIZAR : PORTAL_BOTON_PAGAR}
                          claseInterna="flex items-center gap-[7px]"
                        >
                          <CreditCard className="h-[15px] w-[15px]" />
                          {lote.vencida ? 'Regularizar' : 'Pagar cuota'}
                        </EnlaceBoton>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
