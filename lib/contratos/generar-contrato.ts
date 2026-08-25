import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'

export class ErrorPlantillaContrato extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorPlantillaContrato'
  }
}

// Toma el .docx de la plantilla del loteo (con placeholders tipo
// {cliente_nombre}) y devuelve un .docx nuevo con los datos reales
// reemplazados, preservando el formato/estilo del original -- mismo
// mecanismo confirmado viable en el punto 46 de Notas_Decisiones_SIMA.txt.
export function generarContrato(
  plantillaBuffer: Buffer,
  datos: Record<string, string>
): Buffer {
  let zip: PizZip
  try {
    zip = new PizZip(plantillaBuffer)
  } catch {
    throw new ErrorPlantillaContrato('El archivo de la plantilla no es un .docx válido.')
  }

  let doc: Docxtemplater
  try {
    doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      // Un placeholder que no tiene dato -- ej. un campo legal que Nico
      // todavía no cargó para ese lote (matrícula, nomenclatura catastral)
      // -- se deja vacío en vez de romper toda la generación.
      nullGetter: () => '',
    })
    doc.render(datos)
  } catch (error) {
    const detalle = extraerDetalleError(error)
    throw new ErrorPlantillaContrato(
      `La plantilla tiene un problema de formato que impide generar el contrato: ${detalle}`
    )
  }

  return doc.getZip().generate({ type: 'nodebuffer' })
}

interface ErrorDocxtemplater {
  properties?: {
    id?: string
    explanation?: string
    errors?: Array<{ properties?: { explanation?: string } }>
  }
}

function extraerDetalleError(error: unknown): string {
  const err = error as ErrorDocxtemplater
  const errores = err?.properties?.errors
  if (errores && errores.length > 0) {
    return errores
      .map((e) => e.properties?.explanation)
      .filter(Boolean)
      .join('; ')
  }
  return err?.properties?.explanation ?? 'error desconocido'
}
