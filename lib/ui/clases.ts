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

// Fundaciones del rediseño 2026-08 (ver design-system/rediseno/PLAN.md,
// PR 1) -- valores sacados tal cual del mockup de referencia
// (design-system/mockups/rediseno-2026-08.html), no inventados. Todavía
// no se usan en ninguna pantalla (eso arranca en el PR 2, shell admin +
// dashboard) -- por ahora solo quedan disponibles acá.

// Números monetarios/de cuotas: alinea los dígitos a ancho fijo para que
// no "salten" al cambiar de valor. Se compone con text-right aparte
// cuando corresponde (en el mockup NO siempre va alineado a la derecha,
// ej. los números grandes de los KPI van a la izquierda).
export const NUMERO_TABULAR = 'tabular-nums'

// Tarjeta de KPI del dashboard (mockup 1, tarjetas "Lotes disponibles" /
// "Cobrado este mes" / etc: bg #fff, border #dbeafe, radius 12px, padding
// 16px/17px, shadow con tinte azul marino en vez de negro puro).
export const KPI_TARJETA =
  'flex flex-col gap-[11px] rounded-xl border border-blue-100 bg-white p-[16px_17px] shadow-[0_1px_2px_rgba(15,32,73,0.05)]'

// Ítem de navegación de la sidebar nueva (mockup 1, links tipo "Lotes"/
// "Loteos" sin estar activos): texto blanco al 78% de opacidad, radius
// 8px, hover con fondo blanco muy tenue.
export const SIDEBAR_ITEM =
  'flex items-center gap-[11px] rounded-lg px-[11px] py-[9px] text-sm font-medium text-white/[0.78] transition-colors duration-200 hover:bg-white/[0.08] hover:text-white'

// Ítem de navegación activo (mockup 1, "Inicio" resaltado): fondo azul
// #3b82f6 al 18%, texto blanco sólido. La barra de 3px a la izquierda
// (#60a5fa) es un elemento aparte posicionado absoluto dentro de este
// ítem (position:relative acá) -- se arma en el PR 2 junto con el
// componente de sidebar, no es parte de esta clase.
export const SIDEBAR_ITEM_ACTIVO =
  'relative flex items-center gap-[11px] rounded-lg bg-blue-500/[0.18] px-[11px] py-[9px] text-sm font-semibold text-white'

// Título de cada grupo de la sidebar ("Operación", "Cobranza", etc.):
// versalitas chicas, bien espaciadas, blanco apagado al 62%.
export const SIDEBAR_GRUPO_TITULO =
  'px-[11px] pb-1.5 text-[10.5px] font-bold uppercase leading-none tracking-[0.13em] text-white/[0.62]'

// Fila de encabezado de página (breadcrumb + h1 + acciones a la derecha),
// para el componente EncabezadoPagina del PR 2. Mockup 1: la fila queda
// arriba de las tarjetas de KPI, con las acciones ("Exportar"/"Registrar
// pago") alineadas al final del bloque de texto (items-end, no center).
export const PAGINA_HEADER = 'flex items-end justify-between gap-5'

// Breadcrumb chico arriba del h1 ("SIMACOR › Inicio"): gris slate-500 tal
// cual, el piso mínimo que permite la regla dura de contraste del PLAN.md
// (nunca por debajo de slate-500 sobre fondo claro).
export const BREADCRUMB = 'flex items-center gap-[7px] text-[12.5px] text-slate-500'

// PR 2 (ver design-system/rediseno/PLAN.md) -- shell admin (sidebar nueva +
// topbar) y dashboard de /admin/inicio. Igual que en el PR1, valores
// sacados del mockup (MOCKUP 1), no inventados.

// Logo dentro de la sidebar: recuadro blanco propio -- sin esto el logo
// (fondo transparente) se perdería contra el azul marino de la sidebar.
export const SIDEBAR_LOGO = 'flex items-center rounded-[9px] bg-white px-3 py-[7px]'

// Contador numérico junto a "Pagos" en la sidebar (pendientes por
// confirmar) -- mismo criterio de `contarPagosPendientes`, solo cambia el
// estilo de píldora para la sidebar oscura en vez de la nav clara vieja.
export const SIDEBAR_BADGE =
  'ml-auto flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-amber-500 px-[6px] text-[11px] font-extrabold text-[#3b1d02]'

// Bloque de usuario + logout, al pie de la sidebar.
export const SIDEBAR_USUARIO = 'flex items-center gap-[11px] border-t border-white/10 px-4 py-3.5'
export const SIDEBAR_AVATAR =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-800 text-[12.5px] font-bold text-white'

// Topbar de 64px arriba del contenido (buscador global + cotización +
// notificaciones).
export const TOPBAR = 'flex h-16 shrink-0 items-center gap-4 border-b border-blue-100 bg-white px-7'
export const BUSCADOR_GLOBAL =
  'w-full rounded-[9px] border border-blue-100 bg-slate-50 py-[9px] pr-3 pl-9 text-[13.5px] text-slate-800 outline-none placeholder:text-slate-500 focus:border-blue-500 focus:bg-white focus:ring-[3px] focus:ring-blue-100'
