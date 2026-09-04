export type SeleccionAcreedor =
  | { tipo: 'existente'; id: string }
  | { tipo: 'nuevo'; nombre: string; email: string }
  | { tipo: 'invalido'; error: string }

// Texto exacto de la opción "crear uno nuevo" en el buscador de acreedores.
// Vive acá (y no suelto en la página) porque el formulario lo muestra y el
// server action lo tiene que reconocer: si se cambia en un solo lado, deja
// de matchear.
export const OPCION_ACREEDOR_NUEVO = '+ Crear nuevo acreedor'

// El formulario manda el NOMBRE que se eligió en el datalist (ver
// components/BuscadorPersona.tsx), no un id: esta función lo resuelve
// contra la lista de acreedores que ya trajo la página.
export function validarSeleccionAcreedorPorNombre(datos: {
  nombreElegido: string
  acreedores: { id: string; full_name: string }[]
  nombreNuevo: string
  emailNuevo: string
}): SeleccionAcreedor {
  const nombreElegido = datos.nombreElegido.trim()

  if (!nombreElegido) {
    return { tipo: 'invalido', error: 'Elegí un acreedor de la lista o creá uno nuevo' }
  }

  if (nombreElegido === OPCION_ACREEDOR_NUEVO) {
    if (!datos.nombreNuevo || !datos.emailNuevo) {
      return {
        tipo: 'invalido',
        error: 'Completá el nombre y el email del acreedor nuevo',
      }
    }
    return { tipo: 'nuevo', nombre: datos.nombreNuevo, email: datos.emailNuevo }
  }

  const coincidencias = datos.acreedores.filter(
    (acreedor) => acreedor.full_name.trim().toLowerCase() === nombreElegido.toLowerCase()
  )

  if (coincidencias.length === 0) {
    return {
      tipo: 'invalido',
      error: `No hay ningún acreedor que se llame "${nombreElegido}". Elegí uno de la lista.`,
    }
  }

  // Dos acreedores con el mismo nombre: no se puede adivinar cuál. Es raro
  // pero posible, y elegir el primero en silencio sería asignarle el lote a
  // la persona equivocada.
  if (coincidencias.length > 1) {
    return {
      tipo: 'invalido',
      error: `Hay más de un acreedor llamado "${nombreElegido}". Renombrá a uno en Usuarios para poder distinguirlos.`,
    }
  }

  return { tipo: 'existente', id: coincidencias[0].id }
}
