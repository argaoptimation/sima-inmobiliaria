import { numeroALetras, montoALetras } from './numero-a-letras'

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

const NOMBRE_MONEDA: Record<'USD' | 'ARS', string> = {
  USD: 'dólares estadounidenses',
  ARS: 'pesos argentinos',
}

export interface DatosParaContrato {
  fechaContrato: string // fecha ISO (yyyy-mm-dd) del día del contrato
  acreedorNombre: string | null
  acreedorDni: string | null
  acreedorDomicilio: string | null
  clienteNombre: string
  clienteDni: string | null
  clienteDomicilio: string | null
  clienteEmail: string | null
  loteIdentificador: string
  numeroLote: string | null
  manzana: string | null
  ubicacion: string | null
  superficieM2: number | null
  cuentaRentas: string | null
  nomenclaturaCatastral: string | null
  matricula: string | null
  moneda: 'USD' | 'ARS'
  precioTotal: number | null
  montoSena: number | null
  cantidadCuotas: number
  montoCuota: number | null
  primeraCuotaFecha: string | null // fecha ISO de la cuota 1
  interesMoratorioDiario: number | null
}

function fechaEnPalabras(fechaIso: string): string {
  const [anio, mes, dia] = fechaIso.split('-').map(Number)
  const diaSinCero = String(dia)
  return `${diaSinCero} días del mes de ${MESES[mes - 1]} de ${anio}`
}

function mesYAnioEnPalabras(fechaIso: string): string {
  const [anio, mes] = fechaIso.split('-').map(Number)
  return `${MESES[mes - 1]} de ${anio}`
}

// "12" -> letras normales; "12 bis" u otro texto no puramente numérico no
// se puede deletrear -- se repite el mismo texto (Nico lo ajusta a mano en
// Word si hace falta la forma en letras para un caso así de particular).
function textoNumericoALetras(valor: string | null): string {
  if (!valor) return ''
  const numero = Number(valor)
  return Number.isFinite(numero) ? numeroALetras(numero) : valor
}

function numeroOVacio(valor: number | null): string {
  return valor === null || valor === undefined ? '' : String(valor)
}

// Lista de todos los placeholders que el sistema sabe completar -- se usa
// para avisar si una plantilla subida tiene un {placeholder} que no está
// acá (typo o nombre inventado), ver lib/contratos/extraer-placeholders.ts.
// Mantener sincronizada con las claves que devuelve armarDatosContrato.
export const PLACEHOLDERS_CONOCIDOS = [
  'fecha_contrato_texto',
  'acreedor_nombre',
  'acreedor_dni',
  'acreedor_domicilio',
  'cliente_nombre',
  'cliente_dni',
  'cliente_domicilio',
  'cliente_email',
  'lote_identificador',
  'lote_numero',
  'lote_numero_letras',
  'lote_manzana',
  'lote_manzana_letras',
  'lote_ubicacion',
  'lote_superficie_m2',
  'lote_superficie_m2_letras',
  'lote_cuenta_rentas',
  'lote_nomenclatura_catastral',
  'lote_matricula',
  'moneda_nombre',
  'moneda_abrev',
  'precio_total',
  'precio_total_letras',
  'sena_monto',
  'sena_monto_letras',
  'cantidad_cuotas',
  'cantidad_cuotas_letras',
  'monto_cuota',
  'monto_cuota_letras',
  'primera_cuota_mes_texto',
  'interes_moratorio_diario',
  'interes_moratorio_diario_letras',
]

// Placeholders disponibles para las plantillas de contrato (sintaxis
// docxtemplater, `{nombre_del_campo}` dentro del .docx) -- esta función ES
// la referencia de qué placeholders existen y de dónde sale cada uno.
export function armarDatosContrato(datos: DatosParaContrato): Record<string, string> {
  return {
    fecha_contrato_texto: fechaEnPalabras(datos.fechaContrato),

    acreedor_nombre: datos.acreedorNombre ?? '',
    acreedor_dni: datos.acreedorDni ?? '',
    acreedor_domicilio: datos.acreedorDomicilio ?? '',

    cliente_nombre: datos.clienteNombre,
    cliente_dni: datos.clienteDni ?? '',
    cliente_domicilio: datos.clienteDomicilio ?? '',
    cliente_email: datos.clienteEmail ?? '',

    lote_identificador: datos.loteIdentificador,
    lote_numero: datos.numeroLote ?? '',
    lote_numero_letras: textoNumericoALetras(datos.numeroLote),
    lote_manzana: datos.manzana ?? '',
    lote_manzana_letras: textoNumericoALetras(datos.manzana),
    lote_ubicacion: datos.ubicacion ?? '',
    lote_superficie_m2: numeroOVacio(datos.superficieM2),
    lote_superficie_m2_letras: datos.superficieM2 !== null ? numeroALetras(datos.superficieM2) : '',
    lote_cuenta_rentas: datos.cuentaRentas ?? '',
    lote_nomenclatura_catastral: datos.nomenclaturaCatastral ?? '',
    lote_matricula: datos.matricula ?? '',

    moneda_nombre: NOMBRE_MONEDA[datos.moneda],
    moneda_abrev: datos.moneda.toLowerCase(),

    precio_total: numeroOVacio(datos.precioTotal),
    precio_total_letras: datos.precioTotal !== null ? montoALetras(datos.precioTotal, datos.moneda) : '',

    sena_monto: numeroOVacio(datos.montoSena),
    sena_monto_letras: datos.montoSena !== null ? montoALetras(datos.montoSena, datos.moneda) : '',

    cantidad_cuotas: String(datos.cantidadCuotas),
    cantidad_cuotas_letras: numeroALetras(datos.cantidadCuotas),

    monto_cuota: numeroOVacio(datos.montoCuota),
    monto_cuota_letras: datos.montoCuota !== null ? montoALetras(datos.montoCuota, datos.moneda) : '',

    primera_cuota_mes_texto: datos.primeraCuotaFecha ? mesYAnioEnPalabras(datos.primeraCuotaFecha) : '',

    interes_moratorio_diario: numeroOVacio(datos.interesMoratorioDiario),
    interes_moratorio_diario_letras:
      datos.interesMoratorioDiario !== null ? numeroALetras(datos.interesMoratorioDiario) : '',
  }
}
