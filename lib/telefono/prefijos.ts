export interface PrefijoTelefono {
  codigo: string
  nombre: string
  bandera: string
}

// Cobertura: Latinoamérica completa + los países de origen más comunes para
// esta cartera de clientes. El primer valor ("") deja el campo del número
// tal cual lo tipee el admin, para casos que no estén en esta lista o para
// no tocar un teléfono ya cargado con el prefijo incluido.
export const PREFIJOS_TELEFONO: PrefijoTelefono[] = [
  { codigo: '', nombre: 'Sin prefijo (ingresar número completo)', bandera: '🌐' },
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
  { codigo: '1', nombre: 'República Dominicana', bandera: '🇩🇴' },
  { codigo: '53', nombre: 'Cuba', bandera: '🇨🇺' },
  { codigo: '34', nombre: 'España', bandera: '🇪🇸' },
  { codigo: '39', nombre: 'Italia', bandera: '🇮🇹' },
  { codigo: '33', nombre: 'Francia', bandera: '🇫🇷' },
  { codigo: '49', nombre: 'Alemania', bandera: '🇩🇪' },
  { codigo: '44', nombre: 'Reino Unido', bandera: '🇬🇧' },
  { codigo: '351', nombre: 'Portugal', bandera: '🇵🇹' },
]

// Combina prefijo + número local en el formato sin símbolos que necesita
// wa.me (ver lib/cobranza/plantillas-whatsapp.ts). Si no hay número local no
// hay teléfono; si no hay prefijo, se guarda el número local tal cual (ya
// puede traer el código de país incluido, p.ej. al no tocar un valor viejo).
export function combinarTelefono(prefijo: string, numeroLocal: string): string | null {
  const soloDigitosLocal = numeroLocal.trim().replace(/\D/g, '')
  if (!soloDigitosLocal) return null
  const soloDigitosPrefijo = prefijo.trim().replace(/\D/g, '')
  return `${soloDigitosPrefijo}${soloDigitosLocal}`
}
