const MENSAJE_ERROR = 'La contraseña tiene que tener al menos 8 caracteres, incluyendo un signo (ej. ! ? . # -)'

export function esContrasenaValida(contrasena: string): boolean {
  return contrasena.length >= 8 && /[^A-Za-z0-9]/.test(contrasena)
}

export function mensajeContrasenaInvalida(): string {
  return MENSAJE_ERROR
}
