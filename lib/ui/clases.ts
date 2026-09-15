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
// El `hover:` no es decoracion (09/09, pedido de Gabriel): sobre un
// formulario de muchas filas iguales -- cargar 36 cuotas a mano es el caso
// real -- todos los campos se ven identicos y se pierde de vista en cual
// esta parado el mouse. Al oscurecer el borde y blanquear el fondo, el
// campo bajo el puntero se separa del resto sin tener que hacer click.
export const ENTRADA =
  'mt-1 block rounded-lg border-2 border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 shadow-sm transition-all duration-150 placeholder:text-slate-400 hover:border-slate-400 hover:bg-white focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100'
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
// Píldora de la cotización del día en la topbar. Revisión Stitch 2026-09
// (MOCKUP 1): verde esmeralda con borde marcado y el punto latiendo, para
// que se lea como "dato vivo de hoy" y no como una etiqueta decorativa.
export const DOLAR_PILL =
  'flex items-center gap-2 rounded-lg border border-emerald-200/80 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-xs'

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


// Ancho cómodo de lectura para formularios y fichas dentro de una pantalla
// que por lo demás usa todo el ancho (06/09).
//
// La regla general que pidió Gabriel es "todo a ancho completo", y vale para
// las tablas: son las que sufren cuando les falta lugar. Un formulario es al
// revés -- un input de 1800px de ancho no le sirve a nadie y el ojo se pierde
// yendo de la etiqueta al campo. Así que la pantalla es ancha y lo que se
// acota es el bloque de formulario, no al revés.
export const COLUMNA_LECTURA = 'max-w-3xl'

// ---------------------------------------------------------------------------
// Rediseño Stitch 2026-09 -- MOCKUP 1 (/admin/lotes)
// Fuente: design-system/mockups/stitch-2026-09/1-lotes-listado.html + DESIGN.md
// ("SIMA Core ERP"). Los valores salen del mockup, no están inventados.
//
// Por qué convive con las clases de arriba en vez de reemplazarlas: el
// rediseño entra pantalla por pantalla (pedido de Gabriel: "andá de a uno
// por vez"). Si TARJETA/TABLA_* cambiaran acá, cambiarían de golpe las ~30
// pantallas que todavía no se rediseñaron y quedarían a mitad de camino
// entre dos lenguajes. Cuando las tres pasadas estén hechas, estas clases
// absorben a las viejas y aquellas se borran.
// ---------------------------------------------------------------------------

// Contenedor base de todo bloque de contenido. Ojo con la diferencia
// respecto de TARJETA: el mockup baja la sombra a `shadow-sm` y afina el
// borde a slate-200/80 -- el DESIGN.md es explícito en que la jerarquía se
// arma con líneas de 1px y contraste de superficie, NO con sombras
// difusas ("minimizes optical shadow simulation").
export const PANEL = 'rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm'
export const PANEL_SIN_PADDING = 'overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm'

// Encabezado de pantalla: el breadcrumb pasa a versalitas ("INICIO › LOTES")
// y el h1 vuelve a Jakarta, ahora que el cuerpo es Inter.
export const MIGAS_PANEL = 'flex items-center gap-1.5 text-xs font-semibold tracking-wider text-slate-500 uppercase'
export const TITULO_PANTALLA = 'font-heading text-2xl font-bold tracking-tight text-[#0b1736]'
export const CONTADOR_PILL =
  'rounded-full border border-blue-200/70 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700'

// Botones de acción del encabezado. `rounded-xl` (12px) es del mockup:
// más redondeado que los controles de formulario, que van en 4-8px.
export const BOTON_NEUTRO =
  'inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 shadow-xs transition-all hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60'
export const BOTON_ACCION =
  'inline-flex cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:from-blue-700 hover:to-blue-800 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60'

// Pestañas de estado arriba de la barra de filtros ("Todos (180)").
export const TAB_FILTRO =
  'shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900'
export const TAB_FILTRO_ACTIVO =
  'shrink-0 rounded-lg bg-[#0b1736] px-3 py-1.5 text-xs font-semibold text-white shadow-xs'

// Campos de la barra de filtros: más chicos y más apagados que ENTRADA --
// son controles secundarios, no el contenido de la pantalla.
export const CAMPO_FILTRO =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 transition-all placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none'

