// Conversión de números a letras en español, para los contratos (ej. "mide
// quinientos siete metros cuadrados (507 m2)" -- convención legal argentina
// de escribir el monto/cantidad en letras Y en números). Implementación
// propia (no una librería de npm) para no depender de un paquete externo
// para algo acotado y completamente testeable -- cubre 0 a 999.999.999,
// que alcanza de sobra para precios, cuotas, superficies y números de lote.

const UNIDADES = [
  '',
  'uno',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
]

const ESPECIALES_10_19 = [
  'diez',
  'once',
  'doce',
  'trece',
  'catorce',
  'quince',
  'dieciséis',
  'diecisiete',
  'dieciocho',
  'diecinueve',
]

const DECENAS = [
  '',
  '',
  'veinte',
  'treinta',
  'cuarenta',
  'cincuenta',
  'sesenta',
  'setenta',
  'ochenta',
  'noventa',
]

const CENTENAS = [
  '',
  'ciento',
  'doscientos',
  'trescientos',
  'cuatrocientos',
  'quinientos',
  'seiscientos',
  'setecientos',
  'ochocientos',
  'novecientos',
]

// 0-99, la parte más irregular del idioma (veintiuno pegado, resto con "y").
function menorQueCien(n: number): string {
  if (n < 10) return UNIDADES[n]
  if (n < 20) return ESPECIALES_10_19[n - 10]
  if (n < 30) {
    if (n === 20) return 'veinte'
    // veintidós, veintitrés y veintiséis llevan tilde escrita (la sílaba
    // tónica queda en una posición que rompe la regla general de acentuación
    // del español) -- el resto de "veinti-" no.
    const CON_TILDE: Record<number, string> = { 2: 'dós', 3: 'trés', 6: 'séis' }
    return 'veinti' + (CON_TILDE[n - 20] ?? UNIDADES[n - 20])
  }
  const decena = Math.floor(n / 10)
  const unidad = n % 10
  return unidad === 0 ? DECENAS[decena] : `${DECENAS[decena]} y ${UNIDADES[unidad]}`
}

function menorQueMil(n: number): string {
  if (n === 100) return 'cien'
  if (n < 100) return menorQueCien(n)
  const centena = Math.floor(n / 100)
  const resto = n % 100
  const textoCentena = CENTENAS[centena]
  return resto === 0 ? textoCentena : `${textoCentena} ${menorQueCien(resto)}`
}

export function numeroALetras(valor: number): string {
  const n = Math.trunc(Math.abs(valor))

  if (n === 0) return 'cero'
  if (n > 999_999_999) {
    throw new Error('numeroALetras no soporta números mayores a 999.999.999')
  }

  const millones = Math.floor(n / 1_000_000)
  const restoMillones = n % 1_000_000
  const miles = Math.floor(restoMillones / 1000)
  const centenas = restoMillones % 1000

  const partes: string[] = []

  if (millones > 0) {
    const textoMillones = menorQueMil(millones).replace(/uno$/, 'ún')
    partes.push(millones === 1 ? 'un millón' : `${textoMillones} millones`)
  }

  if (miles > 0) {
    partes.push(miles === 1 ? 'mil' : `${menorQueMil(miles)} mil`)
  }

  if (centenas > 0) {
    partes.push(menorQueMil(centenas))
  }

  const texto = partes.join(' ')
  return valor < 0 ? `menos ${texto}` : texto
}

const NOMBRE_MONEDA: Record<'USD' | 'ARS', { singular: string; plural: string }> = {
  USD: { singular: 'dólar estadounidense', plural: 'dólares estadounidenses' },
  ARS: { singular: 'peso argentino', plural: 'pesos argentinos' },
}

// "quinientos siete dólares estadounidenses" / "un dólar estadounidense" --
// separa centavos si el monto no es entero ("con 50/100").
export function montoALetras(monto: number, moneda: 'USD' | 'ARS'): string {
  const entero = Math.trunc(Math.abs(monto))
  const centavos = Math.round((Math.abs(monto) - entero) * 100)
  const nombre = NOMBRE_MONEDA[moneda]
  const nombreMoneda = entero === 1 && centavos === 0 ? nombre.singular : nombre.plural

  // Apócope: "uno", "veintiuno", "treinta y uno", etc. pierden la "o" final
  // antes de un sustantivo masculino ("un dólar", no "uno dólar") -- dólar
  // y peso son masculinos los dos, así que aplica siempre acá.
  const textoEntero = numeroALetras(entero).replace(/uno$/, 'un')

  const base = `${textoEntero} ${nombreMoneda}`
  if (centavos === 0) return base
  return `${base} con ${String(centavos).padStart(2, '0')}/100`
}
