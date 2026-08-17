# Vender — cuotas/documento con JS acotado + reordenar creación de cuenta — Diseño

**Origen:** Gabriel probó en vivo el flujo de "modo automático/manual" recién
construido (spec/plan del 15/08/2026) y encontró 3 problemas de UX reales:

1. El documento firmado solo se pedía en el "paso 2" (carga de montos) del
   modo manual — se podía avanzar del paso 1 sin haberlo cargado todavía.
2. No había forma de volver de "cargar montos manuales" a automático sin
   perder todo lo tipeado — solo estaban los links que sacan del flujo
   entero ("Volver a lotes"/"Volver al lote").
3. Se había tenido que construir un mecanismo (`clienteNuevoId`) para que
   el segundo submit del flujo manual no "redescubriera" por email la
   cuenta de un comprador nuevo que el propio flujo acababa de crear en el
   primer submit — bug real que apareció porque la cuenta se creaba
   demasiado temprano (antes de validar documento/montos), no al final.

## Estado actual (a reemplazar)

`app/admin/lotes/[id]/vender/page.tsx` + `actions.ts` implementan hoy un
flujo de hasta 3 pasos por redirect (elegir modo/cuotas → cargar montos +
documento → confirmar balance), reusando query params para preservar
datos entre pasos, con el mecanismo `clienteNuevoId`/`esClienteNuevo` para
evitar que un cliente recién creado se detecte como ajeno en un paso
posterior del mismo flujo.

## Diseño

### Componente de cliente acotado

Nuevo archivo `app/admin/lotes/[id]/vender/CuotasYDocumento.tsx`,
`"use client"`, siguiendo el único precedente ya existente en el proyecto
para este patrón (`app/admin/lotes/[id]/BotonEliminarLote.tsx`: componente
chico, vive junto a la página que lo usa, recibe props simples, sin
lógica de red propia). No se toca ningún otro archivo del proyecto para
introducir este patrón — sigue siendo la segunda vez que se usa un client
component en todo SIMA, acotado a esta sección puntual.

El componente reemplaza los inputs de "cantidad de cuotas", el selector
Automático/Manual, los campos de monto por cuota y el input de documento
firmado — todos DENTRO del mismo `<form action={venderLoteConId}>` que ya
existe hoy. No hace ningún `fetch` ni llama a la Server Action por su
cuenta: solo mantiene estado local (React `useState`) para decidir qué
campos mostrar y con qué valores. Al apretar "Confirmar venta", el
navegador junta todos los campos (los del componente + los de siempre:
nombre, email, fecha) en un solo `FormData` y lo manda al Server Action,
igual que ya pasa hoy con el resto del formulario.

Comportamiento:
- Cantidad de cuotas y el radio Automático/Manual quedan dentro del
  componente (para que pueda reaccionar a cambios sin recargar página).
- Modo Manual + cantidad de cuotas > 0 → aparecen N campos de monto al
  instante (client-side), con el precio de lista como referencia y un
  panel de balance que se actualiza EN VIVO mientras se tipea (suma
  cargada, precio de lista, la seña ya registrada si la hay, la
  diferencia) — sin necesidad de ningún paso ni redirect para verlo.
- Volver a Automático → los montos se recalculan solos (precio total /
  cantidad de cuotas, mismo criterio que `calcularMontoCuota`/
  `generarCuotas` ya usan del lado del servidor) sin perder nombre/email/
  fecha ya tipeados (esos campos no viven en este componente, no se
  tocan).
- El input de documento firmado pasa a tener `required` nativo del
  navegador — a diferencia de las fotos de DNI de reservar (que a veces
  son obligatorias y a veces no, según el estado civil), acá SIEMPRE es
  obligatorio en cualquier modo, sin ninguna excepción condicional, así
  que expresarlo con `required` es válido y correcto.

### Reordenamiento en `venderLote` (Server Action)

Como todo llega en un solo envío ahora, el orden pasa a ser:

1. Validar campos básicos (nombre, email, cantidad de cuotas, fecha) —
   sin cambios respecto a hoy.
2. Buscar si el email ya tiene cuenta — si hace falta confirmación
   explícita del admin, se corta acá con el mismo cartel de siempre
   (pantalla aparte, sin JS, sin cambios en ese mecanismo), preservando
   nombre/email/cantidad de cuotas/fecha/modo/montos ya tipeados vía
   query params (mismo mecanismo de preservación ya usado en el proyecto)
   para que el componente de cliente los recupere como estado inicial al
   recargar.
