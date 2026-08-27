# Row Level Security — diseño y estado (27/08/2026)

## Por qué esto quedó en "preparado, no aplicado"

Arranqué esta tarea de noche, sin Gabriel disponible para responder preguntas.
Al ir a aplicar la migración me encontré con que **el MCP de Supabase sigue
sin token válido** (`Unauthorized. Please provide a valid access token...` en
`list_tables`, `execute_sql` y `apply_migration` por igual) — el mismo
problema ya documentado en la memoria del proyecto desde el 19/08
([[feedback_verificar_proyecto_supabase]]). Revisé `.mcp.json` del repo: solo
tiene configurado `notionApi`, así que el servidor `supabase` viene de la
config global de Claude Desktop/Code de Gabriel, fuera de este repo — no es
algo que yo pueda arreglar desde acá. Tampoco hay Supabase CLI ni `psql` en
este entorno, y el proyecto no tiene el paquete `pg` como para armar una
conexión Postgres directa por afuera del MCP.

Con esto, aplicar y **probar** RLS esta noche es imposible en los hechos, más
allá de qué tan bien diseñadas estén las políticas. Y esto no es un cambio
cualquiera: mal aplicado puede dejar a Nico bloqueado del sistema en vivo
mañana. Así que en vez de escribir algo a ciegas y dejarlo aplicado sin poder
correr el suite de e2e como red de seguridad, dejé:

1. La migración completa lista: [`supabase/migrations/0047_row_level_security.sql`](../../../supabase/migrations/0047_row_level_security.sql)
2. Este documento con el razonamiento tabla por tabla (para que aplicarla no
   sea un acto de fe, ni para mí ni para Gabriel)
3. El checklist de abajo, que hay que correr completo ANTES de dar esto por
   terminado

**Para desbloquear:** Gabriel necesita refrescar el token del MCP de Supabase
en la configuración de Claude Desktop/Code (fuera de este chat — es config de
la app, no del repo). Una vez que `mcp__supabase__list_tables` responda bien,
sigo yo solo desde el paso 1 del checklist.

## Principio de diseño

