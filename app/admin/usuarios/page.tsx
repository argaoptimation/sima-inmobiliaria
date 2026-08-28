import { createClient } from '@/lib/supabase/server'
import { requireAdminOAcreedor } from '@/lib/auth/require-admin'
import {
  crearUsuarioStaff,
  actualizarNombreStaff,
  actualizarDatosTransferenciaStaff,
  eliminarUsuarioStaff,
} from './actions'
import { BotonEliminarUsuario } from './BotonEliminarUsuario'
import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'
import { FiltroEnVivo } from '@/components/FiltroEnVivo'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import {
  ENTRADA,
  BOTON_PRIMARIO,
  BOTON_SECUNDARIO,
  ENLACE,
  ENLACE_TABLA,
  TITULO_H1,
  TITULO_H2,
  BANNER_ERROR,
  TABLA_CONTENEDOR,
  TABLA_HEADER_FILA,
  TABLA_HEADER_CELDA,
  TABLA_FILA,
  TABLA_CELDA,
} from '@/lib/ui/clases'

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; editar?: string; q?: string }>
}) {
  const { error, editar, q: filtroTexto } = await searchParams

  // Mismo criterio que /admin/pagos: vendedor y cobrador tienen acceso
  // acotado a /admin (solo lotes disponibles + reservar + su propio perfil).
  // La nav ya no les muestra el link "Usuarios", pero la URL escrita a mano
  // tiene que rebotar igual, no renderizar la pantalla.
  await requireAdminOAcreedor()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: perfilPropio } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  if (perfilPropio!.role !== 'administrador') {
    const { data: misLotes } = await supabase
      .from('lotes')
      .select('vendedor_id')
      .eq('acreedor_id', user!.id)
      .not('vendedor_id', 'is', null)

    const vendedorIds = [...new Set((misLotes ?? []).map((lote) => lote.vendedor_id as string))]

    const { data: vendedores } =
      vendedorIds.length > 0
        ? await supabase
            .from('profiles')
            .select('id, full_name, alias, banco, cbu, titular')
            .in('id', vendedorIds)
            .order('full_name')
        : { data: [] }

    return (
      <main className="max-w-2xl">
        <h1 className={`mb-6 ${TITULO_H1}`}>Usuarios de staff</h1>
        {error && <p className={BANNER_ERROR}>{error}</p>}

        <h2 className={`mb-2 ${TITULO_H2}`}>Vendedores de tus lotes</h2>
        {(vendedores ?? []).length === 0 ? (
          <p className="text-sm text-slate-600">
            Todavía no tenés ningún vendedor asociado a tus lotes.
          </p>
        ) : (
          <div className={TABLA_CONTENEDOR}>
          <table className="w-full text-sm">
            <thead>
              <tr className={TABLA_HEADER_FILA}>
                <th className={TABLA_HEADER_CELDA}>Nombre</th>
                <th className={TABLA_HEADER_CELDA}>Datos de transferencia</th>
              </tr>
            </thead>
            <tbody>
              {vendedores!.map((persona) => (
                <tr key={persona.id} className={TABLA_FILA}>
                  <td className={TABLA_CELDA}>{persona.full_name}</td>
                  <td className={TABLA_CELDA}>
                    {tieneDatosTransferencia({
                      alias: persona.alias,
                      banco: persona.banco,
                      titular: persona.titular,
                    }) ? (
                      `${persona.titular} · ${persona.alias} · ${persona.banco}`
                    ) : (
                      <span className="text-amber-700">Sin datos de transferencia</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </main>
    )
  }

  let queryStaff = supabase
    .from('profiles')
    .select('id, full_name, role, email, alias, banco, cbu, titular, dni, domicilio')
    .in('role', ['administrador', 'acreedor', 'vendedor', 'cobrador'])
    .order('role')

  if (filtroTexto) {
    const textoSaneado = filtroTexto.replace(/[,()]/g, '')
    queryStaff = queryStaff.or(`full_name.ilike.%${textoSaneado}%,email.ilike.%${textoSaneado}%`)
  }

  const { data: staff } = await queryStaff

  return (
    <main className="max-w-2xl">
      <h1 className={`mb-6 ${TITULO_H1}`}>Usuarios de staff</h1>
      {error && <p className={BANNER_ERROR}>{error}</p>}

      <form action={crearUsuarioStaff} className="mb-8 flex flex-col gap-3">
        <input
          name="fullName"
          placeholder="Nombre completo"
          required
          className={ENTRADA}
        />
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className={ENTRADA}
        />
        <select name="role" required className={ENTRADA}>
          <option value="acreedor">Acreedor</option>
          <option value="vendedor">Vendedor</option>
          <option value="cobrador">Cobrador</option>
        </select>
        <BotonEnvio className={`cursor-pointer ${BOTON_PRIMARIO}`}>Invitar</BotonEnvio>
      </form>

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
          <EnlaceBoton href="/admin/usuarios" className={`text-sm ${ENLACE}`}>
            Limpiar
          </EnlaceBoton>
        )}
      </FiltroEnVivo>
      {(staff ?? []).length === 0 && filtroTexto ? (
        <p className="text-sm text-slate-600">Ningún usuario coincide con la búsqueda.</p>
      ) : (
      <div className={TABLA_CONTENEDOR}>
      <table className="w-full text-sm">
        <thead>
          <tr className={TABLA_HEADER_FILA}>
            <th className={TABLA_HEADER_CELDA}>Nombre</th>
            <th className={TABLA_HEADER_CELDA}>Rol</th>
            <th className={TABLA_HEADER_CELDA}>Email</th>
            <th className={TABLA_HEADER_CELDA}>Datos de transferencia</th>
            <th className={TABLA_HEADER_CELDA}></th>
          </tr>
        </thead>
        <tbody>
          {staff?.map((persona) => {
            const actualizarNombreConId = actualizarNombreStaff.bind(null, persona.id)
            const actualizarDatosConId = actualizarDatosTransferenciaStaff.bind(null, persona.id)
            const eliminarUsuarioConId = eliminarUsuarioStaff.bind(null, persona.id)
            const tieneDatos = tieneDatosTransferencia({
              alias: persona.alias,
              banco: persona.banco,
              titular: persona.titular,
            })

            if (editar === persona.id) {
              return (
                <tr key={persona.id} className={TABLA_FILA}>
                  <td colSpan={5} className={`${TABLA_CELDA} py-3`}>
                    <form action={actualizarNombreConId} className="mb-3 flex flex-wrap gap-2">
                      <input
                        name="fullName"
                        defaultValue={persona.full_name}
                        placeholder="Nombre completo"
                        required
                        className={`flex-1 ${ENTRADA}`}
                      />
                      <input
                        name="dni"
                        defaultValue={persona.dni ?? ''}
                        placeholder="DNI (opcional)"
                        className={ENTRADA}
                      />
                      <input
                        name="domicilio"
                        defaultValue={persona.domicilio ?? ''}
                        placeholder="Domicilio (opcional)"
                        className={ENTRADA}
                      />
                      <BotonEnvio className={`cursor-pointer ${BOTON_PRIMARIO}`}>
                        Guardar datos personales
                      </BotonEnvio>
                    </form>
                    <form action={actualizarDatosConId} className="flex flex-col gap-2">
                      <input
                        name="titular"
                        defaultValue={persona.titular ?? ''}
                        placeholder="Titular de la cuenta"
                        required
                        className={ENTRADA}
                      />
                      <input
                        name="alias"
                        defaultValue={persona.alias ?? ''}
                        placeholder="Alias"
                        required
                        className={ENTRADA}
                      />
                      <input
                        name="banco"
                        defaultValue={persona.banco ?? ''}
                        placeholder="Banco"
                        required
                        className={ENTRADA}
                      />
                      <input
                        name="cbu"
                        defaultValue={persona.cbu ?? ''}
                        placeholder="CBU (opcional)"
                        className={ENTRADA}
                      />
                      <BotonEnvio className={`cursor-pointer self-start ${BOTON_PRIMARIO}`}>
                        Guardar datos de transferencia
                      </BotonEnvio>
                    </form>
                  </td>
                </tr>
              )
            }

            return (
              <tr key={persona.id} className={TABLA_FILA}>
                <td className={TABLA_CELDA}>{persona.full_name}</td>
                <td className={TABLA_CELDA}>{persona.role}</td>
                <td className={TABLA_CELDA}>{persona.email ?? '—'}</td>
                <td className={TABLA_CELDA}>
                  {tieneDatos ? (
                    `${persona.titular} · ${persona.alias} · ${persona.banco}`
                  ) : (
                    <span className="text-amber-700">Sin datos de transferencia</span>
                  )}
                </td>
                <td className={TABLA_CELDA}>
                  <div className="flex items-center gap-3">
                    <EnlaceBoton href={`/admin/usuarios?editar=${persona.id}`} className={ENLACE_TABLA}>
                      Editar
                    </EnlaceBoton>
                    <EnlaceBoton href={`/admin/cuentas-corrientes/${persona.id}`} className={ENLACE_TABLA}>
                      Cuenta corriente
                    </EnlaceBoton>
                    {persona.id !== user!.id && (
                      <BotonEliminarUsuario eliminarUsuarioAction={eliminarUsuarioConId} />
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
      )}
    </main>
  )
}