export const DOLAR_PILL =
  'flex items-center gap-[7px] rounded-lg border border-green-100 bg-green-50 px-[11px] py-[6px] text-[12.5px] font-semibold text-green-700'

// Tarjetas KPI del dashboard ya tienen KPI_TARJETA (PR1); estos son los
// textos internos reutilizados en las 4 tarjetas de /admin/inicio.
export const KPI_ETIQUETA = 'flex items-center justify-between text-[12.5px] font-semibold text-slate-500'
export const KPI_NUMERO = 'text-[30px] font-extrabold tracking-[-0.03em] text-blue-900'

// Tarjeta genérica de contenido del dashboard (gráfico, lista de mora,
// tabla de pagos): mismo borde/sombra que KPI_TARJETA pero sin el padding
// fijo -- cada bloque interno pone el suyo.
export const DASHBOARD_TARJETA = 'flex flex-col overflow-hidden rounded-xl border border-blue-100 bg-white shadow-[0_1px_2px_rgba(15,32,73,0.05)]'
export const DASHBOARD_TARJETA_HEADER =
  'flex items-center justify-between border-b border-blue-50 px-[18px] py-[13.5px]'
export const DASHBOARD_TARJETA_TITULO = 'text-[14.5px] font-bold text-blue-900'

// PR 3 (ver design-system/rediseno/PLAN.md) -- portal del cliente
// (MOCKUP 2), reemplaza app/portal-cliente/page.tsx. Valores sacados del
// mockup tal cual.
//
// La animación `simaFluido`/`simaFluido2` que el mockup referencia en el
// degradé no traía @keyframes en el propio archivo del mockup -- Gabriel
// confirmó 29/08 que sí van (el degradé se desplaza de azul a verde en
// loop), definidas en app/globals.css y aplicadas acá por `style` inline
// (animation + backgroundSize), junto con los 3 degradés -- ver el
// comentario largo más abajo sobre por qué van por `style` y no por clase.
//
// Alto INTRÍNSECO, no fijo (`h-[...]`): con alto fijo + posicionamiento
// absoluto, el contenido (logo/nav/saludo) podía terminar más alto de lo
// que el banner medía y la tarjeta de abajo terminaba pisando el saludo
// (bug real reportado por Gabriel 29/08). Ahora el banner mide lo que su
// contenido + padding necesiten, en cualquier ancho.
//
// Sin solape con margin negativo: relectura del mockup (no de la
// descripción que yo mismo había escrito de él) -- la tarjeta de lotes NO
// se solapa con la banda, tiene un `margin-top:24px` NORMAL (positivo)
// sobre un contenedor que arranca recién después de la banda. El primer
// intento de este PR asumía un solape "tarjeta sube -34px sobre la banda"
// que no existe en el HTML del mockup -- con alto intrínseco esa cuenta
// además daba 0px de aire real entre el saludo y la tarjeta (el padding
// de "aire" se consumía entero en el solape), que es exactamente lo que
// Gabriel vio pisado. Con margin-top positivo no hay cuenta que pueda
// fallar: siempre hay aire real entre el saludo y la tarjeta.
export const PORTAL_BANNER = 'relative overflow-hidden'
export const PORTAL_BANNER_GRADIENTE =
  'linear-gradient(120deg,#0f3d3a 0%,#1a5c4f 30%,#1e6b6a 55%,#1e4f7a 80%,#16355e 100%)'
export const PORTAL_BANNER_RADIALES = 'absolute -inset-[20%]'
export const PORTAL_BANNER_RADIALES_GRADIENTE =
  'radial-gradient(closest-side at 25% 35%, rgba(255,255,255,.10), transparent 60%),radial-gradient(closest-side at 78% 65%, rgba(255,255,255,.08), transparent 55%)'
export const PORTAL_BANNER_SOMBRA = 'absolute inset-0'
export const PORTAL_BANNER_SOMBRA_GRADIENTE =
  'linear-gradient(200deg, rgba(8,20,24,.25) 0%, rgba(8,20,24,.05) 45%, rgba(8,16,26,.82) 100%)'
// Envoltorio del contenido real (logo/nav arriba, saludo/píldora abajo) --
// `relative z-[1]` para quedar por encima de los degradés absolutos.
// pt/pb asimétricos: 22/26px arriba (como el mockup), 34px abajo siempre
// (el número del solape, en las 2 resoluciones).
export const PORTAL_BANNER_CONTENIDO =
  'relative z-[1] flex flex-col gap-8 px-4 pt-[22px] pb-[22px] sm:px-12 sm:pt-[26px]'
export const PORTAL_TOPBAR_FILA = 'flex items-center justify-between'

export const PORTAL_LOGO_WRAP = 'flex items-center rounded-[10px] bg-white px-[14px] py-2'
export const PORTAL_NAV = 'flex items-center gap-2 sm:gap-[22px]'
export const PORTAL_NAV_LINK_ACTIVO = 'text-xs sm:text-sm font-semibold text-white'
export const PORTAL_NAV_LINK = 'text-xs sm:text-sm font-medium text-white/75 hover:text-white transition-colors'
export const PORTAL_AVATAR =
  'flex h-[27px] w-[27px] sm:h-[31px] sm:w-[31px] items-center justify-center rounded-full border border-white/30 bg-white/[0.18] text-[11px] sm:text-xs font-bold text-white'

