// Paginación de los listados largos (10/09).
//
// El problema que resuelve: hoy cada listado le pide a la base TODAS las
// filas y se las manda al navegador de una. Con 18 lotes son 22 KB; con
// 322, 1,5 MB y 3,2 segundos. Y Pagos es peor todavía, porque no tiene
// techo: crece unas 200 filas por mes y no para nunca.
//
// Vive en lib y no adentro de cada página porque el número de página tiene
// que leerse igual en la pantalla y en el export: si cada uno lo parsea a
// su manera, un día el Excel exporta otra página que la que se está
// mirando.

// 30 filas (10/09, Gabriel: "50 es muchisimo igual y mas va a usar los
// filtros"). Tiene razón: el que entra a Pagos o a Lotes filtra primero y
// mira después, así que la primera página casi nunca se recorre entera.
// Menos de 30 empieza a molestar en el otro sentido -- con 15 hay que pasar
// de página para ver un mes de pagos, y pasar de página cuesta una recarga.
export const TAMANIO_PAGINA = 30

export interface Pagina {
  // 1-based, que es lo que ve el usuario en la URL.
  numero: number
  // Índices 0-based para `.range()` de Supabase, que es inclusivo en los dos
  // extremos.
  desde: number
  hasta: number
}

// Un `?pagina=` que venga roto (texto, 0, negativo, 1e9) no puede romper la
// pantalla: cae a la primera. Es un parámetro de URL, o sea que lo escribe
// cualquiera.
export function leerPagina(valor: string | undefined): Pagina {
  const numeroCrudo = Number(valor)
  const numero =
    Number.isInteger(numeroCrudo) && numeroCrudo >= 1 && numeroCrudo <= 1_000_000
      ? numeroCrudo
      : 1

  const desde = (numero - 1) * TAMANIO_PAGINA

  return { numero, desde, hasta: desde + TAMANIO_PAGINA - 1 }
}

export interface EstadoDePaginado {
  pagina: number
  totalPaginas: number
  // "Mostrando 51-100 de 322". Los dos números son 1-based e inclusivos.
  primeraFila: number
  ultimaFila: number
  total: number
  hayAnterior: boolean
  haySiguiente: boolean
  // El mismo rango 0-based que `leerPagina`, pero ya corregido si la página
  // pedida no existe. Se usa para el `.range()` de Supabase: así lo que se
  // trae de la base es siempre lo mismo que dice el pie de la tabla, en vez
  // de traer una página vacía y anunciar "página 3 de 3".
  desde: number
  hasta: number
}

export function estadoDePaginado(pagina: number, total: number): EstadoDePaginado {
  const totalPaginas = Math.max(1, Math.ceil(total / TAMANIO_PAGINA))

  // Si alguien pide la página 40 de una lista que tiene 3, se le muestra la
  // última en vez de una pantalla vacía: pasa solo con un link viejo o con
  // un filtro que achicó la lista después de haber navegado.
  const paginaReal = Math.min(pagina, totalPaginas)

  const desde = (paginaReal - 1) * TAMANIO_PAGINA
  const primeraFila = total === 0 ? 0 : desde + 1
  const ultimaFila = Math.min(paginaReal * TAMANIO_PAGINA, total)

  return {
    pagina: paginaReal,
    totalPaginas,
    primeraFila,
    ultimaFila,
    total,
    hayAnterior: paginaReal > 1,
    haySiguiente: paginaReal < totalPaginas,
    desde,
    hasta: desde + TAMANIO_PAGINA - 1,
  }
}

// La URL de otra página, conservando todos los filtros que ya están puestos.
// Se saca `pagina` cuando es la 1 para que la dirección de la primera
// página sea la misma con la que se entra desde el menú.
export function urlDePagina(
  ruta: string,
  searchParams: Record<string, string | undefined>,
  numero: number
): string {
  const params = new URLSearchParams()

  for (const [clave, valor] of Object.entries(searchParams)) {
    if (clave === 'pagina') continue
    if (typeof valor === 'string' && valor.trim() !== '') params.set(clave, valor)
  }

  if (numero > 1) params.set('pagina', String(numero))

  const query = params.toString()
  return query ? `${ruta}?${query}` : ruta
}
