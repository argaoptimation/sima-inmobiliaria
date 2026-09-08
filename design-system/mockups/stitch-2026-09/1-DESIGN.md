---
name: SIMA Core ERP
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#434655'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#004ac6'
  on-primary: '#ffffff'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#b4c5ff'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#495478'
  on-tertiary: '#ffffff'
  tertiary-container: '#616c91'
  on-tertiary-container: '#eeefff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#dbe1ff'
  tertiary-fixed-dim: '#bac5ef'
  on-tertiary-fixed: '#0e1a3b'
  on-tertiary-fixed-variant: '#3b4569'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.03em
  data-tabular:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  sidebar-width-collapsed: 4.5rem
  sidebar-width-expanded: 16rem
  gutter-compact: 0.5rem
  gutter-standard: 1rem
  gutter-loose: 1.5rem
  card-padding: 1.25rem
  table-cell-x: 0.75rem
  table-cell-y: 0.625rem
  header-height: 3.5rem
---

## Brand & Style

The design system embodies an institutional, high-throughput administrative interface tailored for dense operational management, financial oversight, and real estate asset governance. It rejects consumer marketing aesthetics, superfluous whitespace, decorative illustrations, and landing-page paradigms in favor of deterministic utility, high data density, and cognitive clarity.

### Personality & Tone
- **Authoritative & Institutional:** Structural certainty anchored by deep corporate navy tones, communicating financial rigor and structural dependability.
- **Utilitarian & Focused:** Every visual element serves transactional awareness, status recognition, and operational speed.
- **Calm Productivity:** High contrast between administrative surfaces reduces eye strain during extended operational shifts.

### Style Directives
- **Corporate Functional SaaS:** Rigorous grid systems, compact vertical cadence, structural divider lines over blurred geometry, and non-distracting neutral workspaces.
- **Zero Decorative Imagery:** Photography, marketing hero banners, and lifestyle real estate imagery are explicitly excluded. Avatars are strictly typographical monogram badges.
- **Semantic Certainty:** Status colors are reserved strictly for operational states (collections, contracts, cash flows), never for arbitrary decoration.

## Colors

The system employs a dual-context color model: a deep, institutional dark surface for navigation hierarchies and navigation scaffolding, paired with a high-clarity slate and white canvas for data manipulation.

### Palette Architecture
- **Navigation & Scaffolding:**
  - Sidebar Primary Canvas: `#0f172a` (Slate 900)
  - Sidebar Surface Hover / Active: `#1e293b` (Slate 800)
  - Institutional Key Deep: `#0d193a` (Navy Pure)
- **Primary Operational:**
  - Action Primary: `#2563eb` (Blue 600)
  - Action Interactive Hover: `#1d4ed8` (Blue 700)
  - Primary Subtle Tint (Active Selection): `#eff6ff` (Blue 50)
- **Workspace & Surfaces:**
  - Application Canvas: `#f8fafc` (Slate 50)
  - Structural Table Header / Neutral Bar: `#f1f5f9` (Slate 100)
  - Card & Container Surface: `#ffffff`
  - Structural Borders & Hairlines: `#e2e8f0` (Slate 200)
  - Subdued Borders: `#cbd5e1` (Slate 300)
- **Typography & Content:**
  - Primary Ledger Text: `#0f172a`
  - Secondary Administrative Meta: `#475569`
  - Disabled / Placeholder: `#94a3b8`

### Semantic Debt & Collection States
- **Paid / On Schedule (`Al día` / `Pagado`):**
  - Surface: `#f0fdf4` (Emerald 50)
  - Border: `#bbf7d0` (Emerald 200)
  - Text & Glyphs: `#15803d` (Emerald 700)
- **Late / Overdue Grace (`Atrasado`):**
  - Surface: `#fefce8` (Amber 50)
  - Border: `#fef08a` (Amber 200)
  - Text & Glyphs: `#a16207` (Amber 700)
- **Delinquent / Legal Phase (`Moroso` / `Prejudicial`):**
  - Surface: `#fef2f2` (Red 50)
  - Border: `#fecaca` (Red 200)
  - Text & Glyphs: `#b91c1c` (Red 700)

## Typography

The type system separates corporate structural hierarchy from numeric and transactional processing.

### Typeface Allocation
- **Plus Jakarta Sans** is utilized strictly for module titles, view headers, KPIs, and section framing. Its geometric legibility grants structured authority without informal nuances.
- **Inter** handles all dense data presentation, tabular reporting, form inputs, tooltips, and badges. Its horizontal efficiency and neutral character ensure high comprehension across dense ledgers.

### Application Directives
- **Tabular Figures:** All financial figures, contract values, dates, percentages, and IDs must use OpenType tabular numbers (`font-feature-settings: 'tnum' 1, 'cv05' 1`).
- **Data Densities:** Primary ledger rows standardize on `body-sm` (13px) to maximize record display per viewport while maintaining minimum accessibility contrast standards.

## Layout & Spacing

The architecture operates on an explicit 4px baseline rhythm. The operational layout prioritizes permanent visibility of core navigation, high information throughput, and structural predictability.

### Architectural Layout Model
- **Fixed-Fluid Shell:** A fixed administrative sidebar on the left (`16rem`), a rigid system utility header (`3.5rem`), and a responsive fluid operational canvas.
- **Canvas Boundaries:** Content within operational modules stretches to 100% of the canvas width up to an optional maximum clamp of `1680px` for wide monitor workstations, preventing unmanageable line lengths in forms while allowing data tables full breadth.

