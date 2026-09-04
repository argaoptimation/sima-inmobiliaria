-- Seguridad (04/09, pedido de Gabriel): rate limit propio + log de ingresos.
--
-- intentos_seguridad: respaldo del rate limit en Postgres, no en memoria del
-- proceso -- en un deployment serverless (Vercel) cada invocación puede caer
-- en una instancia nueva, así que un contador en memoria no sería un límite
-- real. Solo se escribe/lee con el cliente admin (service role), nunca
-- expuesto a un usuario -- RLS queda en su default (deny-all) a propósito,
-- no hace falta ninguna policy.
create table intentos_seguridad (
  id uuid primary key default gen_random_uuid(),
  clave text not null,
  accion text not null,
  creado_at timestamptz not null default now()
);

create index intentos_seguridad_clave_accion_idx on intentos_seguridad (clave, accion, creado_at desc);

alter table intentos_seguridad enable row level security;

-- historial_ingresos: log de cada intento de login (exitoso o no), para que
-- el admin pueda ver quién entró y cuándo. Se escribe con el cliente admin
-- (un intento fallido no tiene sesión autenticada todavía, así que un
-- INSERT vía RLS con auth.uid() no podría aplicar). Lectura sí queda
-- gateada por RLS -- solo administrador.
create table historial_ingresos (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_id uuid references auth.users(id) on delete set null,
  exitoso boolean not null,
  motivo_error text,
  creado_at timestamptz not null default now()
);

create index historial_ingresos_creado_at_idx on historial_ingresos (creado_at desc);

alter table historial_ingresos enable row level security;

create policy historial_ingresos_select on historial_ingresos
  for select
  using (mi_rol() = 'administrador');
