import { describe, it, expect } from 'vitest'
import PizZip from 'pizzip'
import { generarContrato, ErrorPlantillaContrato } from './generar-contrato'

// Arma un .docx mínimo válido a mano (mismo mecanismo que
// lib/contratos/armar-datos-contrato.ts usa en runtime) para no depender de
// ningún archivo externo al repo.
function plantillaDocx(textoDocumento: string): Buffer {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body><w:p><w:r><w:t xml:space="preserve">${textoDocumento}</w:t></w:r></w:p></w:body>
</w:document>`
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

  const zip = new PizZip()
  zip.file('[Content_Types].xml', contentTypesXml)
  zip.file('_rels/.rels', rootRelsXml)
  zip.file('word/document.xml', documentXml)
  return zip.generate({ type: 'nodebuffer' })
}

function textoDe(buffer: Buffer): string {
  const zip = new PizZip(buffer)
  return zip
    .file('word/document.xml')!
    .asText()
    .replace(/<[^>]+>/g, '')
    .trim()
}

describe('generarContrato', () => {
  it('reemplaza los placeholders por los datos reales', () => {
    const plantilla = plantillaDocx('Hola {cliente_nombre}, tu lote es {lote_identificador}.')
    const resultado = generarContrato(plantilla, {
      cliente_nombre: 'Juan Pérez',
      lote_identificador: 'Lote 3',
    })
    expect(textoDe(resultado)).toBe('Hola Juan Pérez, tu lote es Lote 3.')
  })

  it('deja vacío un placeholder sin dato en vez de romper la generación', () => {
    const plantilla = plantillaDocx('Matrícula: {lote_matricula}.')
    const resultado = generarContrato(plantilla, {})
    expect(textoDe(resultado)).toBe('Matrícula: .')
  })

  it('rechaza un buffer que no es un .docx válido', () => {
    const buffer = Buffer.from('esto no es un zip')
    expect(() => generarContrato(buffer, {})).toThrow(ErrorPlantillaContrato)
  })

  it('rechaza una plantilla con un placeholder mal formado', () => {
    const plantilla = plantillaDocx('Hola {cliente_nombre sin cerrar')
    expect(() => generarContrato(plantilla, { cliente_nombre: 'Juan' })).toThrow(
      ErrorPlantillaContrato
    )
  })
})
