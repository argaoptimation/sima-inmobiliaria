'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { validarSeleccionAcreedorPorNombre } from '@/lib/lotes/validar-seleccion-acreedor'
import { resolverAdminPorDefecto } from '@/lib/lotes/admin-por-defecto'
import { generarPlanEnCurso } from '@/lib/lotes/generar-cuotas-en-curso'
import { telefonoParaGuardar } from '@/lib/telefono/prefijos'
import { mensajeDeError } from '@/lib/errores'
import { invitarPorEmail, contrasenaDeDescarte } from '@/lib/auth/invitar-por-email'

// Todo lo que el admin tipeó vuelve en la URL cuando el formulario rebota.
// Acá importa más que en cualquier otra pantalla: son ~200 lotes a cargar a
// mano y el formulario tiene veinte campos, así que perder lo cargado por un
// email repetido sería insoportable.
const CAMPOS_A_PRESERVAR = [
  'identificador',
  'ubicacion',
  'precioTotal',
  'moneda',
  'acreedorNombre',
  'acreedorNombreNuevo',
  'acreedorEmailNuevo',
  'loteoId',
  'numeroLote',
  'manzana',
  'superficieM2',
  'cuentaRentas',
  'nomenclaturaCatastral',
  'matricula',
  'clienteNombre',
  'clienteEmail',
  'clienteDni',
  'clienteDomicilio',
  'prefijo',
  'telefonoNumero',
  'cuotasYaPagadas',
  'cuotasPendientes',
  'montoCuota',
  'fechaProximaCuota',
  'interesMoratorioDiario',
  'confirmarClienteExistente',
]

function paramsPreservados(formData: FormData): URLSearchParams {
  const params = new URLSearchParams()
  for (const campo of CAMPOS_A_PRESERVAR) {
    const valor = formData.get(campo)
    if (valor !== null) params.set(campo, valor as string)
  }
  return params
}

function volverConError(formData: FormData, mensaje: string): never {
  const params = paramsPreservados(formData)
  params.set('error', mensaje)
  redirect(`/admin/lotes/cargar-en-curso?${params.toString()}`)
}

