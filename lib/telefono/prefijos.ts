export interface PrefijoTelefono {
  codigo: string
  nombre: string
  bandera: string
}

// Cobertura: Latinoamérica completa + los países de origen más comunes para
// esta cartera de clientes. Argentina primera porque es la inmensa mayoría
// de los casos. "Otro" queda último a propósito -- es la única forma de
// cargar un país no listado, pero no es la opción por defecto: siempre hay
// que elegir algo a propósito, nunca queda "sin prefijo" sin querer.
export const PREFIJOS_TELEFONO: PrefijoTelefono[] = [
  { codigo: '54', nombre: 'Argentina', bandera: '🇦🇷' },
  { codigo: '598', nombre: 'Uruguay', bandera: '🇺🇾' },
  { codigo: '595', nombre: 'Paraguay', bandera: '🇵🇾' },
  { codigo: '56', nombre: 'Chile', bandera: '🇨🇱' },
  { codigo: '591', nombre: 'Bolivia', bandera: '🇧🇴' },
  { codigo: '55', nombre: 'Brasil', bandera: '🇧🇷' },
  { codigo: '51', nombre: 'Perú', bandera: '🇵🇪' },
  { codigo: '57', nombre: 'Colombia', bandera: '🇨🇴' },
  { codigo: '593', nombre: 'Ecuador', bandera: '🇪🇨' },
  { codigo: '58', nombre: 'Venezuela', bandera: '🇻🇪' },
  { codigo: '52', nombre: 'México', bandera: '🇲🇽' },
  { codigo: '507', nombre: 'Panamá', bandera: '🇵🇦' },
  { codigo: '506', nombre: 'Costa Rica', bandera: '🇨🇷' },
  { codigo: '502', nombre: 'Guatemala', bandera: '🇬🇹' },
  { codigo: '504', nombre: 'Honduras', bandera: '🇭🇳' },
  { codigo: '503', nombre: 'El Salvador', bandera: '🇸🇻' },
  { codigo: '505', nombre: 'Nicaragua', bandera: '🇳🇮' },
  { codigo: '1', nombre: 'Estados Unidos / Canadá', bandera: '🇺🇸' },
  { codigo: '1-do', nombre: 'República Dominicana', bandera: '🇩🇴' },
  { codigo: '53', nombre: 'Cuba', bandera: '🇨🇺' },
  { codigo: '34', nombre: 'España', bandera: '🇪🇸' },
  { codigo: '39', nombre: 'Italia', bandera: '🇮🇹' },
  { codigo: '33', nombre: 'Francia', bandera: '🇫🇷' },
  { codigo: '49', nombre: 'Alemania', bandera: '🇩🇪' },
  { codigo: '44', nombre: 'Reino Unido', bandera: '🇬🇧' },
  { codigo: '351', nombre: 'Portugal', bandera: '🇵🇹' },
  { codigo: 'otro', nombre: 'Otro país (escribir el número completo)', bandera: '🌐' },
]

// "1-do" (Rep. Dominicana comparte +1 con EEUU/Canadá) y "otro" (número ya
// completo, sin prefijo separado) no son dígitos de verdad -- son valores de
// <select> que necesitan una traducción antes de combinarse con el número.
function prefijoReal(codigoSelect: string): string {
  if (codigoSelect === 'otro') return ''
  if (codigoSelect === '1-do') return '1'
  return codigoSelect
}

const SEPARADOR = '|'

