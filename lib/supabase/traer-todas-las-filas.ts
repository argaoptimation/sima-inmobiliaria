// PostgREST devuelve como mucho 1000 filas por consulta y NO avisa cuando
// corta (11/09: `max_rows = 1000`, leido de la configuracion real del
// proyecto). La respuesta llega sin error, con 1000 filas, y parece
// completa.
//
// Con los 18 lotes DEMO no se nota nunca. Con la cartera real de Nico --
// cientos de lotes, miles de cuotas, un movimiento por cada parte de cada
// cobro -- una consulta sin limite trae solo una parte, y lo que se calcula
// encima (cuanto hay que girarle a cada acreedor, de cuantas cuotas es el
// plan, que entro en la caja del dia) sale mal sin ningun error a la vista.
//
// Esto pide de a paginas hasta que una viene incompleta. Dos condiciones
// para que funcione:
//
//   1. La consulta tiene que venir ORDENADA POR ALGO UNICO (el id, aunque
//      sea como ultimo criterio). Sin un orden estable, Postgres puede
//      devolver las filas en otro orden en cada pagina, y en el borde entre
//      dos paginas una fila se repite y otra se pierde.
//   2. FILAS_POR_PAGINA no puede ser mayor que el `max_rows` del proyecto:
//      si alguien lo bajara a 500, una pagina de 500 pareceria la ultima.

export const FILAS_POR_PAGINA = 1000

// `.in()` viaja en la URL, y con cientos de ids se pasa del largo que acepta
// el servidor (unos 8 KB): la consulta entera falla. 150 ids son ~5,5 KB.
export const IDS_POR_TANDA = 150

type Pagina = PromiseLike<{ data: unknown; error: { message: string } | null }>

export async function traerTodasLasFilas<Fila>(
  pedirPagina: (desde: number, hasta: number) => Pagina
): Promise<Fila[]> {
  const filas: Fila[] = []

  for (let desde = 0; ; desde += FILAS_POR_PAGINA) {
    const { data, error } = await pedirPagina(desde, desde + FILAS_POR_PAGINA - 1)
    // Se corta con un error y no con lo que haya llegado hasta aca: una
    // lista a medias es justo lo que este archivo existe para evitar.
    if (error) throw new Error(`No se pudo leer la base: ${error.message}`)

    const pagina = (data ?? []) as Fila[]
    filas.push(...pagina)
    if (pagina.length < FILAS_POR_PAGINA) return filas
  }
}

// Lo mismo, para una consulta filtrada por una lista de ids que puede ser
// larga: se parte en tandas y cada tanda se pagina.
export async function traerTodasLasFilasPorTandas<Fila>(
  ids: string[],
  pedirPagina: (tanda: string[], desde: number, hasta: number) => Pagina
): Promise<Fila[]> {
  const unicos = [...new Set(ids)]
  const filas: Fila[] = []

  for (let inicio = 0; inicio < unicos.length; inicio += IDS_POR_TANDA) {
    const tanda = unicos.slice(inicio, inicio + IDS_POR_TANDA)
    filas.push(
      ...(await traerTodasLasFilas<Fila>((desde, hasta) => pedirPagina(tanda, desde, hasta)))
    )
  }

  return filas
}