// Tabla densa. Fila de 42px, 13px de tipografía, rayado alterno tenue: el
// objetivo declarado del DESIGN.md es meter la mayor cantidad de registros
// por pantalla sin perder legibilidad.
export const TABLA_PANEL_HEADER =
  'bg-gradient-to-r from-blue-900 to-blue-800 text-left text-[11px] font-bold tracking-wider text-white uppercase select-none'
export const TABLA_PANEL_TH = 'px-4 py-3.5 whitespace-nowrap'
// Encabezado que queda fijo al bajar (10/09, pedido de Gabriel: "cuando vas
// bajando perdes nocion de cual columna es cual"). Va en cada <th> y no en
// el <tr>: el fondo de la fila NO se pinta debajo de una celda sticky -- se
// transparenta y se ven pasar las filas por atras. Por eso tambien el color
// es plano y no el degrade de TABLA_PANEL_HEADER: un degrade repetido celda
// por celda se ve como rayas verticales.
export const TABLA_PANEL_TH_FIJO = 'sticky top-0 z-20 bg-blue-800'
export const TABLA_PANEL_TH_ORDEN = 'flex items-center gap-1 transition-colors hover:text-blue-200'
export const TABLA_PANEL_TR = 'transition-colors hover:bg-blue-50/50'
export const TABLA_PANEL_TR_ALTERNA = 'bg-slate-50/30 transition-colors hover:bg-blue-50/50'
export const TABLA_PANEL_TD = 'px-4 py-3.5 whitespace-nowrap'
export const TABLA_PANEL_PIE =
  'flex shrink-0 flex-col items-center justify-between gap-4 border-t border-slate-100 bg-slate-50/60 px-5 py-4 text-xs text-slate-500 sm:flex-row'

// Acciones por fila: íconos cuadrados de 28px con tooltip, para que la
// columna no crezca con cada acción nueva.
export const BOTON_ICONO =
  'inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-1.5 text-slate-600 transition-colors hover:bg-slate-200 hover:text-blue-700'
export const BOTON_ICONO_PELIGRO =
  'inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600'
export const BOTON_FILA_VERDE =
  'inline-flex cursor-pointer items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-emerald-700'
export const BOTON_FILA_AZUL =
  'inline-flex cursor-pointer items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-blue-700'

// Badges semánticos. El DESIGN.md reserva el color para estados operativos
// (cobranza, contrato, caja) y prohíbe usarlo de adorno -- por eso son
// tablas cerradas y no clases sueltas que cada pantalla pueda mezclar.
const PILL_ESTADO_BASE = 'rounded-full border px-2.5 py-0.5 text-xs font-semibold'
export const PILL_ESTADO: Record<string, string> = {
  disponible: `${PILL_ESTADO_BASE} border-emerald-200/60 bg-emerald-50 text-emerald-700`,
  reservado: `${PILL_ESTADO_BASE} border-amber-200/60 bg-amber-50 text-amber-800`,
  vendido: `${PILL_ESTADO_BASE} border-blue-200/60 bg-blue-50 text-blue-700`,
  rescindido: `${PILL_ESTADO_BASE} border-purple-200/60 bg-purple-50 text-purple-700`,
}
export const PILL_ESTADO_NEUTRO = `${PILL_ESTADO_BASE} border-slate-200 bg-slate-100 text-slate-700`

export const PILL_MONEDA_USD =
  'rounded border border-slate-200/80 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700'
export const PILL_MONEDA_ARS =
  'rounded border border-amber-200/80 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800'

const PILL_COBRANZA_BASE = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold'
export const PILL_COBRANZA = {
  pagado: `${PILL_COBRANZA_BASE} border-emerald-200 bg-emerald-50 text-emerald-700`,
  alDia: `${PILL_COBRANZA_BASE} border-emerald-200/60 bg-emerald-50 text-emerald-700`,
  atrasado: `${PILL_COBRANZA_BASE} border-amber-200/70 bg-amber-50 text-amber-800`,
  moroso: `${PILL_COBRANZA_BASE} border-rose-200/60 bg-rose-50 text-rose-700`,
  prejudicial: `${PILL_COBRANZA_BASE} border-rose-600 bg-rose-600 text-white shadow-xs`,
}
export const PUNTO_COBRANZA = {
  alDia: 'h-1.5 w-1.5 rounded-full bg-emerald-500',
  atrasado: 'h-1.5 w-1.5 rounded-full bg-amber-500',
  moroso: 'h-1.5 w-1.5 rounded-full bg-rose-500',
  prejudicial: 'h-1.5 w-1.5 rounded-full bg-rose-200',
}

