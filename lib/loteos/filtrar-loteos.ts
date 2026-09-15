// Buscador de loteos por nombre (15/09, mockup 5 — Gabriel dijo que sí).
//
// Se filtra en memoria y no en la consulta: los loteos son pocos (uno por
// desarrollo) y la pantalla necesita la lista completa igual, para el
// desplegable de "Loteo actual" y el de "Mover los seleccionados a".

// Sin acentos ni mayúsculas: buscar "san jose" tiene que encontrar
// "San José".
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function filtrarLoteosPorNombre<T extends { nombre: string }>(loteos: T[], texto: string | undefined): T[] {
  const buscado = normalizar(texto ?? '')
  if (buscado === '') return loteos
  return loteos.filter((loteo) => normalizar(loteo.nombre).includes(buscado))
}
