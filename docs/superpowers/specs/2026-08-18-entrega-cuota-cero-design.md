# "Entrega" (cuota cero / anticipo al boleto) — Diseño

**Fecha:** 2026-08-18
**Estado:** Todas las decisiones cerradas por Gabriel y Nicolás en conversación directa (punto 34
de Notas_Decisiones_SIMA.txt). Avanzar directo a plan + ejecución, sin revisión de spec.

## Contexto (punto 34 de Notas_Decisiones_SIMA.txt)

Nicolás entrega un monto adicional al firmar el boleto de compraventa (además de la seña ya
cobrada al reservar). Ese monto — la "entrega" — reduce lo que efectivamente queda financiado en
cuotas, pero hoy no hay forma de registrarlo: solo existe la seña (`motivo: 'sena'`, descontada vía
FIFO de las primeras cuotas al vender).

Reserva y venta son dos momentos separados y ya existentes en el sistema (`reservarLote` /
`venderLote`) — la entrega pertenece siempre al segundo, nunca a un momento propio.

## Alcance

- Campo nuevo "Entrega" en el formulario de `venderLote` (`app/admin/lotes/[id]/vender/`),
  opcional, monto en la moneda del lote.
- Se registra como un `pago` propio (motivo nuevo `'entrega'`, estado `confirmado` de
  entrada — el admin la carga él mismo, no requiere confirmación cruzada, mismo criterio que la
  seña) — **sin imputación FIFO a ninguna cuota** (a diferencia de la seña).
- Fuera de alcance, decisión explícita de Gabriel: no tocar `calcularMontoCuota` / `generarCuotas`
  en ningún modo. El modo automático sigue calculando cuotas parejas sobre el `precio_total`
  completo, sin conocer la entrega — "sería muy raro que lo utilicen" con entrega de por medio,
  y no vale la pena la complejidad. El modo manual ya resuelve esto solo: Nicolás tipea el monto
  de cada cuota a mano, ya sobre el saldo que quiere financiar después de descontar la entrega.

## Modelo de datos

Reusa `pagos` tal cual. Solo agrega un valor al enum ya existente `motivo_pago` (mismo patrón que
`0024_pagos_ajuste_correccion.sql` agregó `'ajuste'`):

```sql
alter type public.motivo_pago add value 'entrega';
```

No hace falta ninguna tabla ni columna nueva.

## Dónde se carga y cómo se guarda

En `app/admin/lotes/[id]/vender/CuotasYDocumento.tsx` (componente cliente que ya maneja
cantidad de cuotas / modo / montos / el panel "Balance"), se agrega:

- Un input numérico nuevo `name="entregaMonto"`, opcional (vacío = sin entrega, equivalente a 0),
  no negativo. Ubicado junto al resto del formulario, antes del panel "Balance".
- El panel "Balance" ya existente pasa a incorporar la entrega en su cálculo informativo:
  - Modo automático: sin cambios (sigue mostrando precio de lista y cuota pareja, la entrega no
    lo afecta — coherente con la decisión de no tocar ese modo).
  - Modo manual: la línea "Diferencia respecto al precio de lista" pasa a comparar
    `sumaManual + entrega` contra `precioTotal` (hoy compara solo `sumaManual` contra
    `precioTotal`, lo cual daría una diferencia negativa confusa una vez que Nicolás empiece a
    tipear cuotas ya net-of-entrega). Se agrega una línea "Entrega ingresada: X" junto a la de
    "Seña ya registrada" que ya existe ahí.

En `app/admin/lotes/[id]/vender/actions.ts` (`venderLote`), se agrega, análogo al bloque que ya
existe para la seña (líneas ~359-425) pero sin el loop de FIFO/imputaciones:

- Se lee y valida `entregaMonto` del formData (si viene vacío, se trata como "sin entrega" y no se
  hace nada; si viene con texto, tiene que ser un número finito >= 0 o se corta con
  `redirectVenderConError`, mismo patrón que la validación de montos manuales). Se agrega también
  a `construirParamsPreservados` para que sobreviva a un redirect con error, igual que el resto de
  los campos del formulario.
- Después de que las cuotas ya se crearon exitosamente (mismo punto donde hoy se dispara el bloque
  de la seña), si `entregaMonto > 0`, se inserta una fila en `pagos`:
  ```ts
  await admin.from('pagos').insert({
    cliente_id: clienteId,
    lote_id: loteId,
    monto: entregaMonto,
    moneda: loteActual!.moneda,
    motivo: 'entrega',
    estado: 'confirmado',
    confirmado_admin_por: adminUser!.id,
    confirmado_admin_at: new Date().toISOString(),
  })
  ```
  Sin `comprobante_path` (nullable, no aplica — el respaldo de la entrega es el propio documento
  firmado que ya se sube en este mismo formulario). Sin loop de imputaciones — a diferencia de la
  seña, la entrega nunca se reparte cuota por cuota.
- Si el insert falla, mismo criterio que el resto de los errores post-venta ya existentes en esta
  función (seña, cuotas): la venta ya se completó, se redirige con un mensaje de error explícito
  indicando que la venta quedó bien pero la entrega no se pudo registrar, para revisión manual —
  no se intenta revertir la venta.

## Visualización

`app/admin/pagos/page.tsx` línea 240 ya mapea `motivo` a una etiqueta legible
(`'sena'` → `'Seña'`, `'ajuste'` → `'Ajuste'`, default `'Cuota'`). Se agrega `'entrega'` →
`'Entrega'` a esa misma expresión. No hace falta ningún cambio en el detalle de lote — la entrega
aparece en la lista general de pagos del cliente/lote igual que ya sucede con la seña y con los
ajustes, sin necesitar una sección dedicada nueva.

## Testing

Casos e2e a cubrir (extendiendo el patrón ya usado en `pase-a-vendido.spec.ts` /
`vender-datos-cliente.spec.ts`):

1. Vender un lote reservado cargando una entrega > 0 en modo manual: la venta se completa, aparece
   un pago con motivo "Entrega" por el monto correcto en `/admin/pagos`, y ese pago NO tiene
   ninguna fila en `pago_imputaciones` (a diferencia de la seña).
2. Vender sin cargar entrega (campo vacío): la venta se completa igual, sin ningún pago de motivo
   "entrega" creado.
3. Vender con entrega + seña ya registrada en la reserva: ambos pagos quedan creados, la seña sigue
   imputándose vía FIFO a las cuotas (sin cambios respecto al comportamiento ya existente) y la
   entrega queda aparte, sin imputar.
4. Validación: cargar un valor no numérico o negativo en "Entrega" corta con un mensaje de error
   sin completar la venta, preservando el resto de los datos ya tipeados en el formulario (mismo
   patrón que la validación de montos manuales ya cubierta en tests existentes).