// ---------------------------------------------------------------------------
// Rediseno Stitch 2026-09 -- MOCKUP 2 (detalle del lote)
//
// Las clases salen del code.html del mockup, no de mirar la captura: ahi
// estan los valores exactos (radios, sombras, gradientes) en vez de una
// estimacion a ojo. Los iconos del mockup son de Material Symbols y aca se
// mapean a lucide-react, que es lo que ya usa la app.
// ---------------------------------------------------------------------------

// Cabecera: el nombre del lote con su icono y, al lado, las acciones
// destructivas o de estado. Una sola tarjeta en vez de un h1 suelto con
// botones flotando a la derecha.
export const CABECERA_LOTE =
  'flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_10px_rgba(15,23,42,0.03)] md:p-6'
export const CABECERA_LOTE_ICONO =
  'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md shadow-blue-500/20'
export const CABECERA_LOTE_TITULO =
  'font-heading text-2xl font-bold tracking-tight text-slate-900'
export const CABECERA_LOTE_SUBTITULO =
  'mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-slate-500'

// Botones de la cabecera. Neutro por defecto; el de peligro solo se pinta
// de rojo al pasar por encima, para que la fila no se lea como una alarma.
export const BOTON_CABECERA =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-600 transition-all hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60'
export const BOTON_CABECERA_AMBAR =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-700 transition-all hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60'
export const BOTON_CABECERA_PELIGRO =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-600 transition-all hover:border-rose-600 hover:bg-rose-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60'
export const BOTON_CABECERA_AZUL =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-700 transition-all hover:border-blue-300 hover:bg-blue-100'

// Las 4 tarjetas de arriba: precio, cliente, saldo y acreedor. Sombra mas
// suave que la cabecera -- son informacion de apoyo, no el titulo.
export const TARJETA_KPI =
  'flex flex-col justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_4px_rgba(15,23,42,0.03)]'
export const LOTE_KPI_ETIQUETA = 'text-[11px] font-bold tracking-wider text-slate-500 uppercase'
export const LOTE_KPI_ICONO =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600'
export const LOTE_KPI_VALOR =
  'font-heading text-2xl font-extrabold tracking-tight text-slate-900 tabular-nums'
export const LOTE_KPI_DATO = 'text-[13px] text-slate-600'
export const LOTE_KPI_PILL =
  'rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-extrabold text-blue-700 uppercase'

// Barra de progreso de cobranza (cuanto del precio ya se cobro).
export const BARRA_FONDO = 'h-2 w-full overflow-hidden rounded-full bg-slate-100'
export const BARRA_RELLENO =
  'h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all'

// Avatar con las iniciales del cliente, para reconocerlo de un vistazo sin
// leer el nombre completo.
export const AVATAR_INICIALES =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0b1736] text-sm font-bold text-white ring-2 ring-blue-500/20'

// El cuerpo: cuotas a la izquierda (mas ancho), pagos a la derecha.
export const GRILLA_DETALLE = 'grid grid-cols-1 items-start gap-6 lg:grid-cols-12'
export const COLUMNA_PRINCIPAL = 'space-y-6 lg:col-span-7 xl:col-span-8'
export const COLUMNA_LATERAL = 'space-y-6 lg:col-span-5 xl:col-span-4'

// Encabezado de un panel: icono cuadrado + titulo + accion a la derecha.
export const PANEL_HEADER =
  'flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4'
export const PANEL_HEADER_ICONO =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700'
export const PANEL_TITULO = 'font-heading text-lg font-bold text-slate-900'

// La tira de "Saldar lote": destaca sin gritar, porque es una accion que se
// usa poco pero que cuando se usa mueve todo el saldo del lote.
export const TIRA_DESTACADA =
  'flex flex-wrap items-center justify-between gap-4 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 via-indigo-50/50 to-white p-4'
export const TIRA_DESTACADA_ICONO =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20'

// Tabla dentro de un panel: bordes propios, porque va embebida y no puede
// apoyarse en los del panel.
export const TABLA_EMBEBIDA = 'overflow-x-auto rounded-xl border border-slate-200/90 shadow-sm'