Estas políticas **no inventan reglas nuevas** — replican en la base de datos
lo que `lib/auth/require-admin.ts` y cada Server Action ya exigen hoy a nivel
de aplicación. El objetivo es blindar contra el escenario ya identificado
antes ([[project_sima_despliegue_vercel_github]]): la clave
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` es necesariamente pública una vez
desplegado, y hoy el rol `anon` de Postgres tiene CRUD completo sobre las 19
tablas de `public` porque RLS está deshabilitada. Esto es defensa en
profundidad, no un cambio de quién puede hacer qué.

`createAdminClient()` (service role) sigue bypaseando todo esto siempre, por
diseño ([[reference_rls_no_bloquea_migraciones_ni_admin]]) — varias
mutaciones importantes (crear lote, vender, reservar, alta de usuario,
`registrarPago` del cliente) ya corren enteramente por ahí, así que quedan
fuera del radio de esta migración.

### Helper `mi_rol()`

Función `SECURITY DEFINER` que lee `profiles.role` del usuario autenticado.
Es necesaria para evitar recursión: una política de `profiles` que hiciera
`select role from profiles where id = auth.uid()` como subquery normal
volvería a evaluar la política de `profiles` sobre sí misma. Con
`SECURITY DEFINER` la lectura interna de la función ignora RLS.

### `profiles`: el caso más delicado

La política de `UPDATE` sola permite que cualquiera edite su propia fila (mi
perfil / portal-cliente mi-perfil), pero `WITH CHECK` no distingue columnas:
sin nada más, un cliente podría hacer `UPDATE profiles SET role =
'administrador' WHERE id = auth.uid()` y esa fila pasa el check (sigue siendo
"su propia fila"). Lo bloqueo con un trigger (`evitar_cambio_de_rol_no_admin`)
en vez de privilegios por columna, porque los privilegios de columna en
Postgres son por rol de conexión (`authenticated`, el mismo para todos los
usuarios logueados vía PostgREST) y no pueden distinguir "mi propia fila" de
"la fila de otro" — un trigger sí puede.

## Tabla por tabla (grounding en código real, no supuesto)

| Tabla | SELECT | INSERT/UPDATE/DELETE | Evidencia |
|---|---|---|---|
| `profiles` | propia fila, o cualquier staff (admin/acreedor/vendedor/cobrador) ve cualquiera | propia fila o admin; rol protegido por trigger | dropdowns de acreedor/vendedor en `admin/lotes/[id]/page.tsx`, `admin/clientes/page.tsx` |
| `lotes` | admin/cobrador: todos. acreedor/vendedor: propios + `lote_participantes`. cliente: `cliente_id = self` | insert admin-only; update admin/vendedor/cobrador; delete admin | `app/admin/lotes/actions.ts:137` (`rolesConAcceso`), `app/admin/lotes/page.tsx:100-131` |
| `cuotas` | cascada desde `lotes` visibles | update admin/acreedor (confirmación de pago toca `saldo_pendiente`); insert/delete admin | `app/admin/pagos/actions.ts` `confirmarPago`/`editarMontoPago`, ambas con `createClient()` plano |
| `pagos` | cliente propio, o cascada desde `lotes` visibles (cubre el caso "acreedor sin relación no ve el pago") | insert cliente propio o admin (ajustes); update admin/acreedor; delete cliente propio si aún no confirmado | `pagos-acotados-por-acreedor.spec.ts`, `BotonEliminarPago.tsx` + `eliminarPago()` de esta misma sesión |
| `pago_imputaciones` | cascada desde `pagos` | insert admin/acreedor (ledger, sin update/delete) | `confirmarPago`/`editarMontoPago` insertan con el cliente plano |
| `cuentas_externas(_movimientos)` | todo staff | write admin-only, salvo el INSERT de movimientos (admin/acreedor, dispara desde `confirmarPago`) | `confirmarPago` inserta el crédito cuando el lote redirige a cuenta externa |
| `lote_participantes`, `lote_distribucion_objetivos`, `cuota_distribuciones` | cascada desde `lotes`/`cuotas` | admin-only | "un cobrador no ve destinos" (comentario en `admin/lotes/[id]/page.tsx:542`) |
| `lote_documentos` | cascada | insert admin/acreedor, delete admin | `documentos-lote.spec.ts`: "un acreedor puede subir... admin elimina" |
| `lote_historial_estados` | cascada | insert admin-only (insert-only) | flujo de rescindir/volver a disponible, admin-gated |
| `ajustes_indexacion` | cascada | write admin/cobrador | mismo criterio que `indices_valores` |
| `indices_valores` | todo staff | insert/update admin/cobrador, delete admin | comentario `requireAdminOCobrador` en `require-admin.ts:136` |
| `cotizaciones_dolar` | **todos**, incluido cliente | write: todo staff | `portal-cliente/lotes/[id]/page.tsx` y `pagar/[id]/page.tsx` la leen directo |
| `cotizaciones_dolar_historial` | todo staff (sin cliente) | insert todo staff | comentario explícito en migración 0044: "no se le muestra al cliente" |
| `loteos` | todo staff | admin-only | `admin/loteos/actions.ts` |
| `reservas` | todo staff | insert admin/vendedor/cobrador; update/delete admin o el propio `created_by` | `admin/lotes/actions.ts:137,158` |
| `movimientos_cuenta_corriente` | admin ve todo, el resto solo lo propio (`profile_id = self`) | insert admin/acreedor (Debe automático corre dentro de `confirmarPago` como acreedor) | comentario en `require-admin.ts:160-166`, `generarDebeAutomaticoSiCorresponde` |

### Rutas que NO dependen de estas políticas (van por `createAdminClient`)

`app/admin/lotes/actions.ts`, `[id]/vender/actions.ts`, `[id]/reservar/actions.ts`,
`[id]/actions.ts` (marcar prejudicial), `loteos/actions.ts`, `clientes/actions.ts`,
`usuarios/actions.ts`, `participantes-actions.ts`, `portal-cliente/pagar/[id]/actions.ts`
(`registrarPago`), `portal-cliente/pagos/[id]/comprobante/actions.ts`. Si algo
se rompe después de aplicar RLS, **no va a ser por acá** — el sospechoso
número uno es siempre una lectura de página que sigue usando `createClient()`
plano contra una tabla donde le puse una política más estricta de lo que el
código realmente necesita.

## Checklist para aplicar (en orden, sin saltear pasos)

1. Confirmar que el MCP de Supabase responde (`list_tables` sin error de
   `Unauthorized`) y que apunta al proyecto correcto
   ([[feedback_verificar_proyecto_supabase]]).
2. Aplicar `0047_row_level_security.sql` completa con `apply_migration`.
3. Correr el suite de e2e completo (`npm run test:e2e`, 153 tests) contra el
   proyecto real. Cualquier falla nueva (no la de flakiness ya conocida de
   `cotizacion-dolar.spec.ts` sobre el historial) es una política mal
   calibrada — hay que leer el error, identificar la tabla/rol, y ajustar la
   policy puntual, no aflojar en general.
4. `get_advisors({type: "security"})` — debería salir limpio de "RLS
   disabled" para las 19 tablas; revisar cualquier otro warning que aparezca.
5. Smoke test manual con agent-browser de al menos un flujo por rol
   (administrador, acreedor, vendedor, cobrador, cliente) que no esté ya
   cubierto 1:1 por el suite — en particular el flujo de `confirmarPago`
   como acreedor (es el más profundo: toca `pagos`, `cuotas`,
   `pago_imputaciones`, y a veces `cuentas_externas_movimientos` y
   `movimientos_cuenta_corriente` en la misma llamada).
6. Recién ahí: commit + push, y avisar a Gabriel que RLS quedó activo en
   producción.

No lo marco como "hecho" hasta que el paso 3 (e2e real) haya corrido en
verde. Sin eso, esta migración es una propuesta bien fundamentada, no una
garantía.
