export type SeleccionAcreedor =
  | { tipo: 'existente'; id: string }
  | { tipo: 'nuevo'; nombre: string; email: string }
  | { tipo: 'invalido'; error: string }

export function validarSeleccionAcreedor(datos: {
  acreedorId: string
  nombreNuevo: string
  emailNuevo: string
}): SeleccionAcreedor {
  if (!datos.acreedorId) {
    return { tipo: 'invalido', error: 'Elegí un acreedor o creá uno nuevo' }
  }

  if (datos.acreedorId === '__nuevo__') {
    if (!datos.nombreNuevo || !datos.emailNuevo) {
      return {
        tipo: 'invalido',
        error: 'Completá el nombre y el email del acreedor nuevo',
      }
    }
    return { tipo: 'nuevo', nombre: datos.nombreNuevo, email: datos.emailNuevo }
  }

  return { tipo: 'existente', id: datos.acreedorId }
}
