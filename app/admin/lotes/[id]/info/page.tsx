import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { requireAccesoParaReservar } from '@/lib/auth/require-admin'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { ENLACE, TITULO_H1, TITULO_H2 } from '@/lib/ui/clases'

export default async function InfoLotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  await requireAccesoParaReservar(id)

  const supabase = await createClient()

  const { data: lote } = await supabase
    .from('lotes')
    .select('id, identificador, ubicacion, estado, precio_total, moneda, acreedor_id')
    .eq('id', id)
    .single()

  if (!lote) {
    notFound()
  }

  const { data: acreedor } = lote!.acreedor_id
    ? await supabase.from('profiles').select('full_name').eq('id', lote!.acreedor_id).single()
    : { data: null }

  const { data: documentos } = await supabase
    .from('lote_documentos')
    .select('id, path, descripcion')
    .eq('lote_id', id)
    .order('created_at', { ascending: false })

  const admin = createAdminClient()
  const documentosConUrl = await Promise.all(
    (documentos ?? []).map(async (documento) => {
      const { data: signedUrl } = await admin.storage
        .from('comprobantes')
        .createSignedUrl(documento.path, 300)
      return { ...documento, url: signedUrl?.signedUrl ?? null }
    })
  )

  return (
    <main className="max-w-md">
      <EnlaceBoton href="/admin/lotes" className={`mb-4 inline-block ${ENLACE}`}>
        ← Volver a Lotes
      </EnlaceBoton>
      <h1 className={`mb-6 ${TITULO_H1}`}>{lote!.identificador}</h1>

      {lote!.ubicacion && <p className="mb-1 text-sm text-slate-700">Ubicación: {lote!.ubicacion}</p>}
      <p className="mb-1 text-sm text-slate-700">Estado: {lote!.estado}</p>
      {lote!.precio_total && (
        <p className="mb-1 text-sm text-slate-700">
          Precio total: {lote!.precio_total} {lote!.moneda}
        </p>
      )}
      <p className="mb-4 text-sm text-slate-700">
        Acreedor: {acreedor ? acreedor.full_name : '— sin asignar —'}
      </p>

      <h2 className={`mb-2 ${TITULO_H2}`}>Documentos</h2>
      {documentosConUrl.length === 0 ? (
        <p className="text-sm text-slate-600">Todavía no se subió ningún documento.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {documentosConUrl.map((documento) => (
            <li key={documento.id} className="text-sm">
              {documento.url ? (
                <a href={documento.url} target="_blank" className={ENLACE}>
                  {documento.descripcion}
                </a>
              ) : (
                <span className="text-slate-700">{documento.descripcion} (link no disponible)</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
