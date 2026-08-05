import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLive } from '../context/LiveContext'
import { supabase } from '../lib/supabase'
import { Banner, Button, Card, Empty, FieldLabel, Spinner } from '../components/ui'
import { clockTime, dateShort } from '../lib/format'
import { canWrite, type OccupancyCount } from '../lib/types'

/**
 * Occupancy counts.
 *
 * The SGSA expects a control room to take entry counts every fifteen minutes
 * from gate opening through to half an hour after the start, and at many
 * events it is a licensing condition rather than good practice. Counts are
 * append-only: a running total that can be edited afterwards is not a count,
 * it is an opinion.
 *
 * Each entry is a delta — how many in and out since the last one — so the
 * running total is derived and a mistyped reading can be corrected by the next
 * one without rewriting history.
 */

const INTERVAL_MINUTES = 15

export default function Occupancy() {
  const { profile, session } = useAuth()
  const { activeEvent, lastSync, refresh } = useLive()

  const [counts, setCounts] = useState<OccupancyCount[]>([])
  const [loading, setLoading] = useState(true)
  const [inCount, setInCount] = useState('')
  const [outCount, setOutCount] = useState('')
  const [zone, setZone] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const writable = canWrite(profile?.role) && !activeEvent?.locked

  const load = useCallback(async () => {
    if (!activeEvent) return
    // No limit. Each row is a delta, so the running total is only correct if
    // every row is present — a cap here would silently understate the number
    // an occupancy figure exists to be right about.
    const { data } = await supabase
      .from('occupancy_counts')
      .select('*')
      .eq('event_id', activeEvent.id)
      .order('at', { ascending: false })
    setCounts((data as OccupancyCount[]) ?? [])
    setLoading(false)
  }, [activeEvent])

  useEffect(() => {
    void load()
  }, [load, lastSync])

  const totals = useMemo(() => {
    const totalIn = counts.reduce((n, c) => n + c.count_in, 0)
    const totalOut = counts.reduce((n, c) => n + c.count_out, 0)
    const last = counts[0] ?? null

    let running = 0
    let peak = 0
    for (const c of [...counts].sort((a, b) => a.at.localeCompare(b.at))) {
      running += c.count_in - c.count_out
      if (running > peak) peak = running
    }
    const overdueBy = last
      ? Math.floor((Date.now() - new Date(last.at).getTime()) / 60_000)
      : null
    return {
      inside: totalIn - totalOut,
      peak,
      totalIn,
      totalOut,
      last,
      overdue: overdueBy !== null && overdueBy >= INTERVAL_MINUTES ? overdueBy : null,
    }
  }, [counts])

  const capacity = activeEvent?.capacity ?? null
  const pct = capacity ? Math.min(100, Math.round((totals.inside / capacity) * 100)) : null

  async function add(e: FormEvent) {
    e.preventDefault()
    const cin = Number(inCount || 0)
    const cout = Number(outCount || 0)
    if (!Number.isFinite(cin) || !Number.isFinite(cout) || (cin === 0 && cout === 0)) {
      setError('Enter the numbers in and out since the last count.')
      return
    }
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.from('occupancy_counts').insert({
      event_id: activeEvent!.id,
      zone: zone || null,
      count_in: Math.max(0, Math.round(cin)),
      count_out: Math.max(0, Math.round(cout)),
      recorded_by: session!.user.id,
      recorded_by_name: profile!.full_name,
      note: note.trim() || null,
    })
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    setInCount('')
    setOutCount('')
    setNote('')
    await Promise.all([load(), refresh()])
  }

  if (!activeEvent) {
    return (
      <div className="mx-auto max-w-[900px] px-4 py-8 sm:px-7">
        <Empty>No event selected.</Empty>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[900px] px-4 pt-5 pb-10 sm:px-7">
      <div className="mb-4">
        <h1 className="text-[22px] font-bold text-ink sm:text-[24px]">Occupancy</h1>
        <p className="mt-1 text-[12px] leading-[1.5] text-muted">
          Entry counts every {INTERVAL_MINUTES} minutes from gate opening, per the SGSA's control
          room guidance. Each entry records the numbers in and out since the last one, so the
          running total is derived rather than edited.
        </p>
      </div>

      {totals.overdue !== null && (
        <div className="mb-4">
          <Banner tone="error">
            No count taken for {totals.overdue} minutes. The interval is {INTERVAL_MINUTES}.
          </Banner>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <div className="text-[10px] font-bold tracking-[0.5px] text-muted">ON SITE</div>
          <div className="text-[28px] leading-tight font-bold text-ink">{totals.inside}</div>
        </Card>
        <Card>
          <div className="text-[10px] font-bold tracking-[0.5px] text-muted">CAPACITY</div>
          <div className="text-[28px] leading-tight font-bold text-ink">
            {capacity ?? '—'}
          </div>
          {pct !== null && (
            <div className="mt-1 h-[6px] w-full rounded-full bg-line">
              <div
                className="h-[6px] rounded-full"
                style={{
                  width: `${pct}%`,
                  background: pct >= 95 ? '#C41E3A' : pct >= 80 ? '#8C5A66' : '#3D8361',
                }}
              />
            </div>
          )}
        </Card>
        <Card>
          <div className="text-[10px] font-bold tracking-[0.5px] text-muted">PEAK</div>
          <div className="text-[28px] leading-tight font-bold text-ink">{totals.peak}</div>
          <div className="text-[10px] text-faint">{totals.totalIn} admissions</div>
        </Card>
        <Card>
          <div className="text-[10px] font-bold tracking-[0.5px] text-muted">LAST COUNT</div>
          <div className="text-[20px] leading-tight font-bold text-ink">
            {totals.last ? clockTime(totals.last.at) : '—'}
          </div>
        </Card>
      </div>

      {capacity === null && (
        <div className="mb-4">
          <Banner tone="info">
            No capacity set for this event. An Incident Commander can add one under Event
            Settings, and the count will then show as a percentage of it.
          </Banner>
        </div>
      )}

      {writable && (
        <Card className="mb-4" title="Record a count">
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-4">
            <div>
              <FieldLabel htmlFor="oc-in">IN SINCE LAST</FieldLabel>
              <input
                id="oc-in"
                type="number"
                inputMode="numeric"
                min={0}
                value={inCount}
                onChange={(e) => setInCount(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="oc-out">OUT SINCE LAST</FieldLabel>
              <input
                id="oc-out"
                type="number"
                inputMode="numeric"
                min={0}
                value={outCount}
                onChange={(e) => setOutCount(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="oc-zone">GATE / ZONE</FieldLabel>
              <select id="oc-zone" value={zone} onChange={(e) => setZone(e.target.value)}>
                <option value="">All gates</option>
                {activeEvent.zones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit" block disabled={busy}>
                {busy ? 'Recording…' : 'Record'}
              </Button>
            </div>
            <div className="sm:col-span-4">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note (optional) — counter used, gate closed, manual estimate…"
              />
            </div>
          </form>
          {error && <p className="mt-2 text-[11px] font-bold text-alert">{error}</p>}
        </Card>
      )}

      <Card title="Count log" padded={false}>
        {loading ? (
          <Spinner label="Loading counts" />
        ) : counts.length === 0 ? (
          <Empty>No counts recorded yet.</Empty>
        ) : (
          <>
            <div className="hidden grid-cols-[70px_80px_70px_70px_1fr_1fr] gap-2 border-b border-line bg-wash px-4 py-2.5 text-[10px] font-bold tracking-[0.5px] text-faint sm:grid">
              <div>TIME</div>
              <div>RUNNING</div>
              <div>IN</div>
              <div>OUT</div>
              <div>GATE</div>
              <div>BY</div>
            </div>
            {(() => {
              // Running total at each row, oldest-first then displayed newest-first.
              const asc = [...counts].reverse()
              let running = 0
              const withRunning = asc.map((c) => {
                running += c.count_in - c.count_out
                return { c, running }
              })
              return withRunning.reverse().map(({ c, running: r }) => (
                <div
                  key={c.id}
                  className="grid gap-1 border-b border-line-soft px-4 py-2.5 last:border-b-0 sm:grid-cols-[70px_80px_70px_70px_1fr_1fr] sm:gap-2"
                >
                  <div className="text-[13px] font-bold text-ink">
                    {clockTime(c.at)}
                    <span className="ml-1.5 text-[11px] font-normal text-faint sm:hidden">
                      {dateShort(c.at)}
                    </span>
                  </div>
                  <div className="text-[13px] font-bold text-ink">{r}</div>
                  <div className="text-[13px] text-ok">+{c.count_in}</div>
                  <div className="text-[13px] text-muted">−{c.count_out}</div>
                  <div className="truncate text-[12px] text-muted">{c.zone ?? 'All gates'}</div>
                  <div className="truncate text-[11px] text-faint">
                    {c.recorded_by_name}
                    {c.note ? ` · ${c.note}` : ''}
                  </div>
                </div>
              ))
            })()}
          </>
        )}
      </Card>
    </div>
  )
}
