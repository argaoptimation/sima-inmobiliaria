# Diseño: Nombre de cliente + búsqueda en Pagos y Lotes

**Proyecto:** SIMA Inmobiliaria (cliente: Nicolás Saieg)
**Fecha:** 2026-08-14
**Estado:** Aprobado por Gabriel (WHAPIGEN) por chat.

## Contexto

Gabriel pidió, para ayudar a Nicolás/al acreedor a ubicar pagos: mostrar el
nombre del cliente en `/admin/pagos`, y poder buscar/filtrar tanto en
`/admin/pagos` (por cliente o lote) como en `/admin/lotes` (que hoy solo
tiene selects de Moneda/Acreedor, sin texto libre).

## Decisión

### 1. Mecanismo de búsqueda: el mismo patrón ya usado en `/admin/lotes`

`/admin/lotes` ya filtra 100% server-side, vía un `<form method="get">`
con selects que recargan la página al tocar "Filtrar" — no hay JavaScript
de cliente en ningún lado de la app. Se agrega un campo de texto libre a
ESE MISMO formulario (no un mecanismo nuevo), y se replica el patrón en
`/admin/pagos` (que hoy no tiene ningún formulario de filtro). Esto NO es
búsqueda "en vivo" mientras se tipea — es buscar y tocar "Filtrar" /
Enter, igual que ya funciona Moneda/Acreedor hoy. Cruzar a una búsqueda
que filtre en cada tecla sería el primer componente interactivo real del
proyecto, ya diferido varias veces en esta sesión — no se hace acá.

### 2. `/admin/pagos`: columna "Cliente" + búsqueda por cliente o lote

- Se agrega una columna "Cliente" (nombre completo), resuelta desde
  `pago.cliente_id`, ubicada después de "Lote" y antes de "Motivo" —
  desplaza los índices de columna existentes (ver Task 2 del plan para el
  detalle exacto, y la nota sobre actualizar los tests ya existentes que
  asumen la posición actual).
- Se agrega un campo de texto "Buscar cliente o lote" al formulario GET.
  Al buscar "Juan" o "Lote1", el filtro corre así: se buscan lotes cuyo
  `identificador` contenga el texto (`ilike`), y clientes cuyo `full_name`
  contenga el texto (`ilike`); la lista de pagos se filtra a
  `lote_id IN (esos lotes) OR cliente_id IN (esos clientes)`. Sin
  resultados en ninguno de los dos → lista vacía con el mensaje ya
  existente de "no hay pagos", no un error.
- El filtro por texto se combina (AND) con el scoping ya existente por rol
  (acreedor solo ve pagos de sus lotes) — nunca se lo puede usar para ver
  pagos fuera de lo que ese rol ya podía ver.

### 3. `/admin/lotes`: búsqueda por identificador

- Se agrega el mismo campo de texto "Buscar identificador" al formulario
  GET ya existente (junto a Moneda y Acreedor), filtrando
  `identificador ilike %texto%`. Se combina (AND) con los filtros de
  Moneda/Acreedor si también están cargados, y con el scoping por rol ya
  existente (acreedor ve solo sus lotes, vendedor/cobrador solo
  disponibles).

## Fuera de alcance de esta tanda

- Búsqueda en vivo (sin recargar) — arquitectura ya discutida y diferida.
- Búsqueda por DNI, email, u otros campos de la reserva — solo
  identificador de lote y nombre de cliente, que es lo pedido.
- Ordenar los resultados de búsqueda de forma especial (relevancia, etc.)
  — se mantiene el orden ya existente de cada pantalla.

## Testing

- Unitario: no hace falta.
- E2E: extender specs existentes o uno nuevo, cubriendo — en Pagos:
  columna Cliente muestra el nombre correcto; buscar por nombre de
  cliente encuentra el pago correspondiente; buscar por identificador de
  lote también; buscar algo que no matchea nada da lista vacía sin error;
  un acreedor buscando el nombre de un cliente con lotes de OTRO acreedor
  no lo ve (el scoping por rol sigue aplicando). En Lotes: buscar por
  identificador filtra correctamente, combinado con Moneda/Acreedor.
- Regresión completa (build + unitarios + e2e x2), incluyendo arreglar
  los tests existentes que asumen los índices de columna viejos de
  `/admin/pagos`.
