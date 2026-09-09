'use client'

import { useEffect, useId, useState, type ReactNode } from 'react'
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
  // ReactNode y no string para poder meterle el <Obligatorio /> al lado del
  // nombre cuando el archivo es obligatorio (05/09: los cinco campos de la
  // reserva se veían idénticos y no se intuía cuáles hacían falta).
  label: ReactNode
  ayuda?: string
  required?: boolean
  accept?: string
  // Path ya existente (al editar algo que ya tenía un archivo cargado) --
  // se preserva si el usuario no elige uno nuevo.
  valorInicial?: string | null
  // URL firmada de ese archivo ya cargado, si el server la pudo generar:
  // sirve para mostrarlo en la vista previa antes de reemplazarlo. Sin
  // esto, al editar solo se veía el texto "ya hay un archivo cargado" y
  // había que confiar en la memoria para saber cuál era.
  urlInicial?: string | null
  // Cómo nombrar el archivo en el mensaje de "pesa más de 15 MB", ej. "El
  // comprobante de la seña", "La foto del DNI (frente)" -- mismo texto que
  // ya se usaba cuando esta validación corría del lado del servidor.
  nombreError?: string
  // Versión angosta (input + estado en una sola línea, sin la caja
  // punteada) para meter dentro de una fila de tabla u otro espacio
  // chico, en vez del bloque grande pensado para un formulario propio.
  compacto?: boolean
  // Si se necesita el nombre original del archivo en el server action
  // (ej. para guardarlo en una columna aparte, como
  // `plantilla_contrato_nombre`), viaja en un input oculto con este
  // nombre + "NombreOriginal".
  incluirNombreOriginal?: boolean
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
  urlInicial = null,
  nombreError = 'El archivo',
  compacto = false,
  incluirNombreOriginal = false,
}: CampoArchivoDirectoProps) {
  const inputId = useId()
  const [path, setPath] = useState<string | null>(valorInicial)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null)

  // Vista previa de lo que se acaba de elegir (09/09, pedido de Gabriel).
  // Sale de `URL.createObjectURL` sobre el File local y no de una URL
  // firmada del Storage: se ve en el acto, sin un viaje más al servidor, y
  // es exactamente el archivo que se está por mandar. El caso que resuelve
  // es concreto: subir la foto del DNI de atrás creyendo que era la de
  // adelante, o una foto movida, y enterarse recién cuando hay que armar
  // el boleto.
  const [vistaPrevia, setVistaPrevia] = useState<{ url: string; esImagen: boolean } | null>(null)

  // Las object URLs viven hasta que se las revoca a mano: sin esto, cargar
  // cinco archivos en un formulario deja cinco blobs colgados en memoria.
  useEffect(() => {
    const url = vistaPrevia?.url
    if (!url || !url.startsWith('blob:')) return
    return () => URL.revokeObjectURL(url)
  }, [vistaPrevia])

  async function manejarSeleccion(archivo: File | null) {
    setError(null)
    if (!archivo) return

    if (excedeTamanioMaximo(archivo)) {
      setError(`${nombreError} pesa más de ${MAX_ARCHIVO_MB} MB — subí uno más liviano.`)
      setPath(valorInicial)
      setNombreArchivo(null)
      setVistaPrevia(null)
      return
    }

    setSubiendo(true)
    setNombreArchivo(archivo.name)
    setVistaPrevia({
      url: URL.createObjectURL(archivo),
      esImagen: archivo.type.startsWith('image/'),
    })

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

  const inputArchivo = (
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
      className={
        compacto
          ? 'text-xs file:mr-2 file:cursor-pointer file:rounded file:border-0 file:bg-blue-800 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-white disabled:cursor-wait'
          : 'mt-3 block w-full text-sm text-blue-900 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-blue-800 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white file:transition-colors hover:file:bg-blue-900 disabled:cursor-wait'
      }
    />
  )

  const estado = (
    <>
      {subiendo && (
        <span className="inline-flex items-center gap-1.5 text-blue-700">
          <Spinner className="h-3.5 w-3.5" /> Subiendo…
        </span>
      )}
      {!subiendo && nombreArchivo && !error && (
        <span className="text-green-700">✓ {nombreArchivo}</span>
      )}
      {!subiendo && !nombreArchivo && path && !compacto && (
        <span className="text-slate-500">Ya hay un archivo cargado — elegí otro para reemplazarlo</span>
      )}
      {error && <span className="text-red-700">{error}</span>}
    </>
  )

  const camposOcultos = (
    <>
      <input type="hidden" name={name} value={path ?? ''} required={required} />
      {incluirNombreOriginal && (
        <input type="hidden" name={`${name}NombreOriginal`} value={nombreArchivo ?? ''} />
      )}
    </>
  )

  // Lo que se muestra: el archivo recién elegido si hay uno, si no el que
  // ya estaba guardado. En la versión compacta no va -- vive dentro de una
  // fila de tabla, no hay lugar para una miniatura.
  const previa = vistaPrevia ?? (urlInicial ? { url: urlInicial, esImagen: true } : null)

  const bloqueVistaPrevia =
    !compacto && previa && !error ? (
      <div className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
        {previa.esImagen ? (
          // Un `blob:` local o una URL firmada de Storage: next/image no
          // puede optimizar ninguno de los dos.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previa.url}
            alt={`Vista previa de ${nombreArchivo ?? 'lo cargado'}`}
            className="h-20 w-28 shrink-0 rounded-lg border border-slate-200 bg-white object-contain"
          />
        ) : (
          <span className="flex h-20 w-28 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-500">
            PDF
          </span>
        )}
        <div className="min-w-0 text-xs">
          <p className="truncate font-medium text-slate-700">
            {nombreArchivo ?? 'Archivo ya cargado'}
          </p>
          <a
            href={previa.url}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-blue-700 underline-offset-2 hover:underline"
          >
            Ver en grande
          </a>
          <p className="mt-0.5 text-slate-500">
            Revisá que se lea bien antes de confirmar. Para cambiarlo, elegí otro archivo.
          </p>
        </div>
      </div>
    ) : null

  if (compacto) {
    return (
      <span className="inline-flex items-center gap-2 text-xs">
        {inputArchivo}
        {estado}
        {camposOcultos}
      </span>
    )
  }

  return (
    <div>
      <label
        htmlFor={inputId}
        className="block rounded-lg border-2 border-dashed border-blue-200 bg-blue-50/50 px-4 py-4 text-center text-sm text-blue-900 transition-colors hover:border-blue-400 hover:bg-blue-50 cursor-pointer has-[:disabled]:cursor-wait has-[:disabled]:opacity-70"
      >
        <span className="mb-1 block font-semibold">{label}</span>
        {ayuda && <span className="text-blue-800/70">{ayuda}</span>}
        {inputArchivo}
      </label>
      <div className="mt-1.5 min-h-[1.25rem] text-sm">{estado}</div>
      {bloqueVistaPrevia}
      {camposOcultos}
    </div>
  )
}
