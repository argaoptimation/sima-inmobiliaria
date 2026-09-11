import { describe, it, expect } from 'vitest'
import {
  traerTodasLasFilas,
  traerTodasLasFilasPorTandas,
  FILAS_POR_PAGINA,
  IDS_POR_TANDA,
} from './traer-todas-las-filas'

// Una tabla falsa que se porta como PostgREST: devuelve el rango pedido,
// pero nunca mas de 1000 filas, y sin avisar que corto.
function tablaFalsa(cantidad: number) {
  const filas = Array.from({ length: cantidad }, (_, indice) => ({ id: indice }))
  const pedidos: [number, number][] = []

  async function pedirPagina(desde: number, hasta: number) {
    pedidos.push([desde, hasta])
    return {
      data: filas.slice(desde, Math.min(hasta + 1, desde + FILAS_POR_PAGINA)),
      error: null,
    }
  }

  return { pedirPagina, pedidos }
}

describe('traerTodasLasFilas', () => {
  it('trae las 2500 filas, y no las primeras 1000 como una consulta suelta', async () => {
    const { pedirPagina, pedidos } = tablaFalsa(2500)

    const filas = await traerTodasLasFilas<{ id: number }>(pedirPagina)

    expect(filas).toHaveLength(2500)
    expect(filas.at(-1)).toEqual({ id: 2499 })
    expect(pedidos).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
  })

  it('con menos de una pagina hace un solo pedido', async () => {
    const { pedirPagina, pedidos } = tablaFalsa(150)

    expect(await traerTodasLasFilas(pedirPagina)).toHaveLength(150)
    expect(pedidos).toHaveLength(1)
  })

  it('con justo 1000 filas pide una pagina mas: 1000 puede ser el corte, no el final', async () => {
    const { pedirPagina, pedidos } = tablaFalsa(1000)

    expect(await traerTodasLasFilas(pedirPagina)).toHaveLength(1000)
    expect(pedidos).toHaveLength(2)
  })

  it('si una pagina falla, falla todo en vez de devolver una lista a medias', async () => {
    let pedido = 0
    const pedirPagina = async () => {
      pedido += 1
      return pedido === 1
        ? { data: Array.from({ length: FILAS_POR_PAGINA }, () => ({})), error: null }
        : { data: null, error: { message: 'se corto la conexion' } }
    }

    await expect(traerTodasLasFilas(pedirPagina)).rejects.toThrow('se corto la conexion')
  })
})

describe('traerTodasLasFilasPorTandas', () => {
  it('parte los ids en tandas para que la URL no se pase de largo, sin repetir ids', async () => {
    const ids = Array.from({ length: 400 }, (_, indice) => `id-${indice}`)
    const tandas: string[][] = []

    const filas = await traerTodasLasFilasPorTandas<string>([...ids, 'id-0', 'id-1'], async (tanda) => {
      tandas.push(tanda)
      return { data: tanda, error: null }
    })

    expect(tandas.map((tanda) => tanda.length)).toEqual([IDS_POR_TANDA, IDS_POR_TANDA, 100])
    expect(filas).toEqual(ids)
  })

  it('sin ids no consulta nada', async () => {
    let consultas = 0
    const filas = await traerTodasLasFilasPorTandas([], async () => {
      consultas += 1
      return { data: [], error: null }
    })

    expect(filas).toEqual([])
    expect(consultas).toBe(0)
  })
})
