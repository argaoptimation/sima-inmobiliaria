'use client'

import { useId, useState } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { excedeTamanioMaximo, MAX_ARCHIVO_MB } from '@/lib/storage/validar-tamanio-archivo'
import { Spinner } from './Spinner'

interface CampoArchivoDirectoProps {
  // Nombre del input oculto que recibe el Server Action -- ya no viaja el
  // archivo en sí (eso rompía contra el tope de 4.5 MB de Vercel), viaja
  // solo el path donde quedó subido directo a Supabase Storage.
  name: string
  bucket: string
  // Prefijo de carpeta del path final, ej. `reservas/${loteId}` o el
  // propio `userId` -- tiene que coincidir con lo que permiten las
  // políticas RLS de storage.objects (ver migración 0048).
  carpeta: string
  // Se antepone al nombre de archivo subido, ej. "dni-frente" -- solo para
  // que el path final sea legible, no tiene efecto en permisos.
  tipoArchivo: string
  label: string
  ayuda?: string
  required?: boolean
  accept?: string
  // Path ya existente (al editar algo que ya tenía un archivo cargado) --
  // se preserva si el usuario no elige uno nuevo.
  valorInicial?: string | null
}

export function CampoArchivoDirecto({
  name,
  bucket,
  carpeta,
  tipoArchivo,
  label,
  ayuda,
  required = false,
  accept = 'image/*,.pdf',
  valorInicial = null,
}: CampoArchivoDirectoProps) {
  const inputId = useId()
  const [path, setPath] = useState<string | null>(valorInicial)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null)

  async function manejarSeleccion(archivo: File | null) {
    setError(null)
    if (!archivo) return

    if (excedeTamanioMaximo(archivo)) {
      setError(`Pesa más de ${MAX_ARCHIVO_MB} MB — elegí un archivo más liviano.`)
      setPath(valorInicial)
      setNombreArchivo(null)
      return
    }

    setSubiendo(true)
    setNombreArchivo(archivo.name)

    const nombreSeguro = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const rutaCompleta = `${carpeta}/${tipoArchivo}-${Date.now()}-${nombreSeguro}`

    const supabase = createClient()
    const { error: errorSubida } = await supabase.storage.from(bucket).upload(rutaCompleta, archivo)

    setSubiendo(false)

    if (errorSubida) {
      setError('No se pudo subir el archivo. Probá de nuevo.')
      setPath(valorInicial)
      return
    }

    setPath(rutaCompleta)
  }

  return (
    <div>
      <label
        htmlFor={inputId}
        className="block rounded-lg border-2 border-dashed border-blue-200 bg-blue-50/50 px-4 py-4 text-center text-sm text-blue-900 transition-colors hover:border-blue-400 hover:bg-blue-50 cursor-pointer has-[:disabled]:cursor-wait has-[:disabled]:opacity-70"
      >
        <span className="mb-1 block font-semibold">{label}</span>
        {ayuda && <span className="text-blue-800/70">{ayuda}</span>}
        <input
          id={inputId}
          // A propósito SIN `name`: si lo tuviera, el navegador mandaría el
          // archivo real como parte del FormData al enviar el form (el que
          // realmente importa es el input oculto de abajo, con el path).
          // `data-testid` en su lugar para que los tests puedan seguir
          // apuntando a un selector estable con setInputFiles.
          data-testid={name}
          type="file"
          accept={accept}
          disabled={subiendo}
          onChange={(e) => manejarSeleccion(e.target.files?.[0] ?? null)}
          className="mt-3 block w-full text-sm text-blue-900 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-blue-800 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white file:transition-colors hover:file:bg-blue-900 disabled:cursor-wait"
        />
      </label>
      <div className="mt-1.5 min-h-[1.25rem] text-sm">
        {subiendo && (
          <span className="inline-flex items-center gap-1.5 text-blue-700">
            <Spinner className="h-3.5 w-3.5" /> Subiendo…
          </span>
        )}
        {!subiendo && nombreArchivo && !error && (
          <span className="text-green-700">✓ {nombreArchivo}</span>
        )}
        {!subiendo && !nombreArchivo && path && (
          <span className="text-slate-500">Ya hay un archivo cargado — elegí otro para reemplazarlo</span>
        )}
        {error && <span className="text-red-700">{error}</span>}
      </div>
      <input type="hidden" name={name} value={path ?? ''} required={required} />
    </div>
  )
}
