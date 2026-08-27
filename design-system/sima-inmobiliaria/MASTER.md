# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** SIMA Inmobiliaria
**Generated:** 2026-08-27 (ajustado a mano — el generador automático tiraba un estilo de landing page de lujo inmobiliario que no aplica a un panel de administración con tablas; se reemplazó por la búsqueda dirigida de color/tipografía "blue white corporate trustworthy dashboard")
**Category:** Panel de administración + portal de cliente (no landing page)
**Design Dials:** Density 6/10 (Standard)

---

## Global Rules

### Color Palette

| Role | Hex | Tailwind aprox. | Uso |
|------|-----|------------------|-----|
| Primary | `#1E40AF` | `blue-800` | Botones principales, links activos, header |
| Secondary | `#3B82F6` | `blue-500` | Acentos, botones secundarios, hover |
| Background | `#F8FAFC` | `slate-50` | Fondo general de la página |
| Card / Surface | `#FFFFFF` | `white` | Tarjetas, tablas, formularios |
| Foreground (texto sobre fondo claro) | `#1E3A8A` | `blue-900` | Títulos, texto principal |
| Muted | `#E9EEF6` | `blue-50`/`slate-100` | Fondos secundarios, filas alternadas |
| Border | `#DBEAFE` | `blue-100` | Bordes de tablas, inputs, cards |
| Accent (advertencia) | `#D97706` | `amber-600` | Estados "moroso"/"posible prejudicial" (ya usado en la app) |
| Destructive | `#DC2626` | `red-600` | Errores, "Prejudicial", eliminar |
| On Primary | `#FFFFFF` | `white` | Texto sobre botones/fondos azules |

**Notas de color:** azul + blanco, look corporativo/confiable, WCAG AA verificado. Reutiliza el mismo semáforo verde/ámbar/rojo que la app ya usa para estados de cobranza (Normal/Moroso/Prejudicial) — no se reinventa esa lógica, solo se le da un fondo/tipografía consistente.

### Typography

- **Font única:** Plus Jakarta Sans (una sola familia, cubre títulos y cuerpo)
- **Mood:** profesional, moderno, legible, enterprise SaaS
- **Google Fonts:** https://fonts.google.com/share?selection.family=Plus+Jakarta+Sans:wght@400;500;600;700;800

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
```

**Escala de peso:**
- 800 (ExtraBold): títulos de página (h1)
- 700 (Bold): encabezados de sección (h2)
- 600 (SemiBold): títulos de tarjeta, botones, encabezados de tabla
- 400 (Regular): texto de cuerpo

### Spacing Variables

*Density: 6/10 — Standard (tablas admin pueden usar la escala más compacta, portal cliente la estándar)*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Gaps chicos, iconos |
| `--space-sm` | `8px` / `0.5rem` | Espaciado inline |
| `--space-md` | `16px` / `1rem` | Padding estándar |
| `--space-lg` | `24px` / `1.5rem` | Padding de sección |
| `--space-xl` | `32px` / `2rem` | Separación entre bloques grandes |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Filas, inputs |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, botones elevados |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modales, dropdowns |

---

## Component Specs (clases Tailwind de referencia)

### Botones

- Primario: `bg-blue-800 text-white hover:bg-blue-900 rounded-lg px-4 py-2 font-semibold transition-colors cursor-pointer`
- Secundario: `border border-blue-800 text-blue-800 hover:bg-blue-50 rounded-lg px-4 py-2 font-semibold transition-colors cursor-pointer`
- Destructivo: `border border-red-600 text-red-700 hover:bg-red-50 rounded-lg px-4 py-2 font-semibold transition-colors cursor-pointer`

### Cards / Tablas

- Contenedor: `bg-white rounded-xl border border-blue-100 shadow-sm`
- Encabezado de tabla: `bg-blue-50 text-blue-900 font-semibold text-left`
- Fila: `border-b border-blue-100 hover:bg-blue-50/40`

### Inputs

- `border border-blue-100 rounded-lg px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none`

### Badges de estado (mapear a los ya existentes en la app)

- Al día: `bg-green-50 text-green-700`
- Moroso: `bg-red-50 text-red-600 font-semibold`
- Posible prejudicial: `bg-amber-50 text-amber-700 font-semibold`
- Prejudicial (oficial): `bg-red-100 text-red-800 font-bold`

---

## Style Guidelines

**Style:** Enterprise SaaS limpio (NO "landing page de lujo" — esto es un panel de datos con tablas densas, prioriza legibilidad y densidad de información sobre efectos visuales grandes)

**Keywords:** profesional, confiable, limpio, azul corporativo, denso pero legible

**Anti-patrón explícito para este proyecto:** nada de hero sections gigantes, tipografía de 10-12rem, ni "massive whitespace" — eso es para landing pages de marketing, no para `/admin/lotes` con una tabla de 50 filas.

---

## Anti-Patterns (Do NOT Use)

- ❌ **Emojis como iconos** — usar SVG (Heroicons, Lucide)
- ❌ **Falta de `cursor-pointer`** — todo elemento clickeable lo necesita
- ❌ **Contraste bajo** — mínimo 4.5:1
- ❌ **Cambios de estado instantáneos** — usar transiciones de 150-300ms
- ❌ **Estados de foco invisibles** — necesarios para accesibilidad por teclado
- ❌ **Estilo "Exaggerated Minimalism"** (el que tiró el generador automático la primera vez) — no aplica a este proyecto

---

## Pre-Delivery Checklist

- [ ] Sin emojis como iconos
- [ ] Un solo set de iconos consistente (si se agregan iconos)
- [ ] `cursor-pointer` en todo lo clickeable
- [ ] Transiciones suaves (150-300ms) en hover/focus
- [ ] Contraste de texto 4.5:1 mínimo
- [ ] Estados de foco visibles para navegación por teclado
- [ ] Responsive: probado en mobile (375px) y desktop
- [ ] Sin scroll horizontal en mobile
- [ ] Los badges de estado de cobranza mantienen su semántica de color ya existente (verde/ámbar/rojo)
