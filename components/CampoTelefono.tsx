import { codigoSelectDesdeGuardado } from '@/lib/telefono/prefijos'
import { SelectorPrefijoTelefono } from './SelectorPrefijoTelefono'

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
      <SelectorPrefijoTelefono
        name={nombrePrefijo}
        defaultValue={codigoSelectDesdeGuardado(prefijoGuardado)}
      />
      <input
        name={nombreNumero}
        placeholder="9351234567"
        defaultValue={numeroGuardado ?? ''}
        required={requerido}
        inputMode="numeric"
        className="flex-1 rounded-lg border border-blue-100 px-3 py-2 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
      />
    </div>
  )
}

export function AyudaTelefono() {
  return (
    <p className="mt-1 text-xs text-slate-500">
      Elegí el país y escribí el número con el{' '}
      <strong className="font-semibold text-slate-700">9 adelante si es celular</strong>, sin el 0
      del código de área.
    </p>
  )
}
