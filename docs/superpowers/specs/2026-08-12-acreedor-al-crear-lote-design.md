# Diseño: Acreedor obligatorio al crear/importar un lote

**Proyecto:** SIMA Inmobiliaria (cliente: Nicolás Saieg)
**Fecha:** 2026-08-12
**Estado:** Aprobado por Gabriel (WHAPIGEN) por chat

## Contexto

Hoy `crearLote` no pide acreedor — un lote queda "— sin asignar —" hasta que
alguien lo carga a mano después, desde la sección "Cobro" del detalle. Gabriel
pidió que el acreedor sea obligatorio ("todo lote tiene un acreedor sí o sí"),
con la posibilidad de crear la cuenta del acreedor de forma dinámica, en el
mismo paso, si todavía no existe — sin salir de la pantalla de crear el lote.

## Decisión

### Un dato nuevo compartido: `profiles.email`

Para poder resolver "¿ya existe un acreedor con este email?" (tanto al crear
un lote individual como al importar en masa) hace falta poder buscar un
`profile` por email. Hoy `profiles` no tiene columna `email` — el email vive
únicamente en `auth.users`, y Supabase no expone un filtro directo por email
sobre esa tabla desde el cliente JS (solo paginar con `listUsers`, lento y
poco práctico para uso repetido).

Se agrega `profiles.email` (columna nueva, indexada), poblada:
- **Retroactivamente**, en la misma migración, con un `update ... from
  auth.users` (union directa por `id`, sin necesidad de paginar nada).
- **Desde ahora en adelante**, en los 3 lugares donde se inserta un
  `profile` nuevo: `crearUsuarioStaff`, `venderLote` (alta del cliente) y el
  nuevo flujo de "crear acreedor dinámicamente" de esta spec — los tres
  agregan `email` al `insert`.

Este campo no es exclusivo de esta tanda: la próxima tanda pendiente
("cliente con varios lotes") también va a necesitar buscar un cliente
existente por email — este mismo campo la destraba de entrada.

### Crear lote individual (`/admin/lotes/nuevo`)

El formulario agrega un selector **"Acreedor"**, obligatorio, con estas
opciones:
- Placeholder vacío "— Elegí un acreedor —" (obliga a elegir algo real,
  mismo patrón que cualquier `<select required>` de este proyecto).
- Un `<option>` por cada acreedor ya cargado (`profiles` con
  `role = 'acreedor'`, por nombre).
- Una última opción **"+ Crear nuevo acreedor"**.

Debajo del selector, siempre visibles (sin JavaScript no hay forma de
mostrarlos/ocultarlos condicionalmente — mismo criterio ya usado en el
selector "Quién recibió la seña" de la reserva, que también deja dos campos
de apoyo siempre presentes), dos campos: **nombre completo del acreedor
nuevo** y **email del acreedor nuevo**, con una aclaración tipo "Si elegiste
'Crear nuevo acreedor' arriba: completá esto" — mismo estilo de copy que ya
usa el campo `recibidoPorOtro`.

`crearLote` (Server Action):
1. Si el selector viene vacío → error "Elegí un acreedor o creá uno nuevo".
2. Si el selector es `"__nuevo__"`: valida que nombre y email nuevos estén
   completos (si no, error en español); invita por email
   (`inviteUserByEmail`, mismo mecanismo que `crearUsuarioStaff`); inserta el
   `profile` (`role: 'acreedor'`, `full_name`, `email`); usa el id recién
   creado como acreedor del lote.
3. Si el selector es un id real: se valida (defensa en profundidad, mismo
   criterio que el resto del proyecto) que ese id efectivamente corresponda
   a un `profile` con `role = 'acreedor'` — evita que un POST forjado directo
   asigne cualquier id arbitrario como acreedor.
4. Inserta el lote con `acreedor_id` ya resuelto, junto a los 4 campos que ya
   son obligatorios (identificador, ubicación, precio total, moneda).

La lógica de "qué eligió el admin" (existente vs. nuevo, y validación de
campos según el caso) se extrae a una función pura testeable,
`lib/lotes/validar-seleccion-acreedor.ts`, mismo patrón que
`tieneRecibidoPorValido`.

### Importar lotes (bulk, paste-from-Excel)

Se agrega una **5ª columna: email del acreedor**, obligatoria. A diferencia
del formulario individual, acá **no se crean cuentas nuevas
automáticamente** — el email tiene que coincidir con un acreedor ya
cargado en el sistema, o se rechaza la fila (y por lo tanto todo el lote de
filas pegadas, mismo criterio "todo o nada" que ya tiene el importador). La
razón: con datos pegados de una planilla, un typo en el email crearía
silenciosamente una cuenta de acreedor basura sin que nadie lo note —
exactamente el riesgo de "carga errónea" que Gabriel señaló al aprobar el
importador la primera vez. Si el acreedor todavía no existe, primero se lo
crea (a mano, en Usuarios, o dinámicamente al cargar un lote individual) y
recién después se lo puede usar en una importación masiva.

`parsearLoteImportado` (función pura, sin acceso a base de datos) valida que
la celda de email no esté vacía y tenga forma de email (regex simple, mismo
nivel de validación que ya aplica a los demás campos) — no puede validar que
exista, eso requiere una consulta.

`importarLotes` (Server Action), después de parsear con éxito: junta todos
los emails distintos de las filas, consulta
`profiles.select('id, email').eq('role', 'acreedor').in('email', [...])`,
arma un mapa email→id. Si algún email no resuelve a ningún acreedor
cargado, se rechaza el lote completo con un mensaje que lista los emails
que no coincidieron. Si todos resuelven, se insertan los lotes con su
`acreedor_id` ya resuelto.

## Fuera de alcance de esta tanda

- Crear cuentas nuevas de acreedor automáticamente durante la importación
  masiva — deliberadamente no, por el riesgo de carga errónea explicado
  arriba.
- Backfill retroactivo de `acreedor_id` en lotes que ya existen sin acreedor
  asignado — se corrige a mano por Gabriel desde el detalle de cada lote, no
  es parte de esta tanda.
- Migrar el resto de los flujos "cliente con varios lotes" / "monto
  confirmado manda" / etc. — tandas aparte ya identificadas.

## Testing

- Unitario: `lib/lotes/validar-seleccion-acreedor.ts` (existente vs. nuevo
  vs. inválido); actualizar `parsear-importacion.test.ts` para la 5ª
  columna (email de acreedor válido, vacío, con formato inválido).
- E2E, en `tests/e2e/` (archivo nuevo o extendiendo uno existente, a
  decidir en el plan):
  - Crear lote eligiendo un acreedor ya existente de la lista.
  - Crear lote eligiendo "+ Crear nuevo acreedor": se crea la cuenta
    (verificar `profiles` con `role='acreedor'` y el `email` cargado) y el
    lote queda con ese `acreedor_id`.
  - Crear lote sin elegir ningún acreedor → rechazado.
  - Importar con email de acreedor que coincide con uno existente → OK.
  - Importar con email de acreedor que no coincide con nadie → rechaza todo
    el lote, con mensaje claro.
- Regresión completa (build + unitarios + e2e x2) antes de cerrar, mismo
  criterio que todas las tandas anteriores.
