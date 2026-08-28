import type { EstadoCobranza } from './estado-cliente'

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

function formatearFecha(fechaISO: string): string {
  const [anio, mes, dia] = fechaISO.split('-').map(Number)
  return `${dia} de ${MESES[mes - 1]} de ${anio}`
}

function nombreMes(fechaISO: string): string {
  const [, mes] = fechaISO.split('-').map(Number)
  return MESES[mes - 1]
}

// "julio", "julio y agosto", "junio, julio y agosto" -- para los mensajes de
// moroso/prejudicial, que mencionan un mes por cada cuota vencida.
function listarMeses(fechas: string[]): string {
  const meses = fechas.map(nombreMes)
  if (meses.length === 1) return meses[0]
  return `${meses.slice(0, -1).join(', ')} y ${meses[meses.length - 1]}`
}

// "Lote 12, mza 3, de Loteo San Martín" si el lote tiene esos datos cargados
// (numero_lote/manzana/loteo son opcionales, pensados para armar contratos --
// ver migración 0043), si no cae al identificador de siempre.
function fraseLote(datos: {
  lote: string
  numeroLote?: string | null
  manzana?: string | null
  nombreLoteo?: string | null
}): string {
  if (datos.numeroLote && datos.manzana && datos.nombreLoteo) {
    return `Lote ${datos.numeroLote}, mza ${datos.manzana}, de ${datos.nombreLoteo}`
  }
  return datos.lote
}

export interface DatosMensajeWhatsApp {
  nombre: string
  lote: string
  numeroLote?: string | null
  manzana?: string | null
  nombreLoteo?: string | null
  monto: number
  moneda: string
  // Para "normal"/"atrasado": la fecha de la cuota en cuestión.
  fechaVencimiento: string
  // Para "moroso"/"prejudicial": TODAS las fechas de cuotas vencidas, para
  // poder nombrar cada mes adeudado (2 para moroso, 3+ para prejudicial).
  fechasVencidas?: string[]
  // Link a la plataforma para pagar por transferencia -- todavía no hay un
  // dominio de producción estable (ver [[project_sima_despliegue_vercel_github]]),
  // así que puede venir undefined y el mensaje omite esa frase.
  linkPortal?: string
}

// Texto literal provisto por Nicolás (docx "mensajes para el sistema
// 28-08-26", 28/08/2026) para los 4 estados de cobranza (normal/atrasado/
// moroso/prejudicial) -- coinciden 1 a 1 con calcularEstadoCobranza. Ver
// Notas_Decisiones_SIMA.txt punto 52 para el historial de esta pieza.
const PLANTILLAS: Partial<Record<EstadoCobranza, (datos: DatosMensajeWhatsApp) => string>> = {
  normal: (datos) => `¡Hola ${datos.nombre}!
Te recordamos que tu cuota del mes de ${nombreMes(datos.fechaVencimiento)} del ${fraseLote(datos)} vence el día ${formatearFecha(datos.fechaVencimiento)}, y es de ${datos.monto} ${datos.moneda}.
Podes pagar en efectivo, en nuestra oficina${datos.linkPortal ? ` o ingresar a tu cuenta en ${datos.linkPortal} y abonar tu cuota a través de transferencia` : ' o por transferencia'}.
Muchas gracias`,

  atrasado: (datos) => `¡Hola ${datos.nombre}!
Te recordamos que tu cuota del mes de ${nombreMes(datos.fechaVencimiento)} del ${fraseLote(datos)} YA VENCIÓ. El vencimiento fue el día ${formatearFecha(datos.fechaVencimiento)}.
Te pedimos que ingreses a la brevedad${datos.linkPortal ? ` a tu cuenta en ${datos.linkPortal} así podes abonar por transferencia` : ''}, o, si querés pagar en efectivo, te esperamos en nuestra oficina.
¡Esperamos tu pronta respuesta, gracias!`,

  moroso: (datos) => `¡Hola ${datos.nombre}!
Te recordamos que, al día de hoy, estás adeudando la cuota de ${listarMeses(datos.fechasVencidas ?? [datos.fechaVencimiento])}. El monto total adeudado es de ${datos.monto} ${datos.moneda}.
Por favor, comunicate con nosotros a la brevedad para solucionar esta situación y evitar que se sigan acumulando los intereses.
Esperamos tu respuesta, saludos.`,

  prejudicial: (datos) => `¡Hola ${datos.nombre}!
Vemos en los registros que aún no has regularizado tu situación. Te recordamos que tus cuotas están vencidas y al día de hoy estás adeudando la cuota de ${listarMeses(datos.fechasVencidas ?? [datos.fechaVencimiento])}. El monto total adeudado es de ${datos.monto} ${datos.moneda}, que corresponde a las cuotas e intereses.
Ya tenemos instrucciones de remitir tu situación al área legal. Por favor comunicate urgente con nosotros para evitarlo.`,
}

export function armarMensajeWhatsApp(estado: EstadoCobranza, datos: DatosMensajeWhatsApp): string | null {
  const plantilla = PLANTILLAS[estado]
  return plantilla ? plantilla(datos) : null
}

// wa.me necesita el número completo con código de país (ej. 54 9 351...),
// sin +/espacios/guiones -- no se agrega el código de país solo, se asume
// que ya viene cargado en profiles.telefono tal como lo tipeó el admin. Si
// en la práctica los teléfonos se cargan sin el 54 9 adelante, el link no
// va a abrir el chat correcto -- avisar para agregar ese armado acá.
export function armarLinkWhatsApp(telefono: string, mensaje: string): string {
  const soloDigitos = telefono.replace(/\D/g, '')
  return `https://wa.me/${soloDigitos}?text=${encodeURIComponent(mensaje)}`
}
