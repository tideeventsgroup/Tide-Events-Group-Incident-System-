import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLive } from '../context/LiveContext'
import { supabase } from '../lib/supabase'
import { Banner, Button, Card, Empty } from '../components/ui'
import { clockTime } from '../lib/format'
import { OPEN_STATUSES, PRIORITY, SEVERITY_COLOUR, SEVERITY_RANK } from '../lib/style'
import { canManageEvent, canWrite, type BoardIncident } from '../lib/types'

/**
 * The site plan, with incidents pinned on it.
 *
 * Every event product leads with a map, and for a reason a list cannot match:
 * three separate calls along one fence line read as three rows and as one
 * problem. This is deliberately the honest version of it — an event's own site
 * plan image with pins placed by hand, rather than a street map that knows
 * nothing about where the barriers are.
 *
 * Pin positions are stored as fractions of the image, so re-uploading the plan
 * at a different resolution does not move every incident.
 */
export default function SiteMap() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { activeEvent, incidents, refresh, refreshEvents } = useLive()
  const [planUrl, setPlanUrl] = useState<string | null>(null)
  const [placing, setPlacing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openOnly, setOpenOnly] = useState(true)
  const imgRef = useRef<HTMLImageElement>(null)

  const manager = canManageEvent(profile?.role)
  const writable = canWrite(profile?.role) && !activeEvent?.locked

  useEffect(() => {
    let live = true
    if (!activeEvent?.site_plan_path) {
      setPlanUrl(null)
      return
    }
    void supabase.storage
      .from('siteplans')
      .createSignedUrl(activeEvent.site_plan_path, 3600)
      .then(({ data }) => {
        if (live) setPlanUrl(data?.signedUrl ?? null)
      })
    return () => {
      live = false
    }
  }, [activeEvent?.site_plan_path])

  const shown = useMemo(
    () => incidents.filter((i) => !openOnly || OPEN_STATUSES.includes(i.status)),
    [incidents, openOnly],
  )

  const pinned = shown.filter((i) => i.map_x !== null && i.map_y !== null)
  const unpinned = shown.filter((i) => i.map_x === null || i.map_y === null)

  async function uploadPlan(file: File) {
    setBusy(true)
    setError(null)
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
    const path = `${activeEvent!.id}/plan-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('siteplans')
      .upload(path, file, { contentType: file.type, upsert: true })
    if (upErr) {
      setBusy(false)
      setError(upErr.message)
      return
    }
    const { error: evErr } = await supabase
      .from('events')
      .update({ site_plan_path: path })
      .eq('id', activeEvent!.id)
    setBusy(false)
    if (evErr) {
      setError(evErr.message)
      return
    }
    await refreshEvents()
  }

  async function place(e: React.MouseEvent<HTMLImageElement>) {
    if (!placing || !imgRef.current) return
    const rect = imgRef.current.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    const id = placing
    setPlacing(null)
    const { error: err } = await supabase
      .from('incidents')
      .update({ map_x: x, map_y: y })
      .eq('id', id)
    if (err) setError(err.message)
    await refresh()
  }

  if (!activeEvent) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-7">
        <Empty>No event selected.</Empty>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-5 pb-10 sm:px-7">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink sm:text-[24px]">Site Map</h1>
          <p className="mt-1 text-[12px] leading-[1.5] text-muted">
            The event's own site plan with incidents pinned on it. Three calls along one fence
            line read as three rows on the board and as one problem here.
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-[12px] text-muted">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => setOpenOnly(e.target.checked)}
            className="!w-auto"
          />
          Open only
        </label>
      </div>

      {error && (
        <div className="mb-4">
          <Banner tone="error">{error}</Banner>
        </div>
      )}

      {!planUrl ? (
        <Card title="No site plan uploaded">
          <p className="text-[13px] leading-[1.6] text-muted">
            Upload the event's site plan — the one already in the ESMP — and incidents can be
            pinned onto it. A JPEG, PNG or SVG up to 10 MB.
          </p>
          {manager ? (
            <div className="mt-3">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void uploadPlan(f)
                }}
                className="!w-auto !border-0 !p-0 text-[12px]"
              />
            </div>
          ) : (
            <p className="mt-2 text-[12px] text-faint">
              An Incident Commander can upload one under this page or Event Settings.
            </p>
          )}
        </Card>
      ) : (
        <>
          {placing && (
            <div className="mb-3">
              <Banner tone="info">
                Click the plan to place{' '}
                <b>{incidents.find((i) => i.id === placing)?.ref ?? 'the incident'}</b>.{' '}
                <button
                  type="button"
                  onClick={() => setPlacing(null)}
                  className="font-bold underline"
                >
                  Cancel
                </button>
              </Banner>
            </div>
          )}

          <div className="relative overflow-hidden rounded-[3px] border border-line bg-white">
            <img
              ref={imgRef}
              src={planUrl}
              alt={`${activeEvent.name} site plan`}
              onClick={place}
              className={`block w-full ${placing ? 'cursor-crosshair' : ''}`}
            />
            {pinned.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => navigate(`/control/incident/${i.id}`)}
                title={`${i.ref} · ${i.category} · ${i.severity}`}
                className="absolute flex h-[26px] w-[26px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[9px] font-bold text-white shadow-lg"
                style={{
                  left: `${(i.map_x ?? 0) * 100}%`,
                  top: `${(i.map_y ?? 0) * 100}%`,
                  background: SEVERITY_COLOUR[i.severity],
                  border: '2px solid #fff',
                  opacity: OPEN_STATUSES.includes(i.status) ? 1 : 0.55,
                }}
              >
                {PRIORITY[i.severity]}
              </button>
            ))}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted">
            {(['Critical', 'Major', 'Moderate', 'Minor'] as const).map((s) => (
              <span key={s}>
                <span style={{ color: SEVERITY_COLOUR[s] }} aria-hidden="true">
                  ●
                </span>{' '}
                {PRIORITY[s]} {s}
              </span>
            ))}
            {manager && (
              <label className="ml-auto text-[11px] text-faint">
                Replace plan{' '}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void uploadPlan(f)
                  }}
                  className="!w-auto !border-0 !p-0 text-[11px]"
                />
              </label>
            )}
          </div>
        </>
      )}

      {planUrl && (
        <Card title={`Not yet placed (${unpinned.length})`} className="mt-4" padded={false}>
          {unpinned.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12px] text-faint">
              Every incident on the board has a position.
            </p>
          ) : (
            [...unpinned]
              .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
              .map((i: BoardIncident) => (
                <div
                  key={i.id}
                  className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2.5 last:border-b-0"
                >
                  <span
                    className="rounded-[2px] px-1.5 py-[3px] text-[9px] font-bold text-white"
                    style={{ background: SEVERITY_COLOUR[i.severity] }}
                  >
                    {PRIORITY[i.severity]}
                  </span>
                  <span className="text-[12px] font-bold text-ink">{i.ref}</span>
                  <span className="text-[12px] text-ink">{i.category}</span>
                  <span className="text-[12px] text-muted">{i.location}</span>
                  <span className="text-[11px] text-faint">{clockTime(i.created_at)}</span>
                  {writable && (
                    <Button
                      variant="ghost"
                      className="!ml-auto !px-3 !py-1.5 !text-[11px]"
                      onClick={() => setPlacing(i.id)}
                    >
                      Place on plan
                    </Button>
                  )}
                </div>
              ))
          )}
        </Card>
      )}
    </div>
  )
}