3. Si el modo es manual, validar que todos los montos estén completos y
   sean números válidos no negativos.
4. Validar y subir el documento firmado (una sola vez, siempre, sea cual
   sea el modo) — recién acá, con todo lo demás ya validado.
5. Recién ACÁ se resuelve el cliente: si ya existía y fue confirmado, se
   reusa esa cuenta (completando datos faltantes, igual que hoy); si es
   nuevo, se invita y se crea el `profile` en este mismo paso — nunca
   antes.
6. Armar las cuotas (`generarCuotas` o `generarCuotasManual` según modo).
7. Claim atómico del lote + insert de cuotas + descuento de seña vía
   FIFO — sin cambios.

Con este orden, `clienteNuevoId`, `esClienteNuevo` y
`confirmadoPorRecienCreado` dejan de existir por completo: nunca hay una
cuenta "a medio crear" que un paso posterior del mismo flujo tenga que
reconocer, porque no hay pasos posteriores — todo lo que puede fallar
(documento, montos) ya se validó antes de tocar la cuenta del comprador.
También deja de hacer falta la validación de que `documentoFirmadoPath`
apunte al lote correcto (agregada en la revisión final de la tanda
anterior) — ya no viaja como campo oculto entre pasos, se sube y se usa
en la misma request.

### Lo que NO cambia

- El aviso de "ya existe una cuenta con ese email" sigue siendo una
  pantalla aparte, server-rendered, con su propio submit — sigue
  recargando la página. Si le toca a un admin, va a tener que volver a
  adjuntar el documento (limitación del navegador: un `<input
  type="file">` nunca se puede prellenar), pero cantidad de
  cuotas/modo/montos se recuperan solos vía la preservación por query
  params ya existente.
- La subida del documento en sí sigue pasando por el Server Action
  (`subirDocumentoFirmado`, sin cambios) — no se toca acá el límite de
  4.5 MB de Vercel ya anotado como pendiente aparte en
  `Notas_Decisiones_SIMA.txt`.
- El límite de 15 MB (`excedeTamanioMaximo`/`MAX_ARCHIVO_MB`) y el resto
  de las validaciones del documento no cambian.

### Fuera de alcance (anotado para el futuro, no en esta spec)

- Convertir el aviso de "cliente existente" en algo que tampoco recargue
  la página (un chequeo async al escribir/perder foco del email, con un
  cartel de confirmación superpuesto en la misma pantalla en vez de un
  redirect) — Gabriel lo pidió explícitamente como pendiente futuro, no
  para esta tanda. Ya anotado en `Notas_Decisiones_SIMA.txt`.
- Subida de archivos directo a Supabase Storage desde el navegador (tema
  aparte, relacionado al límite de Vercel, ya anotado por separado).

## Testing

Como el documento firmado pasa a tener `required` nativo sin ninguna
excepción condicional, no hay ningún camino alcanzable desde un navegador
real para probar el rechazo del servidor por documento faltante (el
navegador bloquea el envío antes de que llegue al servidor) — mismo
aprendizaje que ya tuvimos hoy con el campo email al reservar. El chequeo
del lado del servidor se mantiene en el código como defensa igual (por si
la request no pasa por un navegador real), pero no lleva un test e2e
dedicado a esa combinación puntual.

Tests a cubrir (nuevos o adaptados de los que ya existen en
`tests/e2e/vender-cuota-manual-documento.spec.ts`):
- Modo automático: vender con documento adjunto crea las cuotas iguales
  (adaptar el existente, ya no hay pasos intermedios que esperar).
- Modo manual: cargar montos distintos, ver el balance en la misma
  pantalla (ya no en un redirect aparte), confirmar, verificar cuotas
  exactas.
- Modo manual + cliente existente: confirmar que al volver de la
  pantalla de "cliente existente", los montos ya tipeados se recuperan
  solos.
- Volver de Manual a Automático sin perder nombre/email ya tipeados y
  viendo los montos recalculados.
- El link "Ver documento firmado" en el detalle del lote — sin cambios,
  ya cubierto.

Los tests existentes de `pase-a-vendido.spec.ts`, `vender-datos-cliente.spec.ts`
y `cliente-varios-lotes.spec.ts` deberían seguir pasando sin cambios de
comportamiento — usan el modo automático de punta a punta, que sigue
siendo un solo submit como siempre.
