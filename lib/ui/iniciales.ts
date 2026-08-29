// Iniciales para el avatar circular (sidebar admin, banner del portal
// cliente) -- primeras 2 palabras del nombre, cada una su primera letra en
// mayúscula. "?" si no hay nombre cargado (perfil sin full_name todavía).
export function inicialesDeNombre(nombre: string): string {
  const iniciales = nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join('')
  return iniciales || '?'
}
