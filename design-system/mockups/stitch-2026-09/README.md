# Rediseño Stitch — septiembre 2026

Modelo que armó Gabriel en **Stitch Design** (`stitch_project_repository_redesign1` a `6`).
Se aplica **una pantalla por tanda** — pedido explícito suyo el 08/09/2026.

**Regla de Gabriel (09/09/2026):** "no agregues cosas de funcionamiento que no hayamos
diseñado, solo usá la parte meramente de diseño del mockup". Stitch inventa funciones
(botones que no hacen nada, datos que el sistema no tiene). Del mockup se toma el diseño;
lo que dibuja y la pantalla no hace queda anotado abajo, como pregunta.

| # | Carpeta | Pantalla | Archivo acá | Estado |
|---|---|---|---|---|
| 1 | `stitch_project_repository_redesign1` | Listado de lotes (`/admin/lotes`) | `1-lotes-listado.html`, `1-DESIGN.md` | Aplicado (08/09/2026) |
| 2 | `stitch_project_repository_redesign2` | Detalle del lote (`/admin/lotes/[id]`) | `2-lote-detalle.html` | Aplicado (09/09/2026) |
| 3 | `stitch_project_repository_redesign3` | Reservar lote (`/admin/lotes/[id]/reservar`) | `3-lote-reservar.html` | Aplicado (09/09/2026) |
| 4 | `stitch_project_repository_redesign4` | Vender lote (`/admin/lotes/[id]/vender`) | `4-lote-vender.html` | Aplicado (09/09/2026) |
| 5 | `stitch_project_repository_redesign 5` | Loteos (`/admin/loteos`) | `5-loteos.html` | Aplicado (15/09/2026) |
| 6 | `stitch_project_repository_redesign 6` | Distribución de cuotas (`/admin/lotes/[id]/distribucion`) | `6-distribucion-cuotas.html` | Aplicado (15/09/2026) |

`1-DESIGN.md` es el sistema de diseño completo ("SIMA Core ERP"): paleta,
tipografía, elevación, geometría y componentes. Vale para todas las pantallas
(las carpetas 5 y 6 traen el mismo archivo, byte a byte) — conviene releerlo
antes de cada tanda en vez de copiar clases sueltas del HTML.

## Qué se aplicó en la tanda 1

**Fundaciones** (tocan toda la app, no solo `/admin/lotes`):

- **Dos tipografías en vez de una.** Plus Jakarta Sans queda para títulos de
  módulo y encabezados (`font-heading`); el cuerpo entero pasa a **Inter**.
  El DESIGN.md lo pide explícito y la razón es concreta: Jakarta es más ancha,
  y en una tabla de 180 filas eso son columnas más gordas y menos registros
  por pantalla.
- **Sidebar más oscura**: `--sima-sidebar` de `#16264f` a `#0b1736`.
- **Píldora del dólar** en la topbar: verde esmeralda con el punto latiendo y
  la moneda explícita ("Dólar $1.420 ARS").
- **`.tabular-nums`** definida en `globals.css` para que los dígitos de plata,
  cuotas y fechas no bailen al cambiar de valor.

**Clases nuevas** en `lib/ui/clases.ts`, bajo el bloque "Rediseño Stitch
2026-09": `PANEL`, `TABLA_PANEL_*`, `PILL_ESTADO`, `PILL_COBRANZA`,
`BOTON_ICONO`, `TAB_FILTRO`, etc. Conviven a propósito con las viejas
(`TARJETA`, `TABLA_*`): si se pisaran ahora, cambiarían de golpe las ~30
pantallas que todavía no se rediseñaron.

### Desvíos deliberados de la pantalla 1

- **No hay paginador.** El mockup dibuja `1 · 2 · 3 … 26` al pie. La pantalla
  real trae todos los lotes de una sola consulta y filtra cliente/cobranza en
  memoria, así que esos botones no paginarían nada. Queda el contador real
  ("Mostrando N de M lotes registrados") y el paginador para cuando la
  consulta corte de verdad por rango. *(Actualización: desde el 11/09 el
  listado se pagina de a 30.)*
- **"Filtros avanzados" abre hacia abajo**, no a la derecha de las pestañas:
  un `<details>` tiene que tener el contenido pegado al `<summary>`. Adentro
  van Acreedor y Cliente, y se abre solo si esos filtros ya vienen en la URL.
- **Pestaña "Rescindidos"** que el mockup no muestra: el estado existe en el
  sistema (y el mockup lo pinta en la tabla), así que se agrega cuando hay al
  menos un lote en ese estado.

## Pantalla 5 — Loteos (15/09/2026)

