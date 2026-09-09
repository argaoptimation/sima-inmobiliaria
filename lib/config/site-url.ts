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
// Dominio real de producción (08/09/2026). No es un secreto -- es la URL
// pública que se le manda al cliente por WhatsApp -- así que puede vivir en
// el repo, que es público.
//
// Está acá y no solo en una variable de entorno porque el mensaje de
// cobranza LLEVA este link adentro: si la variable se olvida de setear en
// Vercel, el fallback silencioso mandaba a los clientes a "localhost:3000",
// que para ellos es un link roto. Un default correcto en producción vale
// más que la pureza de no hardcodear nada.
const URL_PRODUCCION = 'https://simacor.vercel.app'

// NEXT_PUBLIC_SITE_URL sigue mandando si está seteada (para previews de
// Vercel o un dominio propio el día que lo haya). Sin ella: producción usa
// el dominio de arriba y desarrollo sigue en localhost:3000, como siempre.
export function obtenerSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
  return process.env.NODE_ENV === 'production' ? URL_PRODUCCION : 'http://localhost:3000'
}
