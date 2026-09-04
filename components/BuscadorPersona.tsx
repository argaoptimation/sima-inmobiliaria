import { ENTRADA } from '@/lib/ui/clases'

// Buscador de persona por nombre: un <input> con <datalist> nativo.
// Reemplaza al <select> largo -- con un select, escribir "JO" salta a la
// primera opción que empieza con J y después con O; acá tipear "jo" deja a
// la vista todas las que contienen "jo" (04/09, pedido de Gabriel al crear
// un lote).
//
// A propósito NO es un client component y NO hay ningún <input hidden> con
// el id: lo que se manda es el NOMBRE tal cual, y el server action lo
// resuelve contra la base. El primer intento sí era un componente cliente
// que resolvía el id en un hidden con useState, y en la práctica el hidden
// llegaba vacío al servidor: ese subárbol quedaba sin hidratar (el resto de
// la página sí hidrataba, el botón de al lado incluido), así que el
// onChange nunca corría y el formulario se mandaba sin acreedor. Sin
// estado, el formulario no depende de que hidrate nada: funciona igual con
// el JS a medio cargar.
export function BuscadorPersona({
  personas,
  name,
  listId,
  placeholder = 'Buscar por nombre...',
  opcionesExtra = [],
  requerido = false,
  defaultValue = '',
}: {
  personas: { id: string; full_name: string }[]
  name: string
  listId: string
  placeholder?: string
  // Opciones que no son personas reales pero tienen que poder elegirse
  // igual (ej. "+ Crear nuevo acreedor", que el server action reconoce por
  // su texto exacto).
  opcionesExtra?: { etiqueta: string }[]
  requerido?: boolean
  defaultValue?: string
}) {
  const etiquetas = [...personas.map((persona) => persona.full_name), ...opcionesExtra.map((o) => o.etiqueta)]

  return (
    <>
      <input
        name={name}
        list={listId}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={requerido}
        autoComplete="off"
        className={`w-full ${ENTRADA}`}
      />
      <datalist id={listId}>
        {etiquetas.map((etiqueta) => (
          <option key={etiqueta} value={etiqueta} />
        ))}
      </datalist>
    </>
  )
}
