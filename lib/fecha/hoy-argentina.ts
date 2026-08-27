const FORMATO_FECHA_ARGENTINA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Cordoba',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

// A qué día de calendario ARGENTINO corresponde un instante (timestamptz) --
// NO `timestamp.slice(0, 10)` sobre el string UTC crudo, que da el día de
// calendario UTC: entre las ~21hs y medianoche hora Argentina, UTC ya está
// en el día siguiente, así que ese corte devuelve mañana en vez de hoy (ej.
// un pago confirmado a las 21:30 hora Arg quedaba fuera del cierre de caja
// "de hoy").
export function fechaEnArgentina(instante: string | Date): string {
  return FORMATO_FECHA_ARGENTINA.format(new Date(instante))
}

// "Hoy" en formato YYYY-MM-DD, según el calendario de Argentina -- NO
// `new Date().toISOString().slice(0, 10)`, que usa UTC (mismo problema que
// fechaEnArgentina, para el instante actual).
export function hoyArgentina(): string {
  return fechaEnArgentina(new Date())
}
