import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { FiltroEnVivo } from '@/components/FiltroEnVivo'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { EncabezadoPagina } from '@/components/EncabezadoPagina'
import { Paginador } from '@/components/Paginador'
import { leerPagina, estadoDePaginado } from '@/lib/ui/paginacion'
import {
  ENTRADA,
  BOTON_SECUNDARIO,
  ENLACE,
  ENLACE_TABLA,
  TABLA_CONTENEDOR,
  TABLA_HEADER_FILA,
  TABLA_HEADER_CELDA,
  TABLA_FILA,
  TABLA_CELDA,
} from '@/lib/ui/clases'

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pagina?: string }>
}) {
  await requireAdministrador()

  const { q: filtroTexto, pagina: paginaParam } = await searchParams

  const supabase = await createClient()

  // Clientes crece para siempre: cada persona que compra un lote queda acá
  // aunque haya terminado de pagar hace años. Por eso se pagina (10/09) --
  // no por lo que hay hoy, sino porque no tiene techo.
  function consultaDeClientes(columnas: string, contar = false) {
    let query = contar
      ? supabase.from('profiles').select(columnas, { count: 'exact', head: true })
      : supabase.from('profiles').select(columnas)

    query = query.eq('role', 'cliente')

    if (filtroTexto) {
      // .or() arma un filtro PostgREST crudo -- ",()" tienen significado
      // especial ahí (separan condiciones), así que se sacan del texto
      // buscado antes de interpolarlo para no romper ni alterar el filtro.
      const textoSaneado = filtroTexto.replace(/[,()]/g, '')
      query = query.or(`full_name.ilike.%${textoSaneado}%,email.ilike.%${textoSaneado}%`)
    }

    return query
  }

  const { count } = await consultaDeClientes('id', true)
  const paginado = estadoDePaginado(leerPagina(paginaParam).numero, count ?? 0)

  const { data: clientesCrudos } = await consultaDeClientes('id, full_name, email')
    .order('full_name')
    .range(paginado.desde, paginado.hasta)

  const clientes = (clientesCrudos ?? []) as unknown as {
    id: string
    full_name: string
    email: string | null
  }[]

  const clienteIds = clientes.map((cliente) => cliente.id)

  const { data: lotes } =
    clienteIds.length > 0
      ? await supabase.from('lotes').select('cliente_id').in('cliente_id', clienteIds)
      : { data: [] }

  const cantidadLotesPorCliente = new Map<string, number>()
  for (const lote of lotes ?? []) {
    const actual = cantidadLotesPorCliente.get(lote.cliente_id as string) ?? 0
    cantidadLotesPorCliente.set(lote.cliente_id as string, actual + 1)
  }

  return (
    <main>
      <EncabezadoPagina titulo="Clientes" migas={['Clientes']} />

      <FiltroEnVivo className="mb-4 flex items-end gap-3">
        <label className="text-sm text-slate-600">
          Buscar
          <input
            type="text"
            name="q"
            placeholder="Nombre o email"
            defaultValue={filtroTexto ?? ''}
            className={ENTRADA}
          />
        </label>
        <button type="submit" className={`cursor-pointer ${BOTON_SECUNDARIO}`}>
          Filtrar
        </button>
        {filtroTexto && (
          <EnlaceBoton href="/admin/clientes" className={`text-sm ${ENLACE}`}>
            Limpiar
          </EnlaceBoton>
        )}
      </FiltroEnVivo>

      {clientes.length === 0 ? (
        <p className="text-sm text-slate-600">
          {filtroTexto ? 'Ningún cliente coincide con la búsqueda.' : 'Todavía no hay ningún cliente cargado.'}
        </p>
      ) : (
        <div className={TABLA_CONTENEDOR}>
        <table className="w-full text-sm">
          <thead>
            <tr className={TABLA_HEADER_FILA}>
              <th className={TABLA_HEADER_CELDA}>Nombre</th>
              <th className={TABLA_HEADER_CELDA}>Email</th>
              <th className={TABLA_HEADER_CELDA}>Cantidad de lotes</th>
              <th className={TABLA_HEADER_CELDA}></th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((cliente) => (
              <tr key={cliente.id} className={TABLA_FILA}>
                <td className={TABLA_CELDA}>{cliente.full_name}</td>
                <td className={TABLA_CELDA}>{cliente.email ?? '—'}</td>
                <td className={TABLA_CELDA}>{cantidadLotesPorCliente.get(cliente.id) ?? 0}</td>
                <td className={TABLA_CELDA}>
                  <EnlaceBoton href={`/admin/clientes/${cliente.id}`} className={ENLACE_TABLA}>
                    Ver detalle
                  </EnlaceBoton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Paginador
          ruta="/admin/clientes"
          searchParams={{ q: filtroTexto }}
          pagina={paginado.pagina}
          total={count ?? 0}
          queSonLasFilas="clientes"
        />
        </div>
      )}
    </main>
  )
}
