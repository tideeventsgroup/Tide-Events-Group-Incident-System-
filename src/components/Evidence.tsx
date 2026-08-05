import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Button, Card } from './ui'
import { stamp } from '../lib/format'
import type { Attachment } from '../lib/types'

/**
 * Photo, video and document evidence against an incident.
 *
 * The bucket is private and its read policy defers to the `attachments` table,
 * which carries the same medical restriction as the incident — so a photograph
 * of a casualty cannot be fetched by a role that is not permitted to read the
 * incident it belongs to. Files are never deleted; a delete trigger blocks it,
 * because evidence that can be removed is not evidence.
 */

const MAX_BYTES = 15 * 1024 * 1024

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function Thumb({ item }: { item: Attachment }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    // Signed rather than public: the URL expires, so a link pasted into a
    // group chat does not become a permanent hole in the restriction.
    void supabase.storage
      .from('evidence')
      .createSignedUrl(item.path, 300)
      .then(({ data }) => {
        if (live) setUrl(data?.signedUrl ?? null)
      })
    return () => {
      live = false
    }
  }, [item.path])

  const isImage = item.mime_type.startsWith('image/')

  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      className="block overflow-hidden rounded-[3px] border border-line no-underline"
    >
      {isImage && url ? (
        <img src={url} alt={item.caption ?? item.filename} className="h-[110px] w-full object-cover" />
      ) : (
        <div className="flex h-[110px] items-center justify-center bg-wash text-[11px] font-bold text-faint">
          {item.mime_type.split('/')[1]?.toUpperCase() ?? 'FILE'}
        </div>
      )}
      <div className="px-2 py-1.5">
        <p className="truncate text-[11px] font-bold text-ink">{item.caption || item.filename}</p>
        <p className="text-[10px] text-faint">
          {item.by_name} · {stamp(item.at)} · {sizeLabel(item.bytes)}
        </p>
      </div>
    </a>
  )
}

export default function Evidence({
  eventId,
  incidentId,
  writable,
}: {
  eventId: string
  incidentId: string
  writable: boolean
}) {
  const { profile, session } = useAuth()
  const [items, setItems] = useState<Attachment[]>([])
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('attachments')
      .select('*')
      .eq('incident_id', incidentId)
      .order('at')
    setItems((data as Attachment[]) ?? [])
  }, [incidentId])

  useEffect(() => {
    void load()
  }, [load])

  async function upload(file: File) {
    setError(null)
    if (file.size > MAX_BYTES) {
      setError(`${file.name} is ${sizeLabel(file.size)} — the limit is 15 MB.`)
      return
    }
    setBusy(true)

    const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-100)
    const path = `${eventId}/${incidentId}/${crypto.randomUUID()}-${safe}`

    const { error: upErr } = await supabase.storage.from('evidence').upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
    if (upErr) {
      setBusy(false)
      setError(upErr.message)
      return
    }

    const { error: rowErr } = await supabase.from('attachments').insert({
      event_id: eventId,
      incident_id: incidentId,
      path,
      filename: file.name.slice(0, 200),
      mime_type: file.type || 'application/octet-stream',
      bytes: file.size,
      caption: caption.trim() || null,
      by_id: session!.user.id,
      by_name: profile!.full_name,
    })

    if (rowErr) {
      // The read policy on the bucket defers to the attachments row, so a file
      // with no row is unreadable by everyone and simply sits there. Take it
      // back out rather than leaving evidence nobody can see.
      await supabase.storage.from('evidence').remove([path])
      setBusy(false)
      setError(rowErr.message)
      return
    }
    setBusy(false)
    setCaption('')
    if (fileRef.current) fileRef.current.value = ''
    await load()
  }

  return (
    <Card title={`Evidence (${items.length})`}>
      {items.length === 0 ? (
        <p className="text-[12px] text-faint">
          Nothing attached. Photographs taken at the time are worth more than a description
          written afterwards.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {items.map((item) => (
            <Thumb key={item.id} item={item} />
          ))}
        </div>
      )}

      {writable && (
        <div className="mt-3.5 border-t border-line-soft pt-3.5">
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Caption (optional) — what this shows"
            className="mb-2"
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf,video/mp4"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void upload(file)
              }}
              className="!w-auto !border-0 !p-0 text-[12px]"
            />
            {busy && <Button variant="ghost" disabled>Uploading…</Button>}
          </div>
          <p className="mt-2 text-[11px] leading-[1.5] text-faint">
            Up to 15 MB. Attachments are recorded on the timeline and cannot be removed —
            corrections go on the timeline, like everything else.
          </p>
        </div>
      )}

      {error && <p className="mt-2 text-[11px] font-bold text-alert">{error}</p>}
    </Card>
  )
}
