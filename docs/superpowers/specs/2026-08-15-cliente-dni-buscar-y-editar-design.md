# Diseño: DNI/domicilio/teléfono del cliente — búsqueda al reservar y edición

**Proyecto:** SIMA Inmobiliaria (cliente: Nicolás Saieg)
**Fecha:** 2026-08-15
**Estado:** Aprobado por Gabriel (WHAPIGEN) por chat

## Contexto

Dos pedidos de Gabriel, combinados en una sola pieza porque comparten el
mismo modelo de datos:

1. Poder buscar un cliente ya cargado por su DNI al reservar un lote, y
   que se precarguen automáticamente sus datos — esto es exactamente el
   punto 41a ya anotado en `Notas_Decisiones_SIMA.txt`. Motivación
   concreta que dio Gabriel: evitar cargar mal los datos de alguien que
   ya es cliente (por ejemplo, reserva un segundo lote), y poder probar
   de punta a punta el escenario de un mismo cliente con varios lotes.
2. Poder editar los datos de un cliente (nombre, DNI, domicilio,
   teléfono) tanto desde Admin como desde el propio portal del cliente
   — esto es el punto 37 ya anotado ("editar cliente desde admin"),
   ampliado por Gabriel para incluir también la autoedición del cliente.

Estado actual del código (verificado antes de diseñar):

- `reservas`: tiene `dni`, `domicilio`, `telefono`, `telefono_alternativo`
  — una fila nueva CADA VEZ que alguien reserva un lote, sin deduplicar
  por persona.
- `profiles` (rol `cliente`): solo `id`, `role`, `full_name`,
  `created_at`, `email`. Nada de DNI/domicilio/teléfono. La cuenta se
  crea recién cuando el lote pasa de "reservado" a "vendido"
  (`app/admin/lotes/[id]/vender/actions.ts`), copiando en ese momento
  `full_name` y `email` desde el formulario de venta (que a su vez viene
  precargado con los datos de la reserva, pero no los persiste en
  ningún lado más allá de esa reserva puntual).
- Si el email de la venta coincide con un cliente ya existente, ya hay
  un mecanismo (`confirmarClienteExistente`) que pide confirmación
  explícita antes de asociar el lote a esa cuenta, mostrando el nombre
  ya guardado — se reusa y se amplía en este diseño, no se reemplaza.
- `/admin/clientes/[id]` (detalle de cliente en Admin): hoy solo
  muestra nombre + email + lotes con saldo pendiente. No se puede
  editar nada del cliente (solo resetear contraseña o eliminar la
  cuenta).
- `/portal-cliente/mi-perfil`: hoy el cliente solo puede cambiar su
  nombre y su contraseña.

## Modelo de datos

```sql
alter table public.profiles
  add column dni text,
  add column domicilio text,
  add column telefono text;

create unique index profiles_dni_unique on public.profiles (dni) where dni is not null;
```

- Los tres campos son opcionales (`null` permitido) — un cliente viejo
  puede no tenerlos todavía, y no todos los campos hacen falta siempre.
