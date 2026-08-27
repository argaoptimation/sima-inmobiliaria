export interface PrefijoTelefono {
  codigo: string
  nombre: string
  bandera: string
  // Código ISO 3166-1 alpha-2, para renderizar la bandera como SVG real
  // (components/PaisFlag.tsx) en vez del emoji -- en Windows, el emoji de
  // bandera se ve como dos letras sueltas ("AR") en vez del ícono, según el
  // motor de fuentes. `null` en "otro" (no representa un país puntual).
  iso: string | null
}

// Cobertura: Latinoamérica completa + los países de origen más comunes para
// esta cartera de clientes. Argentina primera porque es la inmensa mayoría
// de los casos. "Otro" queda último a propósito -- es la única forma de
// cargar un país no listado, pero no es la opción por defecto: siempre hay
// que elegir algo a propósito, nunca queda "sin prefijo" sin querer.
export const PREFIJOS_TELEFONO: PrefijoTelefono[] = [
  { codigo: '54', nombre: 'Argentina', bandera: '🇦🇷', iso: 'AR' },
  { codigo: '598', nombre: 'Uruguay', bandera: '🇺🇾', iso: 'UY' },
  { codigo: '595', nombre: 'Paraguay', bandera: '🇵🇾', iso: 'PY' },
  { codigo: '56', nombre: 'Chile', bandera: '🇨🇱', iso: 'CL' },
  { codigo: '591', nombre: 'Bolivia', bandera: '🇧🇴', iso: 'BO' },
  { codigo: '55', nombre: 'Brasil', bandera: '🇧🇷', iso: 'BR' },
  { codigo: '51', nombre: 'Perú', bandera: '🇵🇪', iso: 'PE' },
  { codigo: '57', nombre: 'Colombia', bandera: '🇨🇴', iso: 'CO' },
  { codigo: '593', nombre: 'Ecuador', bandera: '🇪🇨', iso: 'EC' },
  { codigo: '58', nombre: 'Venezuela', bandera: '🇻🇪', iso: 'VE' },
  { codigo: '52', nombre: 'México', bandera: '🇲🇽', iso: 'MX' },
  { codigo: '507', nombre: 'Panamá', bandera: '🇵🇦', iso: 'PA' },
  { codigo: '506', nombre: 'Costa Rica', bandera: '🇨🇷', iso: 'CR' },
  { codigo: '502', nombre: 'Guatemala', bandera: '🇬🇹', iso: 'GT' },
  { codigo: '504', nombre: 'Honduras', bandera: '🇭🇳', iso: 'HN' },
  { codigo: '503', nombre: 'El Salvador', bandera: '🇸🇻', iso: 'SV' },
  { codigo: '505', nombre: 'Nicaragua', bandera: '🇳🇮', iso: 'NI' },
  { codigo: '1', nombre: 'Estados Unidos / Canadá', bandera: '🇺🇸', iso: 'US' },
  { codigo: '1-do', nombre: 'República Dominicana', bandera: '🇩🇴', iso: 'DO' },
  { codigo: '53', nombre: 'Cuba', bandera: '🇨🇺', iso: 'CU' },
  { codigo: '34', nombre: 'España', bandera: '🇪🇸', iso: 'ES' },
  { codigo: '39', nombre: 'Italia', bandera: '🇮🇹', iso: 'IT' },
  { codigo: '33', nombre: 'Francia', bandera: '🇫🇷', iso: 'FR' },
  { codigo: '49', nombre: 'Alemania', bandera: '🇩🇪', iso: 'DE' },
  { codigo: '44', nombre: 'Reino Unido', bandera: '🇬🇧', iso: 'GB' },
  { codigo: '351', nombre: 'Portugal', bandera: '🇵🇹', iso: 'PT' },
  { codigo: 'otro', nombre: 'Otro país (escribir el número completo)', bandera: '🌐', iso: null },
]

// "1-do" (Rep. Dominicana comparte +1 con EEUU/Canadá) y "otro" (número ya
// completo, sin prefijo separado) no son dígitos de verdad -- son valores de
// <select> que necesitan una traducción antes de guardarse como el prefijo
// real (columna profiles.telefono_prefijo / reservas.telefono_prefijo).
function prefijoReal(codigoSelect: string): string {
  if (codigoSelect === 'otro') return ''
  if (codigoSelect === '1-do') return '1'
  return codigoSelect
}

export interface TelefonoParaGuardar {
  prefijo: string | null
  numero: string | null
}

// A partir de lo que el formulario mandó (select + número local), arma los
// dos valores que van directo a telefono_prefijo/telefono_numero.
export function telefonoParaGuardar(codigoSelect: string, numeroLocal: string): TelefonoParaGuardar {
  const soloDigitosLocal = numeroLocal.trim().replace(/\D/g, '')
  if (!soloDigitosLocal) return { prefijo: null, numero: null }
  const prefijo = prefijoReal(codigoSelect).replace(/\D/g, '') || null
  return { prefijo, numero: soloDigitosLocal }
}

// Qué opción del <select> mostrar seleccionada al reabrir un formulario. Un
// prefijo guardado en blanco (valores de antes de tener columnas separadas,
// donde no se pudo saber dónde terminaba el prefijo) cae en Argentina por
// default -- el país de la inmensa mayoría de los casos -- en vez de quedar
// sin nada elegido.
export function codigoSelectDesdeGuardado(prefijo: string | null): string {
  return prefijo || '54'
}

// El link de wa.me necesita el número completo pegado, sin separador -- ver
// armarLinkWhatsApp en lib/cobranza/plantillas-whatsapp.ts.
export function telefonoParaWhatsApp(prefijo: string | null, numero: string | null): string | null {
  if (!numero) return null
  return `${prefijo ?? ''}${numero}`
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