// Estado de una cuota. Son los cuatro que existen de verdad en el sistema.
const PILL_CUOTA_BASE = 'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap'
export const PILL_CUOTA = {
  pagada: `${PILL_CUOTA_BASE} bg-emerald-50 text-emerald-700 border border-emerald-200/60`,
  vencida: `${PILL_CUOTA_BASE} bg-red-50 text-red-700 border border-red-200/60`,
  porVencer: `${PILL_CUOTA_BASE} bg-amber-50 text-amber-800 border border-amber-200/60`,
  esperando: `${PILL_CUOTA_BASE} bg-slate-100 text-slate-600 border border-slate-200/60`,
  refinanciada: `${PILL_CUOTA_BASE} bg-purple-50 text-purple-700 border border-purple-200/60`,
}

// Listas resumidas del detalle del lote (14/09): lo que queda fuera del
// resumen lleva FUERA_DEL_RESUMEN y se esconde mientras el contenedor de
// ResumenDesplegable diga data-resumido="si". Va por CSS y no filtrando en
// React para que las filas se rendericen una sola vez en el servidor, con la
// tabla y sus anchos iguales en los dos modos.
export const FUERA_DEL_RESUMEN = 'group-data-[resumido=si]/resumen:hidden'
export const BOTON_VER_TODO =
  'flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-50'

// Cada pago, como tarjeta y no como fila: en la columna angosta no entran
// fecha + medio + monto + comprobante + doble confirmacion en una fila, y
// el estado de la doble validacion es justo lo que hay que poder leer.
export const TARJETA_PAGO =
  'space-y-2 rounded-xl border border-slate-200/80 bg-slate-50 p-3.5 transition-colors hover:bg-slate-100/60'
export const TARJETA_PAGO_PENDIENTE =
  'space-y-3 rounded-xl border border-amber-200/80 bg-amber-50/60 p-3.5 ring-1 ring-amber-300/60'

// ---------------------------------------------------------------------------
// Rediseno Stitch 2026-09 -- MOCKUP 3 (reservar) y 4 (vender)
//
// Los dos son formularios largos. El mockup los parte en secciones
// numeradas con una ficha del lote fija al costado, para que se vea que se
// esta comprando mientras se cargan los datos del que compra.
// ---------------------------------------------------------------------------

export const SECCION_FORM =
  'space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_2px_10px_rgba(15,23,42,0.03)] md:p-5'
export const SECCION_FORM_NUMERO =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-blue-700 shadow-sm'
export const SECCION_FORM_TITULO =
  'font-heading text-sm leading-tight font-bold text-slate-900 md:text-base'
export const SECCION_FORM_BAJADA = 'text-xs text-slate-500'

// Dos columnas de campos adentro de cada seccion. Los campos largos
// (domicilio, mail) ocupan las dos con CAMPO_ANCHO.
export const GRILLA_CAMPOS = 'grid grid-cols-1 gap-3.5 md:grid-cols-2'
export const CAMPO_ANCHO = 'md:col-span-2'
export const ETIQUETA_CAMPO =
  'mb-1 block text-[11px] font-bold tracking-wider text-slate-500 uppercase'

// Ficha del lote: una tapa oscura con el loteo y la ubicacion, y debajo las
// especificaciones como filas etiqueta/valor.
export const FICHA_LOTE_TAPA =
  'relative flex h-32 flex-col justify-between overflow-hidden bg-gradient-to-tr from-slate-900 to-[#0b1736] p-4 text-white'
export const FICHA_LOTE_BADGE =
  'rounded-full border border-emerald-400/40 bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300 backdrop-blur-sm'
export const FICHA_LOTE_FILA =
  'flex items-center justify-between gap-3 border-b border-slate-50 py-1 text-xs'
export const FICHA_LOTE_DESTACADO =
  'flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-2.5 py-1.5'

// ---------------------------------------------------------------------------
// Rediseno Stitch 2026-09 -- ajustes del 09/09 sobre el detalle del lote
//
// Gabriel pidio "optimizarlo mas": la mitad de arriba ya seguia el mockup
// (cabecera + KPIs + cuotas/pagos) pero la de abajo seguia siendo la
// pantalla vieja -- titulos sueltos y formularios apilados en una columna
// angosta. Estas clases son para esa mitad.
// ---------------------------------------------------------------------------

// El desplegable de "Documentacion del lote" que en el mockup vive en la
// cabecera, al lado de las acciones. Es un <summary>, asi que se abre sin
// JavaScript.
export const DESPLEGABLE_CABECERA =
  'inline-flex cursor-pointer list-none items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-700 transition-all select-none hover:border-blue-300 hover:bg-blue-100 [&::-webkit-details-marker]:hidden'
