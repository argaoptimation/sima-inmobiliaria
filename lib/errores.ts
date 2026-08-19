interface ErrorSupabase {
  message?: string | null
  code?: string | null
}

const MENSAJES_POR_CODIGO: Record<string, string> = {
  '23505': 'Ya existe un registro con esos datos.',
  '23503': 'No se puede completar: hay datos relacionados que lo impiden.',
  '23502': 'Falta completar un dato obligatorio.',
  '42501': 'No tenés permisos para esta acción.',
}

const MENSAJE_GENERICO = 'No se pudo completar la operación. Volvé a intentarlo en unos minutos.'

// El error crudo de Postgres/Supabase nunca se muestra al usuario -- queda en
// el log del servidor para diagnóstico. `mensajesPorCodigo` permite pisar el
// mapeo genérico con un mensaje propio del contexto (ej. "Ese DNI ya
// pertenece a otro cliente" en vez del genérico de 23505).
export function mensajeDeError(
  error: ErrorSupabase | null | undefined,
  mensajesPorCodigo?: Record<string, string>
): string {
  if (error) console.error('mensajeDeError:', error)

  const codigo = error?.code ?? undefined
  if (codigo && mensajesPorCodigo?.[codigo]) return mensajesPorCodigo[codigo]
  if (codigo && MENSAJES_POR_CODIGO[codigo]) return MENSAJES_POR_CODIGO[codigo]

  return MENSAJE_GENERICO
}