### Viewport Adaptation
- **Desktop Primary (>= 1280px):** Permanent navigation sidebar expanded; dual/triple column analytical panels; full ledger views with unclipped column distributions.
- **Compact Desktop / Tablet Landscape (1024px - 1279px):** Sidebar collapses to icon rail (`4.5rem`); secondary operational metrics wrap into stacked rows.
- **Tablets & Smaller Screen (< 1024px):** Sidebar shifts to an off-canvas drawer; tables enable horizontal edge-to-edge scroll locks with sticky identifier columns.

## Elevation & Depth

This design system minimizes optical shadow simulation. Visual hierarchy and layering are established through hairline planar borders and micro-value surface contrast rather than ambient elevation blur.

### Depth Hierarchy
- **Level 0 (Canvas Base):** Ground color `#f8fafc`. No borders, no shadows.
- **Level 1 (Card & Module Shells):** Ground `#ffffff`, framed by a precise 1px solid border `#e2e8f0`. Shadow: `0 1px 2px 0 rgba(15, 23, 42, 0.04)`.
- **Level 2 (Active Focus & Sticky Elements):** Ground `#ffffff`, border `#cbd5e1`. Used for sticky table headers, dropdown triggers, and active data filters. Shadow: `0 2px 4px -1px rgba(15, 23, 42, 0.06)`.
- **Level 3 (Overlays & Flyouts):** Modals, contextual menus, slide-over management panels. Border: 1px `#e2e8f0`. Shadow: `0 10px 15px -3px rgba(15, 23, 42, 0.1), 0 4px 6px -4px rgba(15, 23, 42, 0.05)`.
- **Backdrop Drapes:** `rgba(15, 23, 42, 0.45)` with zero backdrop blur to maintain instant UI performance on lower-spec hardware.

## Shapes

The interface utilizes structured, low-radius geometric forms. Sharp discipline reinforces the institutional, software-grade nature of the application.

### Geometry Specifications
- **Inputs, Buttons, and Form Elements:** 4px (`rounded-sm` / `0.25rem`). Ensures crisp alignment across tight input groups and filter bars.
- **Cards, Panels, and Module Shells:** 6px to 8px max (`0.375rem` - `0.5rem`). Maintains containment without softening the professional baseline.
- **Collection & Status Badges:** 4px radius. Fully circular or pill-shaped tags are restricted exclusively to numeric count pills; semantic badges remain squared with slight softness.
- **Initials-Only Avatars:** Strict circles (`rounded-full`) to immediately distinguish user identities from square interactive widgets and data indicators.

## Components

### Buttons & Interactive Controls
- **Primary:** Background `#2563eb`, border 1px solid `#1d4ed8`, text `#ffffff`. Hover: `#1d4ed8`. Height: `36px` (Default), `30px` (Dense Table Action). Typography: `Inter` Medium `13px`.
- **Secondary / Neutral:** Background `#ffffff`, border 1px solid `#e2e8f0`, text `#0f172a`. Hover: Background `#f8fafc`, border `#cbd5e1`.
- **Destructive:** Background `#ffffff`, border 1px solid `#fecaca`, text `#b91c1c`. Hover: Background `#fef2f2`.

### Collection Badges (`Estados de Cobranza`)
- Rendered as uppercase `11px` bold labels with `0.02em` tracking, formatted with a `4px` corner radius and `2px 8px` padding.
- **Al día / Pagado:** Background `#f0fdf4`, border 1px solid `#bbf7d0`, text `#15803d`. Optional static dot indicator: 6px solid `#16a34a`.
- **Atrasado:** Background `#fefce8`, border 1px solid `#fef08a`, text `#a16207`.
- **Moroso / Prejudicial:** Background `#fef2f2`, border 1px solid `#fecaca`, text `#b91c1c`.

### Textual Monogram Avatars
- Pure typography without images. Circle frame with proportional sizing: `32px` for top bar and table assignees, `40px` for profile overviews.
- Background: `#e2e8f0` (Neutral), `#dbeafe` (Primary User / Nicolás).
- Text: `#0f172a` (Neutral), `#1d4ed8` (Primary User).
- Content: Direct initials extracted from display name (e.g., "Nicolás" -> `N`, "Valeria Rossi" -> `VR`). Typography: `Inter` Semi-Bold, vertically and horizontally centered.

### Data Tables & Dense Grids
- **Header:** Background `#f8fafc`, text `#475569`, `12px` font size, uppercase tracking, border-bottom: 1px solid `#e2e8f0`.
- **Rows:** Alternating hover highlight (`#f8fafc`), default background `#ffffff`, border-bottom: 1px solid `#f1f5f9`. Row height fixed to `42px` for balance between compactness and touch target precision.
- **Numeric Cells:** Monospace / tabular alignment to the right; textual descriptions aligned to the left.

### Form Inputs & Fields
- **Container:** Background `#ffffff`, border: 1px solid `#e2e8f0`, radius: `4px`, padding: `8px 12px`, text: `13px` `#0f172a`.
- **Focus State:** Border `#2563eb`, outline 2px solid `rgba(37, 99, 235, 0.15)`.
- **Labels:** Positioned above inputs, `12px` Semi-Bold, color `#475569`.

### Administrative Cards
- Background `#ffffff`, border 1px solid `#e2e8f0`, shadow: minimal elevation. Inner margins: `20px`. Header row integrated with bottom 1px separator where applicable.