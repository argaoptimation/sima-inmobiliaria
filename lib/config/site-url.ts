// URL pública del sitio en producción, para armar el `redirectTo` de los
// links de invitación / recuperar contraseña que manda Supabase Auth por
// mail (bug real reportado 01/09: sin esto, esas llamadas dependían en
// silencio del "Site URL" configurado en el dashboard de Supabase -- que
// seguía en localhost:3000 desde que se armó el proyecto, así que el link
// del mail mandaba a producción... a localhost). Pasar `redirectTo`
// explícito acá saca esa dependencia implícita, pero Supabase igual exige
// que la URL esté en la lista blanca de "Redirect URLs" del dashboard
// (Authentication → URL Configuration) o cae al Site URL de todos modos --
// ese paso lo tiene que hacer Gabriel a mano, no hay token de Management
// API funcionando para tocarlo desde acá (ver
// feedback_verificar_proyecto_supabase en la memoria).
//
// Sin NEXT_PUBLIC_SITE_URL seteada (ej. corriendo local), cae a
// localhost:3000 -- mismo comportamiento de siempre en desarrollo.
export function obtenerSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
}
