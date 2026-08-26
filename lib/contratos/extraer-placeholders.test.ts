import { describe, it, expect } from 'vitest'
import PizZip from 'pizzip'
import { extraerPlaceholders } from './extraer-placeholders'

function docxConTexto(texto: string): Buffer {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body><w:p><w:r><w:t xml:space="preserve">${texto}</w:t></w:r></w:p></w:body>
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

describe('extraerPlaceholders', () => {
  it('encuentra todos los placeholders sin duplicados', () => {
    const buffer = docxConTexto('Hola {cliente_nombre}, tu lote {lote_identificador} y de nuevo {cliente_nombre}.')
    expect(extraerPlaceholders(buffer)).toEqual(['cliente_nombre', 'lote_identificador'])
  })

  it('devuelve una lista vacía si no hay placeholders', () => {
    const buffer = docxConTexto('Texto sin ninguna llave.')
    expect(extraerPlaceholders(buffer)).toEqual([])
  })

  it('devuelve una lista vacía si el archivo no es un .docx válido', () => {
    expect(extraerPlaceholders(Buffer.from('esto no es un zip'))).toEqual([])
  })
})
