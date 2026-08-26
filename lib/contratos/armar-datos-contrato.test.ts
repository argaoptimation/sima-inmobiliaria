import { describe, it, expect } from 'vitest'
import { armarDatosContrato, PLACEHOLDERS_CONOCIDOS, type DatosParaContrato } from './armar-datos-contrato'

// Caso de referencia: los valores reales del modelo "BOLETO Quintana
// Prueba- modelo.docx" (ver Notas_Decisiones_SIMA.txt puntos 46 y 89),
// para verificar que el armado de datos reproduce ese mismo contrato.
const DATOS_QUINTANA: DatosParaContrato = {
  fechaContrato: '2026-04-22',
  acreedorNombre: 'Colman Fernando Javier',
  acreedorDni: '29.250.869',
  acreedorDomicilio: 'Av. Montes de Oca 729, octavo piso "A", Buenos Aires',
  clienteNombre: 'Noelia Baez',
  clienteDni: '30.111.222',
  clienteDomicilio: 'Calle Falsa 123, Córdoba',
  clienteEmail: 'noebaez138@gmail.com',
  loteIdentificador: 'Lote 12 - Manzana 5',
  numeroLote: '12',
  manzana: '5',
  ubicacion: 'José de La Quintana, Pedanía San Isidro, Departamento Santa María, Córdoba',
  superficieM2: 507,
  cuentaRentas: '123-456789',
  nomenclaturaCatastral: '12-34-56-78',
  matricula: '987654',
  moneda: 'USD',
  precioTotal: 37000,
  montoSena: 1000,
  cantidadCuotas: 36,
  montoCuota: 1000,
  primeraCuotaFecha: '2026-05-10',
  interesMoratorioDiario: 1,
}

describe('armarDatosContrato', () => {
  it('reproduce los valores reales del modelo Quintana', () => {
    const datos = armarDatosContrato(DATOS_QUINTANA)

    expect(datos.fecha_contrato_texto).toBe('22 días del mes de abril de 2026')
    expect(datos.acreedor_nombre).toBe('Colman Fernando Javier')
    expect(datos.acreedor_dni).toBe('29.250.869')
    expect(datos.lote_numero).toBe('12')
    expect(datos.lote_manzana).toBe('5')
    expect(datos.lote_superficie_m2).toBe('507')
    // Valor real de la plantilla: "quinientos siete metros cuadrados".
    expect(datos.lote_superficie_m2_letras).toBe('quinientos siete')
    expect(datos.moneda_nombre).toBe('dólares estadounidenses')
    expect(datos.moneda_abrev).toBe('usd')
    // Valor real de la plantilla: la seña "mil dólares estadounidenses".
    expect(datos.sena_monto).toBe('1000')
    expect(datos.sena_monto_letras).toBe('mil dólares estadounidenses')
    // Valor real de la plantilla: "treinta y seis (36) cuotas".
    expect(datos.cantidad_cuotas).toBe('36')
    expect(datos.cantidad_cuotas_letras).toBe('treinta y seis')
    expect(datos.primera_cuota_mes_texto).toBe('mayo de 2026')
    // Valor real de la plantilla: "interés moratorio diario del uno por
    // ciento (1%)".
    expect(datos.interes_moratorio_diario).toBe('1')
    expect(datos.interes_moratorio_diario_letras).toBe('uno')
  })

  it('deja vacíos los placeholders de campos legales que todavía no se cargaron', () => {
    const datos = armarDatosContrato({
      ...DATOS_QUINTANA,
      numeroLote: null,
      manzana: null,
      superficieM2: null,
      cuentaRentas: null,
      nomenclaturaCatastral: null,
      matricula: null,
      acreedorDni: null,
      acreedorDomicilio: null,
    })

    expect(datos.lote_numero).toBe('')
    expect(datos.lote_numero_letras).toBe('')
    expect(datos.lote_superficie_m2).toBe('')
    expect(datos.lote_superficie_m2_letras).toBe('')
    expect(datos.lote_cuenta_rentas).toBe('')
    expect(datos.acreedor_dni).toBe('')
  })

  it('un número de lote no puramente numérico (ej. "12 bis") no se deletrea, se repite tal cual', () => {
    const datos = armarDatosContrato({ ...DATOS_QUINTANA, numeroLote: '12 bis' })
    expect(datos.lote_numero).toBe('12 bis')
    expect(datos.lote_numero_letras).toBe('12 bis')
  })

  it('PLACEHOLDERS_CONOCIDOS está sincronizada con las claves reales', () => {
    const claves = Object.keys(armarDatosContrato(DATOS_QUINTANA)).sort()
    expect([...PLACEHOLDERS_CONOCIDOS].sort()).toEqual(claves)
  })
})