export const PORTAL_SALUDO_WRAP =
  'flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-5'
export const PORTAL_SALUDO_TITULO = 'text-xl sm:text-[26px] font-extrabold tracking-[-0.02em] text-white'
export const PORTAL_SALUDO_SUB = 'text-sm text-white/[0.82]'

// Píldora de estado global ("Estás al día" / "Tenés pagos pendientes"),
// arriba a la derecha del saludo. El color (verde/ámbar) se agrega en el
// call site según el estado -- acá solo la forma.
export const PORTAL_PILL =
  'flex items-center gap-2 rounded-[10px] bg-white/95 px-[14px] py-[9px] text-[13.5px] font-semibold shadow-[0_4px_14px_-4px_rgba(0,0,0,0.3)]'

export const PORTAL_TARJETA_LOTE =
  'flex overflow-hidden rounded-[14px] border border-blue-100 bg-white shadow-[0_1px_3px_rgba(15,32,73,0.06)]'
export const PORTAL_TARJETA_LOTE_BODY = 'flex min-w-0 flex-1 flex-col gap-[18px] px-[26px] py-[22px]'
export const PORTAL_ETIQUETA_LOTEO = 'text-[11.5px] font-bold tracking-[0.11em] text-slate-600 uppercase'
export const PORTAL_TITULO_LOTE = 'text-xl font-bold tracking-[-0.015em] text-blue-900'

// Píldora de estado de CADA lote (dentro de la tarjeta) -- mismo tamaño en
// las 4 pantallas, el color varía según el mismo estado de cobranza de
// siempre (normal/atrasado/moroso/prejudicial), no se reinventa la
// semántica de colores.
export const PORTAL_BADGE_LOTE = 'shrink-0 rounded-full px-[13px] py-[5px] text-[12.5px] font-semibold'

export const PORTAL_BARRA_FONDO = 'h-[7px] overflow-hidden rounded-[4px] bg-blue-50'
export const PORTAL_DATO_MINI_LABEL = 'text-[11.5px] font-medium text-slate-600'
export const PORTAL_DATO_MINI_VALOR = 'text-[14.5px] font-bold text-blue-900 tabular-nums'

export const PORTAL_BOTON_VER_DETALLE =
  'rounded-[9px] border border-blue-100 bg-white px-4 py-[10px] text-[13.5px] font-semibold text-blue-800 transition-colors hover:bg-blue-50'
export const PORTAL_BOTON_PAGAR =
  'flex items-center gap-[7px] rounded-[9px] bg-blue-800 px-[18px] py-[10px] text-[13.5px] font-semibold text-white shadow-[0_4px_12px_-4px_rgba(30,64,175,0.55)] transition-colors hover:bg-blue-900'
export const PORTAL_BOTON_REGULARIZAR =
  'flex items-center gap-[7px] rounded-[9px] bg-amber-700 px-[18px] py-[10px] text-[13.5px] font-semibold text-white transition-colors hover:bg-amber-800'

// PR 4 (ver design-system/rediseno/PLAN.md) -- Panel de morosos + Pagos
// (MOCKUP 3 y MOCKUP 4). Valores sacados del mockup de referencia.

export const MOROSOS_KPI_TARJETA =
  'flex flex-col gap-2 rounded-xl bg-white p-[15px_17px] shadow-[0_1px_2px_rgba(15,32,73,0.05)]'
export const MOROSOS_LISTA_WRAP =
  'flex flex-col overflow-hidden rounded-xl border border-blue-100 bg-white shadow-[0_1px_2px_rgba(15,32,73,0.05)]'
export const MOROSOS_GRUPO_HEADER =
  'flex items-center gap-2.5 border-b border-blue-50/70 bg-slate-50/50 px-5 py-3'
export const MOROSOS_FILA =
  'flex items-center gap-3 border-t border-blue-50/60 px-5 py-3 transition-colors hover:bg-slate-50/60'

export const PAGO_TARJETA =
  'overflow-hidden rounded-xl border border-blue-100 bg-white shadow-[0_1px_2px_rgba(15,32,73,0.05)] transition-all'
export const PAGO_TARJETA_ALERTA =
  'overflow-hidden rounded-xl border border-red-200 bg-white shadow-[0_1px_2px_rgba(15,32,73,0.05)] transition-all'
export const PAGO_TARJETA_HEADER =
  'flex flex-wrap items-center gap-3.5 px-5 py-3.5 sm:flex-nowrap'
export const PAGO_FORM_CONFIRMACION =
  'flex flex-wrap items-end gap-3.5 border-t border-blue-50 bg-slate-50/70 px-5 py-3.5'
export const PAGO_BANNER_ALERTA =
  'flex items-center gap-2 border-t border-red-100 bg-red-50/80 px-5 py-2.5 text-[12.5px] font-semibold text-red-700'

