# Plan de rediseño UI — SIMA (entrega 1: Dashboard admin + Portal cliente)

Mockup de referencia: `design-system/mockups/rediseno-2026-08.html` (ábrelo en el navegador).
**Sacá todos los valores de color, spacing, radios y tipografía del HTML — no los inventes.**
No cambies nada fuera de lo pedido en cada PR. Un PR por vez. Al terminar cada uno, parate y mostrá el diff.

## Reglas duras (aplican a todos los PRs)
- Paleta: no se toca. Azul de marca `#1e40af`/`#1e3a8a`, fondo `#f8fafc`/`#eef2f7`, bordes `#dbeafe`. Semántica de cobranza verde/ámbar/rojo intacta.
- Tipografía: Plus Jakarta Sans, ya está en el proyecto. No agregar una segunda familia.
- Iconos: instalar `lucide-react`. Es el único set permitido.
- Texto secundario: nunca por debajo de `slate-500`/`#64748b` sobre fondo claro. Sobre fondos oscuros, nunca opacidad menor a 0.85 en texto de menos de 13px.
- Texto blanco: nunca sobre `blue-500`/`#3b82f6`. Sobre azul, mínimo `blue-800`/`#1e40af`.
- Cada clase/token nuevo va en `lib/ui/clases.ts`, nunca suelto en una página.
- No aumentar el padding de las tablas del admin (`px-4 py-3` se queda).
- Números monetarios: `font-variant-numeric: tabular-nums`, alineados a la derecha, moneda en gris chico antes del monto.
- No inventar logo ni textos de marca: usar `public/logo.png` tal cual existe.

## PR 1 — Fundaciones
1. Instalar `lucide-react`.
2. En `lib/ui/clases.ts` agregar (sin tocar lo existente): `NUMERO_TABULAR`, `KPI_TARJETA`, `SIDEBAR_ITEM`, `SIDEBAR_ITEM_ACTIVO`, `SIDEBAR_GRUPO_TITULO`, `PAGINA_HEADER`, `BREADCRUMB`.
3. En `app/globals.css` agregar `--sima-sidebar: #16264f` a `:root`.
No tocar ninguna pantalla en este PR.

## PR 2 — Shell admin (sidebar) + Dashboard
Referencia: MOCKUP 1 del HTML.

1. Reemplazar `components/NavAdmin.tsx` por una sidebar vertical fija de 248px, fondo `#16264f`.
   - Grupos con la MISMA lógica de permisos que ya existe (no tocar `esAdministrador`, `puedeVerPagosYUsuarios`, `tieneCuentaPropia`, `puedeVerIndices`, `puedeVerEfectivoYCaja`): Inicio suelto arriba; Operación (Lotes, Loteos, Clientes); Cobranza (Pagos con badge de pendientes, Panel de morosos, Efectivo, Cierre de caja); Finanzas (Cuentas corrientes, Cuentas externas, Índices); Sistema (Usuarios, Historial).
   - Si un grupo entero queda vacío para un rol, no renderizarlo.
   - Ítem activo con `usePathname()`: fondo `rgba(59,130,246,.18)`, texto blanco, barra de 3px `#60a5fa` a la izquierda.
   - Bloque de usuario abajo (nombre, rol, botón logout con la Server Action `logout` existente).
2. Actualizar `app/admin/layout.tsx` al layout de dos columnas + topbar de 64px (buscador global + cotización dólar + notificaciones).
3. Crear `app/admin/inicio/page.tsx` con: 4 KPIs (lotes disponibles/total, cobrado del mes, mora por tramo, pagos por aprobar), gráfico de cobranza de 8 meses (divs, sin librería), lista de mora por tramo, tabla de pagos pendientes.
   - Reusar lógica existente: extraer el cálculo de tramos de `app/admin/panel-morosos/page.tsx` a `lib/cobranza/tramos-mora.ts` e importarlo desde ambos lados. El contador de pendientes ya está en `lib/pagos-pendientes.ts`.
   - Cambiar el redirect de `app/page.tsx` a `/admin/inicio` para los roles con acceso (mantiene el resto de la regla de roles).
4. Crear componente `EncabezadoPagina` (breadcrumb + h1 + slot de acciones a la derecha) y aplicarlo en las 13 pantallas de `/admin/*` reemplazando el `<h1 className={TITULO_H1}>` suelto.
5. Agregar `loading.tsx` con skeletons en las rutas de `/admin/*`.

## PR 3 — Portal del cliente
Referencia: MOCKUP 2 del HTML.

1. Rediseñar `app/portal-cliente/page.tsx`:
   - Banda superior de 180px con motivo verde tipo plano (grilla + radiales), header (logo + nav + logout) y saludo montados encima.
   - Las tarjetas de lotes se solapan con el borde inferior de la banda (`margin-top: -34px`).
   - Una tarjeta full-width por lote (sin imagen — no hay fotos cargadas todavía, no poner placeholder). Barra de progreso de cuotas pagadas/total, próximo vencimiento, monto, botón contextual: azul "Pagar cuota" si está al día, ámbar "Regularizar" si debe.
   - Extender la query de `cuotas` (ya existe en esa página) para calcular cuotas pagadas / total y próximo vencimiento.
   - Mantener `calcularEstadoCobranza` para los colores — no reinventar la semántica.
   - Bloque inferior de "Comprobantes y contratos" con link a documentos.
2. NO tocar `middleware`/auth: el cliente sigue sin ver disponibilidad, precios de otros lotes, ni mora de otros clientes.

## PR 4 — Panel de morosos + Pagos
Referencia: MOCKUP 3 y MOCKUP 4 del HTML.

1. `app/admin/panel-morosos/page.tsx`: mismos 4 tramos y mismo cálculo que ya existen (deben 1, deben 2, posible prejudicial 3+, prejudicial marcado) — NO tocar la lógica de `marcarPrejudicial` ni el cálculo de tramos (ya extraído a `lib/cobranza/tramos-mora.ts` en el PR 2). Agregar arriba 4 tarjetas KPI (total en mora, deben 1-2, posible prejudicial, prejudicial marcado) y reemplazar las 4 tablas separadas por una sola lista con franja de color a la izquierda de cada fila según tramo. El botón "Marcar prejudicial" se mantiene únicamente en las filas de posible prejudicial, como hoy.
2. `app/admin/pagos/page.tsx`: mismos filtros (buscar, estado, acreedor) y misma doble confirmación (acreedor + admin) que ya existen — no tocar `confirmarPago`/`editarMontoPago`. Reemplazar la tabla de 12 columnas por tarjetas: encabezado con cliente+DNI, lote, motivo, medio de pago, monto, link a comprobante y badge de estado; el formulario de confirmación (monto, monto recibido, moneda recibida) va plegado dentro de la tarjeta, visible solo cuando el pago está pendiente. Los casos ya existentes de alerta ("lote sin acreedor vinculado", pago en efectivo sin comprobante que solo confirma el admin) se muestran como banner dentro de la tarjeta, no como texto en una celda.

## Pendiente / fuera de esta entrega
Mapa de loteos (2 niveles), login rediseñado, listado de lotes. Se entregan en próximas rondas — no implementar todavía.
