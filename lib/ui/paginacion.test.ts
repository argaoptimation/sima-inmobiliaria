import { describe, it, expect } from 'vitest'
import { leerPagina, estadoDePaginado, urlDePagina, TAMANIO_PAGINA } from './paginacion'

describe('leerPagina', () => {
  it('sin parámetro arranca en la primera', () => {
    expect(leerPagina(undefined)).toEqual({ numero: 1, desde: 0, hasta: TAMANIO_PAGINA - 1 })
  })

  it('la página 3 pide el rango que le toca', () => {
    expect(leerPagina('3')).toEqual({ numero: 3, desde: 100, hasta: 149 })
  })

  it.each(['0', '-4', 'hola', '2.5', '', '99999999999'])(
    'un ?pagina=%s roto cae a la primera en vez de romper la pantalla',
    (valor) => {
      expect(leerPagina(valor).numero).toBe(1)
    }
  )
})

describe('estadoDePaginado', () => {
  it('cuenta las filas que se están viendo, 1-based e inclusivo', () => {
    const estado = estadoDePaginado(2, 322)

    expect(estado.primeraFila).toBe(51)
    expect(estado.ultimaFila).toBe(100)
    expect(estado.totalPaginas).toBe(7)
    expect(estado.hayAnterior).toBe(true)
    expect(estado.haySiguiente).toBe(true)
  })

  it('la última página no miente sobre cuántas filas tiene', () => {
    const estado = estadoDePaginado(7, 322)

    expect(estado.primeraFila).toBe(301)
    expect(estado.ultimaFila).toBe(322)
    expect(estado.haySiguiente).toBe(false)
  })

  it('una lista vacía es la página 1 de 1, sin filas', () => {
    const estado = estadoDePaginado(1, 0)

    expect(estado).toMatchObject({
      pagina: 1,
      totalPaginas: 1,
      primeraFila: 0,
      ultimaFila: 0,
      hayAnterior: false,
      haySiguiente: false,
    })
  })

  it('pedir una página que ya no existe devuelve la última, no una pantalla vacía', () => {
    // Pasa de verdad: entrás a la página 5 y después filtrás, y la lista
    // filtrada tiene una sola página.
    const estado = estadoDePaginado(5, 30)

    expect(estado.pagina).toBe(1)
    expect(estado.ultimaFila).toBe(30)
  })
})

describe('urlDePagina', () => {
  it('conserva los filtros puestos', () => {
    const url = urlDePagina('/admin/pagos', { q: 'Perez', estado: 'pendiente' }, 3)

    expect(url).toBe('/admin/pagos?q=Perez&estado=pendiente&pagina=3')
  })

  it('la primera página no lleva ?pagina: es la misma URL con la que se entra desde el menú', () => {
    expect(urlDePagina('/admin/pagos', { q: 'Perez' }, 1)).toBe('/admin/pagos?q=Perez')
    expect(urlDePagina('/admin/pagos', {}, 1)).toBe('/admin/pagos')
  })

  it('los filtros vacíos no ensucian la dirección', () => {
    expect(urlDePagina('/admin/pagos', { q: '', estado: undefined, motivo: '  ' }, 2)).toBe(
      '/admin/pagos?pagina=2'
    )
  })

  it('descarta la página que venía en los filtros en vez de duplicarla', () => {
    expect(urlDePagina('/admin/pagos', { pagina: '7', q: 'x' }, 2)).toBe('/admin/pagos?q=x&pagina=2')
  })
})
