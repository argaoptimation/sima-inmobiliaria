// Skeletons para los loading.tsx de /admin/* (PR2 del rediseño, ver
// design-system/rediseno/PLAN.md). No hay un esqueleto distinto por
// pantalla -- son genéricos (encabezado + bloque de tabla, o encabezado +
// grilla de tarjetas para el dashboard) para no tener que mantener 13
// variantes a mano; igual transmiten "esto está cargando" sin el salto en
// blanco de antes.

function EncabezadoEsqueleto() {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="h-3 w-24 rounded bg-slate-200" />
      <div className="h-7 w-56 rounded bg-slate-200" />
    </div>
  )
}

export function EsqueletoPagina({ filas = 6 }: { filas?: number }) {
  return (
    <div className="flex animate-pulse flex-col gap-5" aria-hidden="true">
      <EncabezadoEsqueleto />
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="h-11 bg-slate-100" />
        {Array.from({ length: filas }).map((_, indice) => (
          <div key={indice} className="h-12 border-t border-slate-100" />
        ))}
      </div>
    </div>
  )
}

export function EsqueletoDashboard() {
  return (
    <div className="flex animate-pulse flex-col gap-5" aria-hidden="true">
      <EncabezadoEsqueleto />
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, indice) => (
          <div key={indice} className="h-[118px] rounded-xl border border-blue-100 bg-white" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1fr_340px]">
        <div className="h-44 rounded-xl border border-blue-100 bg-white" />
        <div className="h-44 rounded-xl border border-blue-100 bg-white" />
      </div>
      <div className="h-40 rounded-xl border border-blue-100 bg-white" />
    </div>
  )
}