Clases nuevas en `lib/ui/clases.ts`, bloque "MOCKUP 5 (loteos) y 6": cabecera de
módulo, controles compactos de 12px, tabla de encabezado oscuro y tabla de
encabezado claro.

**Lo que el mockup dibuja y la pantalla no hacía** — respuestas de Gabriel (15/09):

- **Buscador de loteos por nombre** arriba del listado: **sí, hecho** (15/09).
  Filtra sin acentos ni mayúsculas y no pisa los filtros de reasignar (los dos
  viven en la URL: `FiltroEnVivo` tiene `conservar`).
- **Casilla para marcar todos los lotes** en la tabla de reasignar: **sí,
  hecho** (15/09, `components/CasillaMarcarTodos.tsx`). Queda a medias si hay
  algunas marcadas.
- **Ubicación debajo del nombre de cada loteo** ("Villa Allende, Córdoba"):
  **no**. Un loteo no tiene ubicación; la tienen sus lotes.
- **"Quitar asignación (sin loteo)"** como destino al mover: a confirmar (se
  le explicó qué es). Hoy mover exige elegir un loteo, así que un lote puesto
  por error en un loteo no puede volver a "sin loteo".
- **"Actualizado hace 5 min"** en el listado.

**Desvíos de diseño:**

- La columna que el mockup llama "Acciones" en la tabla de reasignar mezcla un
  ojo, una flecha y la pastilla "Disponible". Quedó como **Estado** del lote,
  que es lo que la pantalla ya mostraba; el identificador sigue siendo el link
  al lote.
- El **filtro de ubicación sigue siendo de texto** y no un desplegable: busca
  por parte del texto, que es como funcionaba.
- **"Filtrar"** sigue como botón aunque el filtro se aplica solo al tipear
  (FiltroEnVivo): es para quien aprieta Enter o no usa mouse.
- El selector de archivo de la plantilla muestra solo su botón: el texto
  "Ningún archivo seleccionado" del navegador empujaba "Subir" a otro renglón.

## Pantalla 6 — Distribución de cuotas (15/09/2026)

Clases nuevas en el mismo bloque de `lib/ui/clases.ts`: pasos numerados, fichas de
integrante por papel, control de suma y tarjetas de impacto. La lógica del control de
suma y del paginado está en `lib/lotes/control-de-suma.ts`.

**Lo que el mockup dibuja y la pantalla no hace** (quedó afuera, a preguntar):

- **Exportar XLS** de la distribución.
- **Cargar el reparto en porcentaje.** El porcentaje se muestra, calculado, al lado de
  cada monto; lo que se carga y se guarda sigue siendo el monto.
- **"Regla rápida de asignación".**
- **Agrupar cuotas consecutivas iguales** en un bloque ("#06 - #15, regla replicada").
- **"Cierre de cuentas: $0 balance neto"**, el ID de cuota ("QTA-01-2024") y
  "Anticipo/Seña" en la cabecera: son datos que el sistema no tiene así.
- Los rótulos **"Debe responder / Saldo a favor / Resta cobrar"**: se dejaron los que
  la pantalla ya usaba (Le debés / Cobra de más / Al día), que están atados a cómo se
  calcula el saldo.

**Desvíos de diseño:**

- **"Guardar distribución" arriba y abajo de la matriz**, no en la cabecera de la
  página: la cabecera queda fuera del formulario (entre medio están los formularios de
  roles y participantes, y un formulario no puede ir dentro de otro).
- **El integrante de cada fila sigue siendo un buscador** con lista, no un desplegable:
  lo pidió Nico para no recorrer una lista larga.
- **Roles del lote (admin, acreedor, vendedor) y "Otros participantes"** no aparecen en
  el mockup; quedaron en la tarjeta 1, debajo de las fichas de los integrantes.
- **Objetivos (opcional)** quedó al pie de la tarjeta de impacto, que es donde se ven.
- **"Le transfieren todas las cuotas a"** (el atajo que ya existía) va en la barra de
  la matriz.
- **El destino de cada cuota muestra solo el nombre** (el banco y el alias están en las
  fichas de arriba); debajo, una línea con cómo le queda la cuenta a esa persona.
- **El control de suma avisa, no bloquea:** repartir menos que la cuota se puede guardar
  desde siempre.
- **El paginado esconde con CSS** las cuotas de las otras páginas en vez de sacarlas del
  DOM: el guardado reemplaza todo el reparto del lote y una cuota que no viajara en el
  formulario lo perdería. Lo cubre `tests/e2e/distribucion-paginada.spec.ts`.
