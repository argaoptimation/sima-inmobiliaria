// Suma (o resta, con `dias` negativo) días de calendario a una fecha
// YYYY-MM-DD, sin pasar por el reloj real -- para tests y cálculos que
// necesitan "N días antes/después de tal fecha", en vez de `Date.now() +/-
// N*24h`, que arrastra el mismo corrimiento horario de `hoyArgentina` si no
// se ancla al día de calendario correcto primero.
export function sumarDias(fechaISO: string, dias: number): string {
  const [anio, mes, dia] = fechaISO.split('-').map(Number)
  const fecha = new Date(Date.UTC(anio, mes - 1, dia))
  fecha.setUTCDate(fecha.getUTCDate() + dias)
  return fecha.toISOString().slice(0, 10)
}
