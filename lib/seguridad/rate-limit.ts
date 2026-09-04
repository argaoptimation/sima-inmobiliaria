import { createAdminClient } from '@/lib/supabase/admin'

// Rate limit respaldado en Postgres (tabla intentos_seguridad), no en
// memoria del proceso -- en un deployment serverless (Vercel) cada
// invocación puede caer en una instancia nueva, así que un contador en
// memoria no sería un límite real. `clave` identifica a quién se le está
// contando el límite (ej. el email), `accion` separa los contadores de
// distintos endpoints (ej. "login" vs "recuperar-contrasena") para que no
// se mezclen entre sí.
//
// Devuelve `true` si el intento está permitido (y ya quedó registrado como
// parte del conteo), `false` si hay que rechazarlo -- en ese caso NO se
// inserta una fila nueva, así que el límite es siempre sobre intentos
// reales, sliding window de `ventanaMinutos`.
//
// Pendiente (no bloqueante para esta primera versión): la tabla no tiene
// limpieza automática de filas viejas -- crece indefinidamente. Si en algún
// momento se vuelve un problema de tamaño, un cron simple que borre filas
// de más de un día alcanza.
export async function verificarLimiteIntentos(
  clave: string,
  accion: string,
  maxIntentos: number,
  ventanaMinutos: number
): Promise<boolean> {
  const admin = createAdminClient()
  const desde = new Date(Date.now() - ventanaMinutos * 60_000).toISOString()

  const { count } = await admin
    .from('intentos_seguridad')
    .select('id', { count: 'exact', head: true })
    .eq('clave', clave)
    .eq('accion', accion)
    .gte('creado_at', desde)

  if ((count ?? 0) >= maxIntentos) {
    return false
  }

  await admin.from('intentos_seguridad').insert({ clave, accion })
  return true
}