// Carga de una sola vez un lote que YA estaba vendido y a mitad de camino
// cuando se lo mete al sistema (07/09, pedido de Gabriel: Nicolás tiene ~200
// así).
//
// Por qué no alcanza con el circuito normal: para vender hay que reservar
// primero, y reservar exige el comprobante de la seña y las dos fotos del
// DNI. De un lote vendido en 2023 nadie tiene esos archivos, así que el
// camino normal queda trabado en el primer paso.
//
// Las tres decisiones que sostienen esta pantalla:
//
//   1. Crea el lote, el comprador y las cuotas en un solo submit. Con 200
//      lotes por delante, tres pantallas encadenadas por lote es media
//      jornada de más.
//   2. NO le manda invitación al comprador. Doscientas invitaciones de golpe
//      se pasan del límite diario de emails, y le llegaría a gente que no
//      pidió nada. El acceso se le da después, desde la ficha del cliente,
//      cuando lo pida.
//   3. Las cuotas ya pagadas se cargan saldadas y marcadas `migrada`: sin
//      pago, sin imputación y sin movimiento de cuenta corriente. Esa plata
//      se cobró antes del sistema; si entrara como pago, la plataforma le
//      diría a Nicolás que le debe al acreedor algo que ya le pagó.
export async function cargarLoteEnCurso(formData: FormData) {
  await requireAdministrador()

  const supabase = await createClient()
  const admin = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const texto = (campo: string) => ((formData.get(campo) as string) || '').trim()
  const textoONulo = (campo: string) => texto(campo) || null

  const identificador = texto('identificador')
  const ubicacion = textoONulo('ubicacion')
  const moneda = texto('moneda') as 'USD' | 'ARS'
  const precioTotal = Number(texto('precioTotal'))

  if (!identificador) volverConError(formData, 'El identificador del lote es obligatorio')
  if (!ubicacion) volverConError(formData, 'La ubicación del lote es obligatoria')
  if (!Number.isFinite(precioTotal) || precioTotal <= 0) {
    volverConError(formData, 'El precio total del lote tiene que ser mayor a cero')
  }
  if (moneda !== 'USD' && moneda !== 'ARS') volverConError(formData, 'Elegí la moneda del lote')

  // --- Plan de cuotas: se valida ANTES de crear nada -------------------
  // Si el plan está mal, no tiene sentido haber dado de alta un lote y un
  // comprador que después hay que borrar a mano.
  const plan = generarPlanEnCurso({
    cuotasYaPagadas: Number(texto('cuotasYaPagadas') || '0'),
    cuotasPendientes: Number(texto('cuotasPendientes')),
    montoCuota: Number(texto('montoCuota')),
    fechaProximaCuota: texto('fechaProximaCuota'),
  })

  if (!plan.valido) volverConError(formData, plan.error)

  const interesMoratorioTexto = texto('interesMoratorioDiario')
  const interesMoratorioDiario = interesMoratorioTexto ? Number(interesMoratorioTexto) : null

  if (interesMoratorioDiario !== null && (!Number.isFinite(interesMoratorioDiario) || interesMoratorioDiario < 0)) {
    volverConError(formData, 'El interés moratorio diario tiene que ser un número de 0 o más')
  }

  // --- Acreedor --------------------------------------------------------
  const { data: acreedoresExistentes } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'acreedor')

  const seleccion = validarSeleccionAcreedorPorNombre({
    nombreElegido: texto('acreedorNombre'),
    acreedores: acreedoresExistentes ?? [],
    nombreNuevo: texto('acreedorNombreNuevo'),
    emailNuevo: texto('acreedorEmailNuevo'),
  })

  if (seleccion.tipo === 'invalido') volverConError(formData, seleccion.error)

  // --- Comprador -------------------------------------------------------
  const clienteEmail = texto('clienteEmail').toLowerCase()
  const clienteNombre = texto('clienteNombre')

  if (!clienteEmail || !clienteNombre) {
    volverConError(formData, 'Completá nombre y email del comprador')
  }

  const { data: clienteExistente } = await admin
    .from('profiles')
    .select('id, role, full_name')
    .eq('email', clienteEmail)
    .maybeSingle()

  if (clienteExistente && clienteExistente.role !== 'cliente') {
    volverConError(
      formData,
      `Ese email ya pertenece a ${clienteExistente.full_name} y no es un cliente. Usá otro email.`
    )
  }

  // Mismo recaudo que en la venta normal: enganchar el lote a la cuenta de
  // otra persona por un email mal tipeado no puede pasar en silencio.
  if (clienteExistente && texto('confirmarClienteExistente') !== clienteExistente.id) {
    const params = paramsPreservados(formData)
    params.set('confirmarClienteExistente', clienteExistente.id)
    params.set(
      'error',
      `Ya existe un cliente con el email ${clienteEmail}: ${clienteExistente.full_name}. Si es la misma persona, volvé a confirmar y el lote se le suma a esa cuenta.`
    )
    redirect(`/admin/lotes/cargar-en-curso?${params.toString()}`)
  }

  // --- A partir de acá se escribe -------------------------------------
  let acreedorId: string

  if (seleccion.tipo === 'nuevo') {
    const { data: invitado, error: errorInvite } = await invitarPorEmail(admin, seleccion.email)

    if (errorInvite || !invitado.user) volverConError(formData, mensajeDeError(errorInvite))

    const { error: errorPerfilAcreedor } = await admin.from('profiles').insert({
      id: invitado!.user.id,
      role: 'acreedor',
      full_name: seleccion.nombre,
      email: seleccion.email,
    })

    if (errorPerfilAcreedor) volverConError(formData, mensajeDeError(errorPerfilAcreedor))

    acreedorId = invitado!.user.id
  } else {
    acreedorId = seleccion.id
  }

  let clienteId: string

  if (clienteExistente) {
    clienteId = clienteExistente.id
  } else {
    // createUser, no inviteUserByEmail: el comprador no se entera de nada.
    // La contraseña es de descarte -- nadie la conoce ni la necesita; el
    // acceso se le da desde la ficha del cliente ("Cambiar contraseña")
    // cuando lo pida.
    const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
      email: clienteEmail,
      email_confirm: true,
      password: contrasenaDeDescarte(),
    })

    if (errorCrear || !creado.user) volverConError(formData, mensajeDeError(errorCrear))

    const dni = textoONulo('clienteDni')

    if (dni) {
      const { data: dniOcupado } = await admin
        .from('profiles')
        .select('id')
        .eq('dni', dni)
        .maybeSingle()

      if (dniOcupado) {
        await admin.auth.admin.deleteUser(creado!.user.id)
        volverConError(formData, `El DNI ${dni} ya está cargado en otro cliente`)
      }
    }

    const telefono = telefonoParaGuardar(texto('prefijo'), texto('telefonoNumero'))

    const { error: errorPerfil } = await admin.from('profiles').insert({
      id: creado!.user.id,
      role: 'cliente',
      full_name: clienteNombre,
      email: clienteEmail,
      dni,
      domicilio: textoONulo('clienteDomicilio'),
      telefono_prefijo: telefono.prefijo,
      telefono_numero: telefono.numero,
    })

    if (errorPerfil) {
      await admin.auth.admin.deleteUser(creado!.user.id)
      volverConError(formData, mensajeDeError(errorPerfil))
    }

    clienteId = creado!.user.id
  }

  const { data: administradores } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'administrador')

  const { data: loteCreado, error: errorLote } = await admin
    .from('lotes')
    .insert({
      identificador,
      ubicacion,
      moneda,
      precio_total: precioTotal,
      estado: 'vendido',
      cliente_id: clienteId,
      acreedor_id: acreedorId,
      admin_id: resolverAdminPorDefecto({
        adminIdActual: null,
        administradores: administradores ?? [],
        usuarioActualId: user?.id ?? null,
        usuarioActualEsAdministrador: true,
      }),
      loteo_id: textoONulo('loteoId'),
      numero_lote: textoONulo('numeroLote'),
      manzana: textoONulo('manzana'),
      superficie_m2: texto('superficieM2') ? Number(texto('superficieM2')) : null,
      cuenta_rentas: textoONulo('cuentaRentas'),
      nomenclatura_catastral: textoONulo('nomenclaturaCatastral'),
      matricula: textoONulo('matricula'),
      cantidad_cuotas: plan.cuotas.length,
      monto_cuota_base: Number(texto('montoCuota')),
      fecha_primera_cuota: plan.fechaPrimeraCuota,
      interes_moratorio_diario: interesMoratorioDiario,
    })
    .select('id')
    .single()

  if (errorLote) {
    volverConError(
      formData,
      mensajeDeError(errorLote, {
        '23505': `Ya existe un lote con el identificador "${identificador}" en ese loteo (o sin loteo asignado)`,
      })
    )
  }

  const { error: errorCuotas } = await admin.from('cuotas').insert(
    plan.cuotas.map((cuota) => ({
      lote_id: loteCreado!.id,
      numero: cuota.numero,
      ciclo: 1,
      monto_base: cuota.montoBase,
      // Saldada de arranque y sin pago detrás: ver el comentario grande
      // arriba y la migración 0058.
      saldo_pendiente: cuota.yaPagada ? 0 : cuota.montoBase,
      fecha_vencimiento: cuota.fechaVencimiento,
      migrada: cuota.yaPagada,
    }))
  )

  if (errorCuotas) {
    // El lote ya existe pero sin cuotas: es un estado que se arregla
    // borrándolo y volviendo a cargarlo, así que conviene decirlo claro en
    // vez de dejarlo mudo.
    volverConError(
      formData,
      `El lote se creó pero no se pudieron cargar las cuotas (${mensajeDeError(errorCuotas)}). Borralo desde el detalle y volvé a cargarlo.`
    )
  }

  const cuotasPagadas = plan.cuotas.filter((cuota) => cuota.yaPagada).length

  await admin.from('lote_historial_estados').insert({
    lote_id: loteCreado!.id,
    evento: 'cargado_en_curso',
    estado_nuevo: 'vendido',
    cambiado_por: user!.id,
    detalle:
      cuotasPagadas > 0
        ? `Venta anterior al sistema. ${cuotasPagadas} de ${plan.cuotas.length} cuotas ya estaban pagadas al cargarlo.`
        : 'Venta anterior al sistema, sin cuotas pagadas todavía.',
  })

  redirect(
    `/admin/lotes/${loteCreado!.id}/distribucion?ok=${encodeURIComponent(
      'Lote cargado. Repartí las cuotas que quedan y elegí a quién se le transfiere cada una.'
    )}`
  )
}
