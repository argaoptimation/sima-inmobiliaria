import { revalidatePath } from 'next/cache'

// Bug real reportado por Gabriel el 08/09: "resolví lo que decía la
// notificación, entré de vuelta y la notificación seguía ahí".
//
// La causa no es el cálculo -- obtenerNotificaciones se recalcula entero en
// cada carga y da bien. Es DÓNDE se calcula: en app/admin/layout.tsx. Un
// layout de App Router no se vuelve a ejecutar al navegar entre pantallas
// que comparten ese layout, ni cuando un server action revalida solo la
// página en la que estaba parado. Así que la campana seguía mostrando la
// foto vieja hasta un refresh completo del navegador.
//
// Toda acción que pueda hacer DESAPARECER un aviso tiene que llamar a esto.
// El segundo argumento ('layout') es lo que importa: sin él se revalida la
// página /admin y no el layout que envuelve a todas.
export function revalidarNotificaciones() {
  revalidatePath('/admin', 'layout')
}