- `telefono_alternativo` queda explícitamente fuera (decisión de
  Gabriel: "no hace falta, ya que no es obligatorio y generalmente no
  tienen").
- El índice único parcial (`where dni is not null`) evita que dos
  cuentas de cliente distintas queden con el mismo DNI — Postgres no
  compara `null` como igual a `null`, así que no molesta a los que
  todavía no lo tienen cargado. Un DNI es un identificador único real
  de una persona; no hay ningún escenario legítimo en el que dos
  clientes distintos deban compartir el mismo valor.

**Backfill único, no recurrente**, para que la búsqueda por DNI sirva
también con clientes ya cargados hoy (no solo con ventas futuras): para
cada `profiles` con `role = 'cliente'` y `dni is null`, buscar la
`reserva` más reciente cuyo `email` coincida con el del cliente, y
copiar `dni`/`domicilio`/`telefono` de ahí si existen. Es una migración
de datos de una sola vez, no un mecanismo que corre después — mencionado
acá para que quede explícito en la revisión, no es lo que pidió Gabriel
originalmente pero sirve directamente al mismo objetivo (que la
búsqueda funcione ya mismo, no recién dentro de unos meses).

## Población automática al vender

`venderLote` (`app/admin/lotes/[id]/vender/actions.ts`) ya resuelve la
reserva más reciente del lote (para la seña) y ya distingue cliente
nuevo vs. cliente existente (por email). Se extiende, sin agregar
ningún campo nuevo al formulario de venta (nombre y email siguen siendo
los únicos inputs ahí):

- **Cliente nuevo:** al crear el `profile`, se copian `dni`,
  `domicilio` y `telefono` directo desde la reserva que originó la
  venta (si la reserva los tiene — siempre los tiene, son obligatorios
  al reservar).
- **Cliente existente:** nunca se pisa un valor que el perfil ya tenga
  cargado — mismo criterio que ya usa el código actual con
  `full_name` ("no se toca... para no pisarlo si el nombre tipeado esta
  vez difiere levemente"). Solo se completan los campos que estén en
  `null`.
- **Aviso de DNI que no coincide:** si el perfil ya tiene un DNI
  cargado y difiere del DNI de la reserva actual, la pantalla de
  confirmación de "cliente existente" (la que ya existe hoy, con el
  nombre encontrado) se amplía para mostrarlo explícitamente: *"El DNI
  de esta reserva ({dni de la reserva}) no coincide con el que ya
  tenía guardado ({dni del perfil}). Se mantiene el guardado; si es un
  error, corregilo después desde la ficha del cliente."* La venta
  sigue su curso con el DNI ya guardado — no se bloquea nada, el aviso
  es solo para que el error quede visible en el momento en vez de
  quedar escondido. Domicilio y teléfono no llevan este aviso (son
  datos que cambian con normalidad, a diferencia de un DNI).

**Choque de DNI con OTRO cliente (no la misma persona):** si el DNI de
la reserva coincide, por typo o coincidencia, con el de un cliente
DISTINTO ya existente (violaría el índice único de arriba), la venta
nunca se bloquea por esto — es una acción de negocio real (vender un
lote) que no puede depender de un dato secundario. Se guarda el DNI
como `null` en ese caso puntual (en vez de fallar el insert/update
completo) y se loguea del lado del servidor para revisión manual —
mismo criterio que ya usa el proyecto para el crédito automático de
cuentas externas (fallo aislado y raro, no se sobre-construye una
bandera visible para el admin, se resuelve a mano si llega a pasar en
la práctica).

## Editar datos del cliente — dos lugares

Mismos 4 campos en los dos lados: nombre, DNI, domicilio, teléfono.
Todos opcionales salvo el nombre (no se puede dejar vacío). Si se
intenta guardar un DNI que ya pertenece a otro cliente, se rechaza con
un mensaje claro (no el error crudo de Postgres).

- **Portal del cliente** (`/portal-cliente/mi-perfil`): se amplía el
  formulario que hoy solo tiene nombre, sumando DNI, domicilio y
  teléfono como campos editables.
- **Admin** (`/admin/clientes/[id]`): se agrega una sección nueva con
  los 4 campos editables. La cabecera de la ficha (que hoy solo muestra
  nombre + email) pasa a mostrar también DNI, domicilio y teléfono si
  están cargados.

## Buscar por DNI al reservar

En `/admin/lotes/[id]/reservar`, arriba del formulario grande de
siempre, un buscador chico y separado:

```
[ DNI ____________ ] [Buscar]
```

Sin JavaScript de cliente: es un `<form method="GET">` puro, que
navega a la misma página con `?dni=XXXXXXXX`. El Server Component ya
recibe ese valor en `searchParams` y hace la búsqueda del lado del
servidor antes de renderizar.

- **Si encuentra un cliente** con ese DNI (`profiles.role = 'cliente'
  and profiles.dni = X`): se muestra un aviso justo debajo del
  buscador — *"Encontramos a {nombre} con este DNI. Sus datos se
  precargaron abajo — revisalos antes de confirmar."* — y el
  formulario grande de reserva aparece con nombre completo, DNI,
  domicilio, teléfono ya precargados (`defaultValue`, totalmente
  editables, nada queda bloqueado). El resto de los campos obligatorios
  de la reserva (comprobante de la seña, fotos de DNI frente/dorso,
  etc.) se siguen cargando siempre desde cero — son específicos de esta
  reserva puntual, no algo que tenga sentido reusar.
- **Si no encuentra nada:** se muestra *"No encontramos ningún cliente
  con ese DNI — completá los datos manualmente."* y el formulario
  queda vacío, exactamente como funciona hoy. No es un error, es el
  camino normal para alguien nuevo.
- **Si no se usa el buscador:** el formulario se comporta exactamente
  igual que hoy, sin ningún cambio.

La reserva que se guarda al confirmar es, como siempre, una fila nueva
en `reservas` — la precarga no escribe nada en el perfil del cliente
en este momento (eso solo pasa al vender, según la sección anterior).

## Límite conocido, aceptado a propósito

Esta búsqueda solo encuentra a alguien que **ya es cliente** (compró al
menos un lote antes, así que ya tiene perfil con DNI cargado). Si
alguien reservó un lote pero nunca llegó a comprarlo, todavía no tiene
ningún perfil creado, así que esta búsqueda no lo va a encontrar —
cubre el escenario real que motivó el pedido (cliente que ya compró,
reservando de nuevo), el otro caso queda para una tanda futura si hace
falta.

## Fuera de alcance

- Buscar por DNI entre gente que reservó pero nunca compró (ver límite
  conocido arriba).
- Teléfono alternativo como campo editable/de búsqueda (decisión
  explícita de Gabriel).
- Cualquier cambio al formulario de venta en sí (sigue pidiendo solo
  nombre y email, sin agregar DNI/domicilio/teléfono como inputs ahí).
- Validar o normalizar el formato del DNI (puntos, guiones, longitud) —
  se guarda tal cual se tipea, mismo criterio que ya usa `reservas.dni`
  hoy.

## Testing

- Vender a un cliente nuevo: su perfil queda con DNI/domicilio/teléfono
  copiados de la reserva.
- Vender un segundo lote a un cliente ya existente cuyo perfil tiene
  esos campos en `null`: se completan con los de esta reserva.
- Vender un segundo lote a un cliente ya existente que YA tiene esos
  campos cargados: no se pisan.
- Vender un segundo lote con un DNI que no coincide con el ya guardado:
  aparece el aviso en la pantalla de confirmación, la venta se
  completa igual, el perfil se queda con el DNI viejo.
- Vender a un cliente nuevo cuyo DNI, por typo, ya pertenece a OTRO
  cliente existente: la venta se completa igual (no se bloquea), el
  perfil nuevo queda con DNI en `null` en vez de fallar.
- Buscar por DNI al reservar: con match (precarga + nombre mostrado),
  sin match (formulario vacío, sin error), sin usar el buscador
  (comportamiento sin cambios).
- Editar los 4 campos desde Admin y desde el portal del cliente, en
  ambos casos: guardado exitoso, y rechazo prolijo si el DNI ya
  pertenece a otro cliente.
- El backfill de una sola vez: corriendo la migración contra datos de
  prueba con clientes viejos sin DNI y con reservas históricas
  coincidentes por email, confirmar que se completan correctamente.
