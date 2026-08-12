# Diseño: Reserva de lote (fase 1 — texto + comprobante de seña)

**Proyecto:** SIMA Inmobiliaria (cliente: Nicolás Saieg)
**Fecha:** 2026-08-11
**Estado:** Aprobado por Gabriel (WHAPIGEN) por chat

## Contexto

Hoy el ciclo de vida de un lote colapsa `disponible → vendido` en un solo
paso (`/admin/lotes/[id]/vender`), aunque el enum `lote_estado` ya contempla
un estado intermedio `reservado` que nunca se usa. Según el documento
original de Nicolás y las decisiones ya confirmadas
(`Notas_Decisiones_SIMA.txt`, puntos 1 y 14), el flujo real tiene una etapa
de **reserva** (seña chica que saca el lote de circulación, la puede cargar
vendedor/administrativo/admin) antes del **pase a vendido** (firma de
boleto/escritura + entrega inicial, exclusivo del administrador — fuera de
esta tanda, ver más abajo).

Este proyecto se decidió construir **en dos tandas** para acotar el riesgo
por entrega, en vez de una sola tanda grande:

- **Tanda 1 (esta)**: los campos de texto de la reserva + el comprobante de
  seña (que ya reutiliza el mecanismo de subida de archivo existente para
  pagos).
- **Tanda 2 (después)**: fotos de DNI (ambos lados), foto de la reserva, y
  los campos condicionales (DNI del cónyuge si es casado, sentencia de
  divorcio si es divorciado).

El resultado final es el mismo en ambas tandas; lo que cambia es el orden y
el tamaño de cada entrega, para poder probarlas y revisarlas por separado.

## Decisiones de esta tanda

1. **Modelo de datos**: tabla nueva `reservas` (no columnas sueltas en
   `lotes`), para no mezclar datos de prospecto (que todavía no es
   `profile`/cliente) con datos del lote, y para conservar historial si una
   reserva cae y el lote se reserva de nuevo con otro prospecto.

2. **`lotes.vendedor_id` deja de asignarse a mano por defecto.** Hasta
   ahora el admin podía asignar un vendedor a cualquier lote desde el
   detalle, sin relación con una reserva real. Eso no coincide con cómo
   trabaja el negocio: los vendedores no tienen lotes propios de antemano,
   ven todos los disponibles, y recién quedan ligados a un lote cuando lo
   reservan. A partir de esta tanda:
   - `vendedor_id` queda `null` hasta que alguien con rol `vendedor`
     reserva ese lote — ahí se autocompleta con quien lo reservó.
   - Si reserva un `cobrador` o el `administrador`, `vendedor_id` queda sin
     asignar (no se fuerza una atribución sin vendedor real involucrado).
   - El selector manual de vendedor en el detalle del lote (`/admin/lotes/[id]`,
     sección "Cobro") se conserva, pero pasa a ser exclusivamente una
     corrección/override manual, no el camino normal.

3. **Alcance de quién puede reservar qué lote**:
   - `vendedor`: cualquier lote en estado `disponible` (no está atado a
     lotes específicos).
   - `cobrador`: cualquier lote en estado `disponible`, sin restricción
     (es personal de oficina, no tiene una columna de asignación propia
     como el vendedor).
   - `administrador` y `acreedor` (solo sobre sus propios lotes, mismo
     chequeo que ya existe): sin cambios respecto a su acceso actual.

4. **Acceso de vendedor/cobrador**: por primera vez estos roles entran a
   `/admin/*` (hoy solo dejan pasar `administrador` y `acreedor`). Se
   reutiliza el mismo árbol de rutas con guards ampliados, en vez de un
   árbol separado — pero acotado a lo mínimo necesario para reservar (ver
   sección de rutas).

5. **`/admin/lotes/[id]/vender` no se toca en esta tanda.** Sigue
   funcionando exactamente igual que hoy (salta directo desde
   `disponible`), a propósito, para no dejar al sistema sin forma de
   vender un lote hasta que exista el rediseño completo. Queda anotado
   como pendiente firme: la próxima tanda ("pase a vendido") tiene que
   exigir que el lote haya pasado primero por `reservado`.

## Modelo de datos

```
create type public.estado_civil as enum ('soltero', 'casado', 'divorciado', 'viudo');
create type public.instrumentacion as enum ('boleto', 'escritura');

create table public.reservas (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes(id) on delete cascade,
  nombre_completo text not null,
  dni text not null,
  domicilio text not null,
  email text not null,
  telefono text not null,
  telefono_alternativo text,
  estado_civil public.estado_civil not null,
  instrumentacion public.instrumentacion,
  monto_sena numeric(14,2) not null,
  moneda_sena public.moneda not null,
  recibido_por uuid references public.profiles(id),
  recibido_por_otro text,
  comprobante_sena_path text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint reservas_recibido_por_check check (
    (recibido_por is not null) or (recibido_por_otro is not null)
  )
);
```

Notas:

- `estado_civil` se carga ya en esta tanda aunque las fotos condicionales
  (DNI del cónyuge / sentencia de divorcio) recién se piden en la tanda 2 —
  así queda el dato listo para esa siguiente etapa.
- `instrumentacion` y `telefono_alternativo` son los únicos campos
  opcionales de la lista original; el resto son obligatorios para poder
  guardar la reserva.
