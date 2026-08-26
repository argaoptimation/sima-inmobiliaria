import PizZip from 'pizzip'

// Lee un .docx y devuelve todos los {placeholder} que aparecen en su texto
// -- se usa al subir una plantilla para avisar si tiene alguno que el
// sistema no sabe completar (typo, o un campo que todavía no existe). Si el
// archivo no es un .docx válido devuelve una lista vacía en vez de tirar
// error -- ya hay validación de formato/tamaño aparte en la Server Action.
export function extraerPlaceholders(buffer: Buffer): string[] {
  let zip: PizZip
  try {
    zip = new PizZip(buffer)
  } catch {
    return []
  }

  const archivoDocumento = zip.file('word/document.xml')
  if (!archivoDocumento) return []

  const texto = archivoDocumento
    .asText()
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")

  const encontrados = texto.match(/\{[a-z_]+\}/g) ?? []
  return [...new Set(encontrados.map((token) => token.slice(1, -1)))]
}
