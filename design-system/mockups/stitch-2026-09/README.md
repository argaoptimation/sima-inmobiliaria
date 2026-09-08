# Rediseño Stitch — septiembre 2026

Modelo que armó Gabriel en **Stitch Design** y bajó a Drive
(`stitch_project_repository_redesign1/2/3`). Se aplica **una pantalla por
tanda**, no las tres juntas — pedido explícito suyo el 08/09/2026.

| # | Carpeta en Drive | Pantalla | Archivos acá | Estado |
|---|---|---|---|---|
| 1 | `stitch_project_repository_redesign1` | Listado de lotes (`/admin/lotes`) | `1-lotes-listado.html`, `1-DESIGN.md` | **Aplicado** (08/09/2026) |
| 2 | `stitch_project_repository_redesign2` | Detalle del lote (`/admin/lotes/[id]`) | — | Pendiente |
| 3 | `stitch_project_repository_redesign3` | Reservar lote (`/admin/lotes/[id]/reservar`) | — | Pendiente |

`1-DESIGN.md` es el sistema de diseño completo ("SIMA Core ERP"): paleta,
tipografía, elevación, geometría y componentes. Vale para las tres pantallas,
no solo para la primera — conviene releerlo antes de cada tanda en vez de
copiar clases sueltas del HTML.

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

## Desvíos deliberados respecto del mockup

- **No hay paginador.** El mockup dibuja `1 · 2 · 3 … 26` al pie. La pantalla
  real trae todos los lotes de una sola consulta y filtra cliente/cobranza en
  memoria, así que esos botones no paginarían nada. Queda el contador real
  ("Mostrando N de M lotes registrados") y el paginador para cuando la
  consulta corte de verdad por rango.
- **"Filtros avanzados" abre hacia abajo**, no a la derecha de las pestañas:
  un `<details>` tiene que tener el contenido pegado al `<summary>`. Adentro
  van Acreedor y Cliente, y se abre solo si esos filtros ya vienen en la URL.
- **Pestaña "Rescindidos"** que el mockup no muestra: el estado existe en el
  sistema (y el mockup lo pinta en la tabla), así que se agrega cuando hay al
  menos un lote en ese estado.
