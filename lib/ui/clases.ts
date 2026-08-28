// Clases compartidas del design system SIMA (paleta azul/blanco), extraídas
// tal cual de la primera pieza del rediseño de /admin/* (NavAdmin.tsx +
// admin/lotes/page.tsx, 27/08) para no reinventar el tono en cada página
// nueva que se va rediseñando. Si el día de mañana cambia la paleta, este
// es el único lugar a tocar -- antes cada página definía su propio
// `INPUT_CLASE` local y corría el riesgo de irse desalineando de a poco.
//
// Revisión 28/08 (pedido de Gabriel): la primera pasada quedó "como un
// excel bonito" -- correcta pero sin impacto, con los campos de formulario
// "transparentes" contra el fondo blanco de las tarjetas (border-blue-100
// es casi invisible sobre blanco) y sin ningún feedback al interactuar.
// Esta versión sube el contraste en todos lados (bordes más marcados,
// fondo propio en los inputs para que se distingan de la tarjeta que los
// contiene, headers de tabla en azul oscuro sólido en vez de un tinte
// clarito) y agrega "chiches": sombra + levantamiento en hover, feedback
// de presión (active:scale) en botones, transiciones en todo lo
// interactivo. Sigue siendo la misma paleta azul/blanco -- no un rediseño
// de layout -- pero ya no se lee plana.
export const TARJETA = 'rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/70'
export const ENTRADA =
  'mt-1 block rounded-lg border-2 border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 shadow-sm transition-all duration-150 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100'
export const BOTON_PRIMARIO =
  'rounded-lg bg-gradient-to-b from-blue-700 to-blue-800 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-900/25 transition-all duration-150 hover:from-blue-800 hover:to-blue-900 hover:shadow-lg hover:shadow-blue-900/30 active:scale-[0.97] active:shadow-sm disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100'
export const BOTON_SECUNDARIO =
  'rounded-lg border-2 border-blue-800 bg-white px-4 py-2.5 text-sm font-semibold text-blue-800 shadow-sm transition-all duration-150 hover:bg-blue-50 hover:shadow-md active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100'
export const ENLACE =
  'text-sm font-semibold text-blue-700 underline-offset-4 transition-colors duration-150 hover:text-blue-900 hover:underline'
export const ENLACE_TABLA = 'font-medium text-blue-700 underline-offset-4 transition-colors duration-150 hover:text-blue-900 hover:underline'
export const TITULO_H1 = 'text-2xl font-extrabold tracking-tight text-blue-950'
export const TITULO_H2 = 'text-lg font-bold text-blue-900'
export const BANNER_ERROR = 'mb-4 rounded-lg border-l-4 border-red-600 bg-red-50 p-3 text-sm font-medium text-red-800 shadow-sm'
export const BANNER_OK = 'mb-4 rounded-lg border-l-4 border-green-600 bg-green-50 p-3 text-sm font-medium text-green-800 shadow-sm'
export const TABLA_CONTENEDOR = 'overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/70'
export const TABLA_HEADER_FILA = 'bg-gradient-to-r from-blue-900 to-blue-800 text-left text-white'
export const TABLA_HEADER_CELDA = 'px-4 py-3 text-xs font-bold uppercase tracking-wider'
export const TABLA_FILA = 'border-t border-slate-100 transition-colors duration-150 hover:bg-blue-50/70'
export const TABLA_CELDA = 'px-4 py-3 text-slate-600'
export const TABLA_CELDA_PRINCIPAL = 'px-4 py-3 font-semibold text-slate-900'

// Badges de estado -- para reemplazar texto plano ("vendido", "confirmado")
// por una píldora con color, más rápida de escanear en una tabla larga.
// Uso: <span className={`${BADGE_BASE} ${BADGE_VERDE}`}>Vendido</span>
export const BADGE_BASE = 'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold'
export const BADGE_VERDE = 'bg-green-100 text-green-800'
export const BADGE_AZUL = 'bg-blue-100 text-blue-800'
export const BADGE_AMARILLO = 'bg-amber-100 text-amber-800'
export const BADGE_ROJO = 'bg-red-100 text-red-800'
export const BADGE_GRIS = 'bg-slate-100 text-slate-700'
