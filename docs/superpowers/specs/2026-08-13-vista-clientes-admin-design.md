# Diseño: Vista de clientes desde Admin

**Proyecto:** SIMA Inmobiliaria (cliente: Nicolás Saieg)
**Fecha:** 2026-08-13
**Estado:** Aprobado por Gabriel (WHAPIGEN) por chat.

## Contexto

Gabriel pidió que el administrador (Nicolás) pueda ver las cuentas de sus
clientes, resetearles la contraseña, y eliminar una cuenta cuando corresponda.
Hoy no existe ninguna pantalla para esto: un cliente solo es visible
indirectamente, a través del lote que compró.

"Modificar deuda" (que también se pidió en la misma conversación) queda
explícitamente fuera de esta tanda — toca el motor de pagos/imputaciones y
necesita su propio diseño. Documentado como pendiente futuro en memoria
(`sima_pase_a_vendido_pendientes.md`), no se toca acá.

## Decisión

### 1. `/admin/clientes` — listado

Página nueva, exclusiva de `administrador` (mismo criterio que "invitar
staff": esto no es visible ni accesible para `acreedor`). Tabla con Nombre,
Email, Cantidad de lotes, y link "Ver detalle" por fila. Sin alta manual —
los clientes se siguen creando solo vía "Vender lote" (`venderLote`), eso no
cambia. Se agrega "Clientes" a `NavAdmin`, visible solo para `administrador`.

### 2. `/admin/clientes/[id]` — detalle

- Nombre y email del cliente.
- Lista de sus lotes (identificador, moneda, estado, saldo pendiente total
  por lote — mismo cálculo que ya usa `/portal-cliente`), cada uno con link
  al detalle real en `/admin/lotes/[id]` (no se duplica esa pantalla).
- Formulario "Resetear contraseña": un único input de texto (no
  enmascarado, a propósito — así el admin puede leérsela al cliente por
  teléfono/WhatsApp al asignarla), validación de mínimo 6 caracteres
  (mínimo real de Supabase Auth), submit llama
  `admin.auth.admin.updateUserById(clienteId, { password })`. Redirige al
  mismo detalle con un mensaje de confirmación (`?ok=...`, mismo patrón que
  ya usa `?error=...` en el resto del proyecto).
- Botón "Eliminar cuenta": reutiliza el componente `BotonEliminarUsuario`
  ya existente (`app/admin/usuarios/BotonEliminarUsuario.tsx`) tal cual —
  es genérico, no hace falta duplicarlo.

### 3. Reglas de eliminación: FK real, no un chequeo de "sin deuda"

`eliminarCliente(clienteId)` sigue el mismo patrón exacto que
`eliminarUsuarioStaff` (`app/admin/usuarios/actions.ts`): llama
`admin.auth.admin.deleteUser(clienteId)` sin ningún chequeo previo. Si el
cliente tiene cualquier lote (`lotes.cliente_id`) o pago (`pagos.cliente_id`)
asociado, la restricción de clave foránea real de Postgres rechaza el
borrado, y se muestra el mismo mensaje amigable que ya usa
`eliminarUsuarioStaff` ("todavía está referenciada en lotes, reservas o
pagos existentes").

Confirmado explícitamente por Gabriel: no hace falta un chequeo separado de
"sin deuda" — la restricción de FK ya es más estricta (también protege a un
cliente que terminó de pagar pero cuyo lote le sigue asignado), y eso es lo
que se quiere. En la práctica, hoy esto significa que solo se pueden borrar
cuentas que nunca llegaron a tener ningún lote (ej. una invitación con email
equivocado). No existe ningún flujo para desvincular un lote vendido de su
cliente — eso queda documentado como pendiente futuro, no se construye acá.

### 4. Server Actions nuevas — `app/admin/clientes/actions.ts`

- `resetearContrasenaCliente(clienteId, formData)`: `requireAdministrador()`,
  valida longitud >= 6, llama `updateUserById`, redirect con `?ok=` o
  `?error=`.
- `eliminarCliente(clienteId)`: `requireAdministrador()`, llama
  `deleteUser`, catch de la violación de FK con el mensaje amigable
  (idéntico patrón a `eliminarUsuarioStaff`), redirect a `/admin/clientes`.

## Fuera de alcance de esta tanda

- Modificar deuda de un cliente (pendiente futuro, documentado en memoria).
- Cualquier flujo de "rescindir venta" / liberar un lote de un cliente.
- Alta manual de clientes fuera del flujo de venta.
- Enviar la nueva contraseña por email/WhatsApp automáticamente — el admin
  se la comunica él mismo, fuera del sistema.

## Testing

- Unitario: no hace falta ninguno nuevo puro — es orquestación de
  queries/Server Actions, se prueba con e2e contra la base real.
- E2E (`tests/e2e/clientes-admin.spec.ts`, nuevo):
  - Listado muestra clientes con 0, 1 y varios lotes correctamente.
  - Resetear contraseña: el cliente puede loguearse con la contraseña
    nueva después del reset.
  - Eliminar un cliente sin ningún lote asociado: funciona, desaparece del
    listado.
  - Eliminar un cliente CON un lote asociado: rechazado con el mensaje
    amigable, la cuenta sigue existiendo.
  - Un acreedor no puede abrir `/admin/clientes` navegando directo por URL
    (defensa en profundidad, mismo criterio que el resto del proyecto).
- Regresión completa (build + unitarios + e2e x2) antes de cerrar, mismo
  criterio de siempre.