export const DESPLEGABLE_CABECERA_CONTADOR =
  'rounded-md bg-blue-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white tabular-nums'

// La grilla de "Datos del lote" del mockup: campos cortos de a cuatro por
// fila en vez de uno abajo del otro a lo ancho de una columna de 28rem. La
// nomenclatura catastral y la matricula son largas y se toman dos.
export const GRILLA_DATOS_LOTE = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'

// Fila de dato de solo lectura (etiqueta arriba, valor abajo), para las
// fichas que no son un formulario -- la de la reserva, por ejemplo.
export const DATO_LECTURA_ETIQUETA =
  'text-[11px] font-bold tracking-wider text-slate-400 uppercase'
export const DATO_LECTURA_VALOR = 'text-sm font-medium text-slate-800'

// Chip para un archivo adjunto (comprobante, DNI, contrato): link cuando el
// archivo esta, apagado cuando no.
export const CHIP_ARCHIVO =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-50'
export const CHIP_ARCHIVO_VACIO =
  'inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-400'

// ---------------------------------------------------------------------------
// Rediseno Stitch 2026-09 -- MOCKUP 5 (loteos) y 6 (distribucion de cuotas)
//
// Salen del code.html de cada mockup (15/09). Son pantallas de trabajo con
// muchos controles por fila, asi que el mockup baja todo a 12px: campos,
// botones y encabezados de tabla mas chicos que en el detalle del lote.
// ---------------------------------------------------------------------------

// Cabecera de modulo: icono azul lleno, titulo, una bajada que dice para que
// sirve la pantalla y, a la derecha, un resumen en numeros.
export const CABECERA_MODULO_ICONO =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/30'
export const CABECERA_MODULO_TITULO = 'font-heading text-2xl font-bold tracking-tight text-slate-900'
export const CABECERA_MODULO_BAJADA = 'max-w-3xl text-xs text-slate-500'
export const CABECERA_MODULO_RESUMEN =
  'flex w-fit items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-medium text-blue-800 tabular-nums'

// Controles compactos (12px) para barras de filtro y celdas de tabla.
// Sin ancho: para cuando el ancho lo pone quien lo usa (w-28, flex-1).
// Sumarle un w-28 a CAMPO_COMPACTO no alcanza: con w-full y w-28 en la misma
// clase gana el que Tailwind escribe despues en el CSS, no el ultimo de la
// lista, y en la matriz de distribucion el buscador quedaba de 0px.
export const CAMPO_COMPACTO_SIN_ANCHO =
  'rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-xs text-slate-700 transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none'
export const CAMPO_COMPACTO = `w-full ${CAMPO_COMPACTO_SIN_ANCHO}`
export const ETIQUETA_COMPACTA = 'mb-1 block text-[10px] font-bold tracking-wide text-slate-500 uppercase'
export const BOTON_CHICO_PRIMARIO =
  'inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold whitespace-nowrap text-white shadow-xs transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60'
export const BOTON_CHICO_NEUTRO =
  'inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60'
export const BOTON_CHICO_AZUL_SUAVE =
  'inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60'
export const BOTON_ICONO_AZUL =
  'inline-flex items-center justify-center rounded-lg p-1.5 text-blue-600 transition hover:bg-blue-50 hover:text-blue-800'

// Tabla con encabezado oscuro (el color de la barra lateral): la de los
// loteos, que es el listado principal de la pantalla.
export const TABLA_OSCURA_HEADER = 'bg-[#0d1527] text-[11px] font-semibold tracking-wider text-slate-200 uppercase'
export const TABLA_OSCURA_TH = 'border-b border-slate-800 px-4 py-3'
// Tabla con encabezado claro: las que viven adentro de un panel (reasignar,
// la matriz de distribucion), para no competir con el listado de arriba.
export const TABLA_CLARA_HEADER = 'bg-slate-50 text-[11px] font-semibold tracking-wider text-slate-600 uppercase'
export const TABLA_CLARA_TH = 'border-b border-slate-200 px-3 py-2.5'
export const TABLA_COMPACTA_TD = 'px-3 py-2.5'

// "84 lotes": la cantidad como pastilla, azul, o ambar cuando son lotes que
// estan esperando que se les asigne un loteo.
export const CONTADOR_LOTES =
  'inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 tabular-nums'
export const CONTADOR_LOTES_PENDIENTES =
  'inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800 tabular-nums'