- `instrumentacion` en esta etapa es puramente informativo (qué espera el
  comprador, boleto o escritura), sin ninguna lógica de la reserva atada a
  su valor — no cambia validaciones ni el flujo. La reserva es solo la
  seña; todavía no hay documento firmado. La obligatoriedad real (y
  probablemente la carga del documento firmado en sí) pertenece a la
  tanda de "pase a vendido", que es donde ese boleto/escritura pasa a ser
  un requisito real para poder marcar el lote como `vendido`.
- `monto_sena`/`moneda_sena` sigue el mismo patrón ya usado en
  `pagos.monto_recibido`/`moneda_recibida`: moneda libre, independiente de
  `lotes.moneda`, sin conversión automática.
- `comprobante_sena_path` reutiliza el bucket `comprobantes` que ya existe
  (privado, URLs firmadas), con ruta `reservas/<lote_id>/<timestamp>-<archivo>`.
- `recibido_por` es un selector de personal (administrador/acreedor/vendedor/
  cobrador vía `profiles`); si la seña la recibió alguien sin cuenta en el
  sistema, el formulario permite elegir "Otro" y cargar el nombre en
  `recibido_por_otro`. El constraint exige que se cargue uno de los dos.

## Permisos y rutas

- `lib/auth/require-admin.ts`: nuevas funciones de guard para permitir
  `vendedor` y `cobrador`, acotadas a lo que pueden hacer (no se amplía
  `requireAdmin`/`requireAdministrador` genéricos, que siguen siendo
  exclusivos de `administrador`/`acreedor`).
- `/admin/lotes` (listado): para `vendedor`/`cobrador` se filtra a
  `estado = 'disponible'` únicamente, sin columnas financieras (cuotas,
  cobranza), con un link "Reservar" por fila. Para `administrador`/
  `acreedor` no cambia nada.
- `/admin/lotes/[id]` (detalle completo): sigue exclusivo de
  `administrador`/`acreedor` — `vendedor`/`cobrador` no pueden abrirlo,
  redirect a `/admin/lotes`.
- `/admin/lotes/[id]/reservar` (nueva): formulario de reserva, accesible a
  `administrador`, `acreedor` (solo su lote), `vendedor` y `cobrador`
  (cualquier lote `disponible`). Rechaza si el lote no está `disponible`.
- Nav bar (`app/admin/layout.tsx`): para `vendedor`/`cobrador` se ocultan
  "Pagos" y "Usuarios" — quedan solo "Lotes" y "Mi perfil".

## Acción `reservarLote`

1. Valida rol + acceso al lote según la sección anterior.
2. Valida `lotes.estado === 'disponible'` (si no, error — no se puede
   reservar un lote ya reservado o vendido).
3. Sube el comprobante al bucket `comprobantes`.
4. Inserta la fila en `reservas`.
5. Actualiza `lotes`: `estado = 'reservado'`, y `vendedor_id = user.id`
   únicamente si `profile.role === 'vendedor'` (si no, no se toca).

Incluye el mismo patrón de manejo de errores por `redirect` con
query param que ya usan `venderLote`/`confirmarPago`.

## Fuera de alcance de esta tanda

- Fotos de DNI (ambos lados), foto de la reserva, DNI del cónyuge, sentencia
  de divorcio → tanda 2, mismo lote de trabajo (`reservas`), solo se agregan
  columnas de `path` de archivo.
- Cancelar una reserva / volver un lote de `reservado` a `disponible` — no
  fue pedido, se anota como pendiente por si surge la necesidad.
- Rediseño de `/admin/lotes/[id]/vender` para exigir `reservado` primero,
  con captura de boleto/escritura y entrega inicial → tanda separada ya
  identificada ("pase a vendido").
- Caja/efectivo del cobrador y motor de comisiones del vendedor → ya
  estaban marcados como fuera de alcance en el documento de decisiones
  (0% construido).

## Testing

Mismo patrón que las tandas anteriores (unitarios + Playwright, todo en
verde antes de dar la tanda por terminada):

- Reservar como `vendedor`, como `cobrador`, como `administrador`, como
  `acreedor` (sobre su propio lote y sobre uno ajeno — debe rechazar este
  último).
- Intentar reservar un lote que no está `disponible` — debe rechazar.
- Subida de comprobante de seña y verificación de que `vendedor_id` se
  autocompleta solo cuando reserva un vendedor.
- Verificar que `vendedor`/`cobrador` no puedan abrir `/admin/lotes/[id]`
  ni ver "Pagos"/"Usuarios" en la nav.
- Selector "Otro" de `recibido_por` con texto libre.

Además, **antes de dar la tanda por cerrada se corre toda la suite
completa del proyecto** (no solo los tests nuevos), para confirmar que
nada de lo construido en tandas anteriores (cuentas de cobro, visibilidad
acotada acreedor-vendedor, confirmación de pagos acotada, etc.) se rompió
con los cambios de permisos y de `vendedor_id`.

## Principio de UX a aplicar durante la implementación

Pensar cada pantalla nueva (o los guards que ocultan partes de una
pantalla existente) desde el punto de vista de una persona real usándola
en el día a día — vendedor o cobrador con poca paciencia para pantallas
confusas — no solo desde "cumple la regla de permisos". Concretamente:

- Si a un vendedor/cobrador se le oculta algo (Pagos, Usuarios, el detalle
  financiero de un lote), que la navegación que le queda tenga sentido por
  sí sola, no que se sienta una versión recortada o rota de la de admin.
- Mensajes de error claros en español llano cuando se rechaza una reserva
  (lote no disponible, lote ajeno, falta el comprobante), no errores
  técnicos crudos.
- El selector "Otro" de `recibido_por` no debe obligar a un click extra
  innecesario en el caso común (que la reciba quien está logueado).
