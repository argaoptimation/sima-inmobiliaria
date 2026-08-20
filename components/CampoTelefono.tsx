import { PREFIJOS_TELEFONO, codigoSelectDesdeGuardado } from '@/lib/telefono/prefijos'

// Select de país + número local, reutilizado en los 3 lugares donde se
// carga un teléfono (ficha de cliente en admin, autoservicio del cliente,
// formulario de reserva). Nunca queda un país sin elegir "por defecto": si
// no hay prefijo guardado (valores de antes de tener columnas separadas), el
// select cae en Argentina -- el país de la inmensa mayoría de los casos --
// en vez de en un estado vacío, para no inducir a dejarlo sin revisar.
export function CampoTelefono({
  prefijoGuardado,
  numeroGuardado,
  nombrePrefijo = 'prefijo',
  nombreNumero = 'telefonoNumero',
  requerido = false,
}: {
  prefijoGuardado: string | null
  numeroGuardado: string | null
  nombrePrefijo?: string
  nombreNumero?: string
  requerido?: boolean
}) {
  return (
    <div className="mt-1 flex gap-2">
      <select
        name={nombrePrefijo}
        defaultValue={codigoSelectDesdeGuardado(prefijoGuardado)}
        className="rounded border px-2 py-2 text-sm"
        aria-label="Prefijo de país"
      >
        {PREFIJOS_TELEFONO.map((prefijo) => (
          <option key={prefijo.codigo} value={prefijo.codigo}>
            {prefijo.bandera} {prefijo.nombre}
            {prefijo.codigo !== 'otro' ? ` (+${prefijo.codigo.replace('-do', '')})` : ''}
          </option>
        ))}
      </select>
      <input
        name={nombreNumero}
        placeholder="9351234567"
        defaultValue={numeroGuardado ?? ''}
        required={requerido}
        inputMode="numeric"
        className="flex-1 rounded border px-3 py-2 placeholder:text-gray-400"
      />
    </div>
  )
}

export function AyudaTelefono() {
  return (
    <p className="mt-1 text-xs text-gray-500">
      Elegí el país y escribí el número con el{' '}
      <strong className="font-semibold text-gray-700">9 adelante si es celular</strong>, sin el 0
      del código de área.
    </p>
  )
}
