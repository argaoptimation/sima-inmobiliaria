// Clases compartidas del design system SIMA (paleta azul/blanco), extraídas
// tal cual de la primera pieza del rediseño de /admin/* (NavAdmin.tsx +
// admin/lotes/page.tsx, 27/08) para no reinventar el tono en cada página
// nueva que se va rediseñando. Si el día de mañana cambia la paleta, este
// es el único lugar a tocar -- antes cada página definía su propio
// `INPUT_CLASE` local y corría el riesgo de irse desalineando de a poco.
export const TARJETA = 'rounded-xl border border-blue-100 bg-white p-4 shadow-sm'
export const ENTRADA =
  'mt-1 block rounded-lg border border-blue-100 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200'
export const BOTON_PRIMARIO =
  'rounded-lg bg-blue-800 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-900'
export const BOTON_SECUNDARIO =
  'rounded-lg border border-blue-800 px-3 py-2 text-sm font-semibold text-blue-800 transition-colors hover:bg-blue-50'
export const ENLACE = 'text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline'
export const ENLACE_TABLA = 'text-blue-800 underline-offset-4 hover:underline'
export const TITULO_H1 = 'text-xl font-extrabold text-blue-900'
export const TITULO_H2 = 'text-lg font-bold text-blue-900'
export const BANNER_ERROR = 'mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700'
export const BANNER_OK = 'mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700'
export const TABLA_CONTENEDOR = 'overflow-x-auto rounded-xl border border-blue-100 bg-white shadow-sm'
export const TABLA_HEADER_FILA = 'bg-blue-50 text-left text-blue-900'
export const TABLA_HEADER_CELDA = 'px-4 py-3 font-semibold'
export const TABLA_FILA = 'border-t border-blue-100 hover:bg-blue-50/40'
export const TABLA_CELDA = 'px-4 py-3 text-slate-600'
export const TABLA_CELDA_PRINCIPAL = 'px-4 py-3 font-medium text-slate-800'