// Se guarda como "<prefijo><SEPARADOR><número>" en la misma columna de texto
// que ya existía (profiles.telefono / reservas.telefono) -- separar prefijo
// y número en columnas propias requeriría una migración de esquema que hoy
// no se puede aplicar (sin acceso al proyecto de Supabase desde acá, ver
// Notas_Decisiones_SIMA.txt). Guardar los dos valores en el mismo campo de
// texto, pero SEPARADOS, ya resuelve el problema real: al reabrir el
// formulario, el país elegido y el número quedan precargados tal cual se
// guardaron, sin volver a pegarse ni pisarse.
export function codificarTelefono(codigoSelect: string, numeroLocal: string): string | null {
  const soloDigitosLocal = numeroLocal.trim().replace(/\D/g, '')
  if (!soloDigitosLocal) return null
  // "otro" también se guarda CON separador (aunque no tenga dígitos de
  // prefijo reales) -- si no, al reabrir el formulario sería indistinguible
  // de un valor viejo (sin separador) y el select caería en Argentina en vez
  // de en "Otro país", con el número ya completo tratado como si fuera solo
  // el número local.
  if (codigoSelect === 'otro') return `otro${SEPARADOR}${soloDigitosLocal}`
  const prefijo = prefijoReal(codigoSelect).replace(/\D/g, '')
  return prefijo ? `${prefijo}${SEPARADOR}${soloDigitosLocal}` : soloDigitosLocal
}

export interface TelefonoDecodificado {
  // Vacío ("") si el valor guardado es de antes de este cambio (un solo
  // bloque de dígitos, sin separador) -- no hay forma de saber a partir de
  // ahí dónde termina el prefijo, así que el número completo queda en
  // numeroLocal y el select del formulario cae en su opción por defecto.
  codigoSelect: string
  numeroLocal: string
}

export function decodificarTelefono(valorGuardado: string | null): TelefonoDecodificado {
  if (!valorGuardado) return { codigoSelect: '', numeroLocal: '' }
  const indiceSeparador = valorGuardado.indexOf(SEPARADOR)
  if (indiceSeparador === -1) return { codigoSelect: '', numeroLocal: valorGuardado }
  const prefijo = valorGuardado.slice(0, indiceSeparador)
  const numeroLocal = valorGuardado.slice(indiceSeparador + 1)
  const codigoSelect = prefijo === '1' ? '1' : prefijo
  return { codigoSelect, numeroLocal }
}

// El link de wa.me necesita el número completo pegado, sin separador -- ver
// armarLinkWhatsApp en lib/cobranza/plantillas-whatsapp.ts. Con un valor
// viejo (sin separador, sin prefijo detectable) devuelve el número tal cual
// estaba, mismo comportamiento que antes de este cambio.
export function telefonoParaWhatsApp(valorGuardado: string | null): string | null {
  const { codigoSelect, numeroLocal } = decodificarTelefono(valorGuardado)
  if (!numeroLocal) return null
  const prefijo = codigoSelect === 'otro' ? '' : codigoSelect === '1-do' ? '1' : codigoSelect
  return `${prefijo}${numeroLocal}`
}

// Ningún país real tiene un número de abonado de menos de 6 dígitos ni de
// más de 12 (sin contar el código de país) -- y el E.164 completo (prefijo +
// número) nunca supera 15 dígitos en total. Es un rango generoso a
// propósito: mejor dejar pasar algún caso raro que trabar la carga de un
// número real por una regla demasiado estricta.
const LONGITUD_MIN_NUMERO_LOCAL = 6
const LONGITUD_MAX_NUMERO_LOCAL = 12
const LONGITUD_MAX_TOTAL = 15

export function errorLongitudTelefono(codigoSelect: string, numeroLocal: string): string | null {
  const soloDigitosLocal = numeroLocal.trim().replace(/\D/g, '')
  if (!soloDigitosLocal) return null

  if (soloDigitosLocal.length < LONGITUD_MIN_NUMERO_LOCAL) {
    return 'El número de teléfono es demasiado corto'
  }
  if (soloDigitosLocal.length > LONGITUD_MAX_NUMERO_LOCAL) {
    return 'El número de teléfono es demasiado largo'
  }

  const prefijo = prefijoReal(codigoSelect).replace(/\D/g, '')
  if (prefijo.length + soloDigitosLocal.length > LONGITUD_MAX_TOTAL) {
    return 'El teléfono completo (prefijo + número) es demasiado largo'
  }

  return null
}
