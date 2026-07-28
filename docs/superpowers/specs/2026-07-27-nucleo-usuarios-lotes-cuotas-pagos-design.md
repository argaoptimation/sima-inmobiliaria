# Diseño: Núcleo de datos — Usuarios, Lotes, Cuotas y Pagos

**Proyecto:** SIMA Inmobiliaria (cliente: Nicolás Saieg)
**Fecha:** 2026-07-27
**Estado:** Aprobado por Gabriel (WHAPIGEN) en conversación de brainstorming

## Contexto

Este documento cubre el diseño del núcleo relacional de la plataforma: cómo se
autentican y se dan de alta los usuarios de los 5 roles (administrador,
acreedor, vendedor, cliente, cobrador), cómo se vincula un cliente a un lote,
cómo se estructuran las cuotas (moneda, indexación), y cómo se imputan los
pagos, incluyendo la confirmación cruzada y el aviso al cliente.

No cubre: el motor de distribución fijo+porcentual entre acreedores (ya
diseñado en conversación previa, pendiente de spec propia si hace falta), el
almacenamiento de documentos con backup a Cloudflare R2, ni la integración de
Mercado Pago (fuera de alcance del contrato firmado, upsell futuro).

Fuentes: contrato firmado (`Contrato_Nicolas_Saieg.html`), documento de
requisitos original de Nicolás (`sistema descripcion 15-0726.docx`), y
decisiones tomadas en conversación (ver `Notas_Decisiones_SIMA.txt`).

## Usuarios y acceso

- Los 5 roles inician sesión con **email + contraseña propia**, vía Supabase
  Auth nativo. Incluye recuperación de contraseña ("olvidé mi contraseña")
  sin costo adicional, disponible en plan Free.
- **No existe pantalla de registro pública** para ningún rol.
  - Cuentas de staff (acreedor, vendedor, cobrador): las crea el
    administrador manualmente desde un panel propio.
  - Cuenta de cliente: se crea **automáticamente**, sin intervención manual,
    en el instante en que un lote pasa de estado `reservado` a `vendido`
    (contrato firmado y confirmado). Usa el email que el vendedor cargó
    durante la etapa de reserva. En ese mismo momento se dispara una
    invitación por email para que el cliente configure su contraseña, y la
    cuenta queda vinculada al lote — no hay un paso de vinculación separado.
- Permisos por rol siguen lo definido en el contrato: cliente y acreedor ven
  solo su propio estado de cuenta; cobrador no ve distribución ni cuentas
  corrientes de acreedores; administrador tiene acceso total.

## Lotes: moneda nativa

Cada lote define su moneda al cargarse:

- **USD fijo**: el monto de cada cuota es constante durante toda la vida del
  contrato (salvo refinanciación).
- **Pesos con ajuste por índice**: el monto de una cuota no es un valor fijo,
  es un valor base más cero o más ajustes históricos aplicados (ver
  siguiente sección).

## Indexación de cuotas en pesos

Pedido directo de Nicolás (referencia: estadistica.cba.gov.ar, índice
provincial de Córdoba).

- El porcentaje de ajuste se **carga a mano** por el administrador — el
  sistema no scrapea ni consulta ninguna fuente externa automáticamente.
- Se aplica como una acción manual **por lote/contrato**: el administrador
  dispara "aplicar X% desde tal fecha".
- Esa acción ajusta el **saldo pendiente** de las cuotas de ese contrato
  desde la fecha indicada en adelante. Lo ya pagado y confirmado (con
  confirmación cruzada completa) no se recalcula ni se toca.
- Cada aplicación de ajuste queda registrada en un historial: fecha,
  porcentaje, quién lo cargó. Visible en el detalle del lote/contrato para
  auditoría, y reflejado en el estado de cuenta del cliente para que
  entienda por qué cambió el monto de sus cuotas restantes.

## Imputación de pagos

- **Orden estrictamente FIFO**: un cliente no puede pagar (ni el sistema
  puede imputar) una cuota más nueva mientras exista una cuota más vieja del
  mismo lote con saldo pendiente. Esto viene textual del documento original
  de Nicolás.
- **Pago de más (sobrante)**: el excedente se imputa automáticamente,
  siguiendo el mismo orden FIFO, a las cuotas siguientes. No hay descuento
  de ningún tipo asociado a esto — no confundir con "descuento por pago
  anticipado", que quedó fuera del alcance del contrato.
- **Pago de menos (parcial)**: se acepta sin restricción de monto mínimo. La
  cuota queda con saldo pendiente, y ese saldo sigue contando como "vencida"
  a los efectos del estado de cobranza hasta cubrirse el 100%.
- **Moneda del pago distinta a la moneda nativa del lote**: puede pasar (ej.
  lote en USD, cliente transfiere en pesos). No hay conversión automática —
  quien confirma el pago (acreedor o administrador) asigna manualmente, a
  la vista del comprobante, a qué cuota(s) y por qué monto neto se imputa
  ese pago.

## Confirmación cruzada y aviso al cliente

- Cada pago requiere confirmación de exactamente **dos roles**: el acreedor
  destinatario de la transferencia, y el administrador. Esto ya está
  establecido en la cláusula de alcance del contrato firmado — no es una
  decisión nueva de este diseño.
- Recién cuando ambas confirmaciones están cargadas, el pago se da por
  saldado y se genera el comprobante definitivo.
- El comprobante queda disponible para descarga dentro del portal del
  cliente (ej. indicador de "nuevo" en su próximo ingreso). No hay envío
  automático por WhatsApp — existe un botón manual para que el
  cobrador/administrador lo reenvíe por WhatsApp si el cliente lo pide,
  coherente con que el resto de la mensajería de cobranza (4 estados) es
  también manual, por botón, sin automatización.

## Estado Moroso / Prejudicial con pagos parciales

No se introduce un estado ni una regla nueva. Como una cuota con saldo
parcial sigue contando como "vencida", y el orden de pago es FIFO estricto
(no se puede pagar la cuota siguiente mientras la anterior tenga saldo), una
situación de deuda parcial sostenida en el tiempo escala naturalmente:
después de dos meses de solo pago parcial, ya hay 3+ cuotas vencidas
acumuladas (la parcial más las siguientes bloqueadas), lo cual cruza el
umbral de Prejudicial (más de 2 cuotas vencidas) con la misma regla que ya
usa Nicolás para todo lo demás.

## Fuera de alcance de este documento (para specs posteriores)

- Motor de distribución fijo + porcentual entre acreedores por cuota cobrada.
- Cuentas corrientes de acreedores (débitos/créditos, "otros movimientos").
- Flujo completo de cobranza (4 estados, plantillas de mensaje, panel de
  morosos, pase manual a Prejudicial/Último Aviso).
- Almacenamiento de documentos (DNI, contratos, comprobantes) y backup a
  Cloudflare R2.
- Reventa/rescisión de lote y refinanciación.
- Integración de Mercado Pago (fuera del alcance contractual actual).
