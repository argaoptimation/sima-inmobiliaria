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

export interface DatosMensajeWhatsApp {
  nombre: string
  lote: string
  monto: number
  moneda: string
  fechaVencimiento: string
}

// Un aviso por estado de cobranza (mismos nombres que ya usa
// calcularEstadoCobranza, para no inventar una clasificación paralela).
// "prejudicial" y "ultimo_aviso" quedan sin texto a propósito -- Nicolás
// todavía no definió esas plantillas ni existen esos estados en el sistema
// (ver Notas_Decisiones_SIMA.txt). Agregar una plantilla nueva acá alcanza
// para que el botón de WhatsApp empiece a aparecer para ese estado, sin
// tocar nada más.
const PLANTILLAS: Partial<Record<EstadoCobranza | 'ultimo_aviso', (datos: DatosMensajeWhatsApp) => string>> = {
  normal: (datos) => `Hola ${datos.nombre}! 👋 Te escribo de SIMA Inmobiliaria.

Vimos que la cuota de ${datos.lote} que vencía el ${formatearFecha(datos.fechaVencimiento)} todavía no la registramos como pagada. El monto pendiente es ${datos.monto} ${datos.moneda}.

Si ya la transferiste, tranqui, puede que se haya cruzado con este mensaje — subí el comprobante a la plataforma y quedamos al día. Si todavía no, te pedimos que la regularices cuanto antes para que no empiecen a correr intereses por mora.

Cualquier cosa, estamos para ayudarte.`,

  moroso: (datos) => `Hola ${datos.nombre}, te escribo de SIMA Inmobiliaria.

Tenés cuotas vencidas de ${datos.lote} sin pagar, por un total de ${datos.monto} ${datos.moneda}, y ya están corriendo intereses por mora sobre ese saldo.

Necesitamos que te pongas al día a la brevedad para que no siga aumentando. Si tenés alguna dificultad para pagar o querés coordinar otra forma de hacerlo, avisame y lo vemos juntos.

Quedo atento a tu respuesta.`,
}

export function armarMensajeWhatsApp(
  estado: EstadoCobranza | 'ultimo_aviso',
  datos: DatosMensajeWhatsApp
): string | null {
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
