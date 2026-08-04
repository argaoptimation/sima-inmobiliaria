# Diseño: Cuentas de cobro por lote + gestión completa de lotes

**Proyecto:** SIMA Inmobiliaria (cliente: Nicolás Saieg)
**Fecha:** 2026-08-04
**Estado:** Aprobado por Gabriel (WHAPIGEN) en conversación de brainstorming

## Contexto

Gabriel probó el flujo actual y encontró dos problemas relacionados:

1. Los datos para transferir (alias/CBU/banco) hoy viven en un campo de texto
   libre en `lotes`, cargado a mano en cada lote. Pero en el negocio real esos
   datos pertenecen a una **persona** (el acreedor dueño del lote, el
   vendedor, o el administrador), no al lote — y el destinatario del cobro
   puede cambiar a lo largo de la vida del contrato sin que cambie quién es
   el acreedor o el vendedor del lote. Esto ya estaba anticipado en el
   documento original de Nicolás (`sistema descripcion 15-0726.docx`, sección
   "CUENTAS BANCARIAS": *"puede suceder que el cliente hoy ingrese a su
   cuenta, y cuando quiera transferir, tenga los datos de otra cuenta
   bancaria"*).
2. La gestión de lotes es incompleta: no hay forma de ver el detalle de un
   lote (cuotas, vencimientos, estado de mora), editarlo, ni eliminarlo. Esto
   se detectó al crear un lote de prueba duplicado por error ("prueba 2") sin
   forma de sacarlo del sistema.

Este documento cubre ambos, porque están acoplados: la asignación de
acreedor/vendedor/cuenta de cobro requiere que exista una pantalla de detalle
de lote donde mostrarla y editarla.

No cubre (fuera de alcance, quedan para specs futuras):
- El motor de distribución fijo + porcentual entre acreedores y sus cuentas
  corrientes (ya marcado fuera de alcance en el diseño previo).
- El flujo formal de morosidad: pase manual a "Prejudicial" y bloqueo de
  pagos por sistema. Esta spec solo **muestra** un estado de mora calculado
  (informativo), no lo persiste ni bloquea nada.
- El rediseño del ciclo de vida reserva → contrato/entrega inicial → vendido,
  y los permisos propios del rol vendedor (brainstorming pendiente aparte,
  ya anotado en `Notas_Decisiones_SIMA.txt`).
- Editar `cantidad_cuotas`, `monto_cuota_base` o `fecha_primera_cuota` de un
  lote ya creado (cambiar eso desincroniza las cuotas ya generadas; ese caso
  ya lo cubre el flujo de indexación para lotes en pesos).

## Modelo de datos

**`profiles`**: se agrega `datos_transferencia text` (nullable). Mismo campo
de texto libre que hoy tiene `lotes` (alias, CBU, banco en un solo bloque),
pero ahora pertenece a la persona (administrador, acreedor o vendedor).

**`lotes`**: se agregan cuatro columnas, todas `uuid references profiles(id)`,
nullable:

- `admin_id`, `acreedor_id`, `vendedor_id`: quiénes son las tres partes
  asociadas a ese lote.
- `cuenta_cobro_id`: cuál de esas tres personas recibe la transferencia
  *ahora mismo*. Se puede reasignar en cualquier momento sin tocar quién es
  el acreedor/vendedor del lote (así resolvemos el caso de Nicolás:
  "hoy transferí a esta cuenta, mañana a otra").

Se elimina `lotes.datos_transferencia` (migración `0004`, superada). No hay
datos reales de producción todavía, así que no hace falta migrar contenido —
los lotes de prueba existentes se vuelven a cargar con el nuevo esquema.

Ninguna de las cuatro columnas es obligatoria en `lotes`. Un lote puede
crearse y venderse sin tener aún un acreedor/vendedor/cuenta de cobro
asignados (esto pasa hoy con el flujo de reserva, donde estos datos pueden no
estar definidos todavía). Lo que si es obligatorio: **si se elige una persona
como `cuenta_cobro_id`, esa persona tiene que tener `datos_transferencia`
cargado** — si no lo tiene, no se puede guardar esa asignación (ver
"Validaciones" más abajo).

## Quién carga los datos de transferencia

Autoservicio + control del admin, sin excluirse:

- Se agrega una pantalla `/mi-perfil`, accesible para cualquier usuario de
  staff logueado (administrador, acreedor, vendedor, cobrador), con un
  formulario simple: nombre completo (editable) y datos de transferencia
  (textarea, solo relevante si su rol cobra transferencias). Esto es lo más
  chico que se puede construir para que "cuando le llega el mail para crear
  su usuario, ahí ponga sus datos directamente" — no se bloquea el uso de la
  plataforma si no lo completa, pero queda accesible en todo momento desde un
  link en la barra de navegación.
- El administrador también puede editar el nombre y los datos de
  transferencia de cualquier staff desde `/admin/usuarios` (se agrega un
  formulario de edición inline por fila, con un link directo
  `/admin/usuarios?editar=<id>` para poder llegar ahí con un clic desde otra
  pantalla — ver "Selección rápida sin datos" más abajo).
- Rol `vendedor` hoy cae en una pantalla genérica ("tu rol todavía no tiene
  pantalla propia"). Esa pantalla placeholder se actualiza con un link
  directo a `/mi-perfil`, así el vendedor ya tiene algo útil que hacer al
  loguearse, sin construir todavía su panel completo (eso es parte del
  brainstorming de permisos del vendedor, pendiente aparte).

## Gestión de lotes: detalle, edición y borrado

Se agrega `/admin/lotes/[id]`, la página de detalle que hoy no existe. Desde
la lista de lotes (`/admin/lotes`), cada fila linkea a su detalle.

**Muestra:**
- Datos del lote (identificador, moneda, estado, cliente si está vendido).
- Tabla de cuotas: número, monto, saldo pendiente, vencimiento, y si está
  vencida (vencimiento pasado y saldo > 0).
- Estado de mora del cliente, calculado al vuelo (no se persiste, es
  informativo): **Normal** (0 cuotas vencidas), **Moroso** (1-2 vencidas),
  **Candidato a prejudicial** (más de 2 vencidas) — mismos umbrales que ya
  estaban definidos en el diseño original. No dispara ningún bloqueo; el
  pase formal a Prejudicial con bloqueo de pagos queda fuera de alcance
  (ver Contexto).
- Sección "Cobro": tres selects (Acreedor, Vendedor, Administrador — cada uno
  poblado con los profiles de ese rol) más un cuarto select ("Cuenta de
  cobro actual"), cuyas opciones son únicamente las personas ya asignadas en
  los tres selects anteriores que además tengan `datos_transferencia`
  cargado. Se guarda con un botón "Guardar cobro", independiente del resto
  del formulario.

**Edición:** por ahora, lo único editable de un lote ya creado es el
`identificador` (label libre) y la sección "Cobro" de arriba. El resto de los
campos estructurales (cuotas, monto, moneda) no se tocan desde acá — ver
"Fuera de alcance".

**Borrado:** botón "Eliminar lote" en la página de detalle, con confirmación
del navegador (`confirm()`) antes de enviar. Es una operación protegida: se
bloquea (con mensaje explicando por qué) si el lote tiene algún pago
imputado (`pago_imputaciones` sobre alguna de sus cuotas) — ahí hay guita de
por medio y no se puede borrar el historial así nomás. Si no tiene pagos
imputados, se borra el lote (las cuotas se borran en cascada, ya está
configurado así en el schema). Esto cubre el caso real de Gabriel: sacar un
lote de prueba/duplicado que nunca tuvo pagos.

## Selección rápida sin datos

Cuando alguien arma los selects de "Cobro" en el detalle del lote, cada
`<option>` de persona sin `datos_transferencia` cargado se marca en el texto
(ej. "Juan Pérez — sin datos de transferencia"), así se ve antes de elegir.
Si de todos modos se intenta guardar una `cuenta_cobro_id` sin datos
cargados, la acción rechaza el guardado y devuelve un error con un link
directo a `/admin/usuarios?editar=<id>` para cargarlos ahí mismo, sin perder
el resto de lo que se estaba completando en el lote.

No se construye un formulario dinámico con JavaScript del lado del cliente
para esto (la app hoy es 100% server actions + HTML nativo, sin capa de
interactividad) — la combinación de "opción marcada" + "error con link
directo" da el mismo resultado práctico (rápido, sin tipear de más) sin
sumar una dependencia nueva a la arquitectura.

## Alta de lote: selects en vez de texto libre

`/admin/lotes/nuevo` deja de tener el textarea de "datos para transferir".
Nada se agrega ahí en su lugar: la asignación de acreedor/vendedor/admin/
cuenta de cobro se hace después, desde el detalle del lote (`/admin/lotes/[id]`),
una vez creado. Esto porque un lote recién cargado puede todavía no tener
comprador ni acreedor definido (etapa "disponible"), y forzar esa decisión en
el alta agregaría fricción sin necesidad.

## Cliente: a quién transferir

`/portal-cliente/pagar/[id]` deja de leer `lote.datos_transferencia` y en su
lugar resuelve `lote.cuenta_cobro_id → profiles.datos_transferencia`. Si no
hay `cuenta_cobro_id` asignada (o la persona asignada no tiene datos
cargados, caso que no debería darse por la validación de arriba, pero se
cubre igual), se mantiene el mensaje actual de fallback: "Consultá los datos
de la cuenta con SIMA Inmobiliaria."

## Testing

- Se actualiza `tests/e2e/fixtures/test-data.ts`: el lote de prueba pasa a
  crearse sin `datos_transferencia` (columna eliminada) y se agrega un cuarto
  usuario de prueba con rol `acreedor` con `datos_transferencia` cargado
  desde el vamos, para poder probar el flujo de cobro sin depender de UI de
  autoservicio dentro del mismo test.
- Nuevo spec E2E (`tests/e2e/cuenta-cobro.spec.ts`): admin asigna un acreedor
  con datos cargados como `cuenta_cobro_id` de un lote, el cliente entra a
  pagar esa cuota y ve el `datos_transferencia` de ese acreedor específico
  (no el de otro). Cubre también el camino negativo: intentar guardar una
  `cuenta_cobro_id` de alguien sin datos cargados falla con el error
  esperado.
- El spec existente `pago-flujo-completo.spec.ts` no debería romperse: no
  depende de `datos_transferencia`, solo de que la página cargue.
- `npm test` (vitest) y `npm run test:e2e` (Playwright) deben quedar en
  verde antes de dar la tarea por terminada.

## Fuera de alcance (para specs posteriores)

- Motor de distribución fijo + porcentual entre acreedores y sus cuentas
  corrientes.
- Pase manual a "Prejudicial" con bloqueo real de pagos, plantillas de
  mensajes de cobranza.
- Edición de `cantidad_cuotas` / `monto_cuota_base` / `fecha_primera_cuota`
  de un lote ya creado.
- Rediseño reserva → contrato/entrega inicial → vendido y permisos propios
  del rol vendedor.