// La distribucion se lee como pasos numerados: 1 quienes cobran, 2 como se
// reparte cada cuota.
export const PASO_NUMERO =
  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700'
export const PASO_TITULO = 'text-sm font-bold tracking-tight text-slate-900'
export const PASO_BAJADA = 'text-xs text-slate-500'

// "+ Agregar ...": borde punteado, porque agrega algo que todavia no esta.
export const BOTON_AGREGAR_PUNTEADO =
  'inline-flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg border border-dashed border-blue-300 bg-white px-3.5 py-2 text-xs font-semibold text-blue-600 shadow-2xs transition select-none hover:bg-blue-50 hover:text-blue-800 [&::-webkit-details-marker]:hidden'
export const BOTON_AGREGAR_TEXTO =
  'inline-flex w-fit cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold text-blue-600 transition hover:bg-blue-50 hover:text-blue-800'

// Ficha de cada integrante del lote. El color dice el papel, igual que en
// el mockup: admin gris, acreedor azul, vendedor indigo, el resto violeta.
export const FICHA_INTEGRANTE: Record<string, { ficha: string; avatar: string; papel: string }> = {
  admin: {
    ficha: 'border-slate-200 bg-slate-50',
    avatar: 'bg-slate-200 text-slate-700',
    papel: 'border-slate-200 bg-white text-slate-600',
  },
  acreedor: {
    ficha: 'border-blue-200 bg-blue-50/50',
    avatar: 'bg-blue-600 text-white',
    papel: 'border-blue-200 bg-blue-100/70 text-blue-700',
  },
  vendedor: {
    ficha: 'border-indigo-200 bg-indigo-50/40',
    avatar: 'bg-indigo-600 text-white',
    papel: 'border-indigo-200 bg-indigo-100 text-indigo-700',
  },
  otro: {
    ficha: 'border-violet-200 bg-violet-50/40',
    avatar: 'bg-violet-600 text-white',
    papel: 'border-violet-200 bg-violet-100 text-violet-700',
  },
}

// Control de suma de cada cuota: verde repartida entera, ambar falta,
// rojo de mas, gris sin repartir. El numero de la cuota toma el mismo color
// para que la columna se pueda recorrer de un vistazo.
const PILL_SUMA_BASE =
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold whitespace-nowrap shadow-2xs'
export const PILL_SUMA = {
  completa: `${PILL_SUMA_BASE} border-emerald-200 bg-emerald-50 text-emerald-700`,
  falta: `${PILL_SUMA_BASE} border-amber-200 bg-amber-100 text-amber-800`,
  excedida: `${PILL_SUMA_BASE} border-red-200 bg-red-100 text-red-700`,
  sin_repartir: `${PILL_SUMA_BASE} border-slate-200 bg-slate-100 text-slate-600`,
}
const NUMERO_CUOTA_BASE = 'rounded border px-2 py-0.5 font-mono font-bold'
export const NUMERO_CUOTA_SUMA = {
  completa: `${NUMERO_CUOTA_BASE} border-blue-200 bg-blue-50 text-blue-600`,
  falta: `${NUMERO_CUOTA_BASE} border-amber-200 bg-amber-100 text-amber-700`,
  excedida: `${NUMERO_CUOTA_BASE} border-red-200 bg-red-100 text-red-700`,
  sin_repartir: `${NUMERO_CUOTA_BASE} border-slate-200 bg-slate-100 text-slate-600`,
}
export const FILA_CUOTA_SUMA = {
  completa: 'bg-white hover:bg-slate-50/80',
  falta: 'bg-amber-50/20 hover:bg-amber-100/30',
  excedida: 'bg-red-50/30 hover:bg-red-50/50',
  sin_repartir: 'bg-white hover:bg-slate-50/80',
}

// Tarjeta de "como le queda la cuenta" a cada integrante.
export const TARJETA_IMPACTO = 'relative rounded-xl border border-slate-200 bg-slate-50 p-4'
const PILL_IMPACTO_BASE = 'rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap'
export const PILL_IMPACTO = {
  leDebes: `${PILL_IMPACTO_BASE} border-amber-200 bg-amber-100 text-amber-800`,
  cobraDeMas: `${PILL_IMPACTO_BASE} border-rose-200 bg-rose-100 text-rose-700`,
  alDia: `${PILL_IMPACTO_BASE} border-emerald-200 bg-emerald-100 text-emerald-800`,
}
