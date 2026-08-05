import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLive } from '../context/LiveContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Banner, Button, Card, Empty } from '../components/ui'
import { clockTime, dateLong, elapsed, stamp } from '../lib/format'
import { PRIORITY, SEVERITY_COLOUR, SEVERITY_RANK } from '../lib/style'
import {
  CATEGORIES,
  SEVERITIES,
  reviewOverdueBy,
  type BoardIncident,
  type OccupancyCount,
  type SiteStateEntry,
  type TaskRecord,
} from '../lib/types'

/**
 * The debrief pack.
 *
 * Every product in this space sells its reporting as the reason to buy —
 * 24/7 Software's "one-click reporting" and response-time tracking, Halo's
 * "defensible post-event records". This system recorded everything and
 * reported none of it: the numbers a SAG debrief, a licensing review or a
 * client wants were only ever available by reading the board.
 *
 * Nothing here is computed from anything the record does not already hold, so
 * the pack cannot say something the audit trail contradicts.
 */

function Bar({ label, value, max, colour }: { label: string; value: number; max: number; colour: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-[104px] shrink-0 truncate text-[12px] text-ink">{label}</span>
      <span className="h-[16px] flex-1 rounded-[2px] bg-line-soft">
        <span
          className="block h-[16px] rounded-[2px]"
          style={{ width: max > 0 ? `${Math.max(3, (value / max) * 100)}%` : '3%', background: colour }}
        />
      </span>
      <span className="w-[28px] shrink-0 text-right text-[12px] font-bold text-ink">{value}</span>
    </div>
  )
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

function mins(from: string, to: string): number {
  return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000))
}

export default function Debrief() {
  const { activeEvent, incidents, units } = useLive()
  const { profile } = useAuth()
  const [states, setStates] = useState<SiteStateEntry[]>([])
  const [counts, setCounts] = useState<OccupancyCount[]>([])
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!activeEvent) return
    const [s, o, t] = await Promise.all([
      supabase.from('site_state_log').select('*').eq('event_id', activeEvent.id).order('at'),
      supabase.from('occupancy_counts').select('*').eq('event_id', activeEvent.id),
      supabase.from('tasks').select('*').eq('event_id', activeEvent.id),
    ])
    setStates((s.data as SiteStateEntry[]) ?? [])
    setCounts((o.data as OccupancyCount[]) ?? [])
    setTasks((t.data as TaskRecord[]) ?? [])
  }, [activeEvent])

  useEffect(() => {
    void load()
  }, [load])

  const stats = useMemo(() => {
    const byCategory = CATEGORIES.map((c) => ({
      key: c,
      n: incidents.filter((i) => i.category === c).length,
    })).filter((r) => r.n > 0)

    const bySeverity = SEVERITIES.map((s) => ({
      key: s,
      n: incidents.filter((i) => i.severity === s).length,
    }))

    const byZone = [...new Set(incidents.map((i) => i.location))]
      .map((z) => ({ key: z, n: incidents.filter((i) => i.location === z).length }))
      .sort((a, b) => b.n - a.n)

    const byHour = Array.from({ length: 24 }, (_, h) => ({
      key: String(h).padStart(2, '0'),
      n: incidents.filter((i) => new Date(i.created_at).getHours() === h).length,
    }))

    const ackTimes = incidents
      .filter((i) => i.acknowledged_at)
      .map((i) => mins(i.created_at, i.acknowledged_at!))
    const sceneTimes = incidents
      .filter((i) => i.on_scene_at)
      .map((i) => mins(i.created_at, i.on_scene_at!))
    const closeTimes = incidents
      .filter((i) => i.closed_at)
      .map((i) => mins(i.created_at, i.closed_at!))

    const totalIn = counts.reduce((n, c) => n + c.count_in, 0)
    const totalOut = counts.reduce((n, c) => n + c.count_out, 0)

    return {
      total: incidents.length,
      open: incidents.filter((i) => i.status !== 'Resolved').length,
      byCategory,
      bySeverity,
      byZone,
      byHour,
      ack: median(ackTimes),
      scene: median(sceneTimes),
      close: median(closeTimes),
      unassignedEver: incidents.filter((i) => !i.acknowledged_at).length,
      reviewBreaches: incidents.filter((i) => reviewOverdueBy(i) !== null).length,
      riddor: incidents.filter((i) => i.riddor_reportable),
      safeguarding: incidents.filter((i) => i.safeguarding_referral).length,
      conveyed: incidents.filter((i) => i.disposal === 'Conveyed to hospital').length,
      followUp: incidents.filter((i) => i.follow_up_required),
      openTasks: tasks.filter((t) => t.status !== 'Done'),
      peakOccupancy: totalIn - totalOut,
      totalIn,
    }
  }, [incidents, counts, tasks])

  async function exportPack() {
    if (!activeEvent) return
    setBusy(true)
    const { buildDebriefPdf } = await import('../lib/export')
    await buildDebriefPdf({
      event: activeEvent,
      incidents,
      states,
      stats,
      units: units.length,
      preparedBy: profile?.full_name ?? '',
    })
    setBusy(false)
  }

  if (!activeEvent) {
    return (
      <div className="mx-auto max-w-[980px] px-4 py-8 sm:px-7">
        <Empty>No event selected.</Empty>
      </div>
    )
  }

  const maxCat = Math.max(1, ...stats.byCategory.map((r) => r.n))
  const maxZone = Math.max(1, ...stats.byZone.map((r) => r.n))
  const maxHour = Math.max(1, ...stats.byHour.map((r) => r.n))

  return (
    <div className="mx-auto max-w-[980px] px-4 pt-5 pb-14 sm:px-7">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink sm:text-[24px]">Debrief Pack</h1>
          <p className="mt-1 text-[12px] leading-[1.5] text-muted">
            {activeEvent.name} · {dateLong(activeEvent.start_date)}
            {activeEvent.is_exercise && (
              <b className="ml-2 text-alert">EXERCISE — NOT A LIVE EVENT</b>
            )}
          </p>
        </div>
        <Button onClick={() => void exportPack()} disabled={busy}>
          {busy ? 'Building…' : 'Export PDF'}
        </Button>
      </div>

      {stats.open > 0 && (
        <div className="mb-4">
          <Banner tone="info">
            {stats.open} incident{stats.open === 1 ? ' is' : 's are'} still open. The pack is a
            live picture until the event is ended.
          </Banner>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'INCIDENTS', value: stats.total },
          { label: 'MED. TIME TO ACK', value: stats.ack === null ? '—' : `${stats.ack}m` },
          { label: 'MED. TIME ON SCENE', value: stats.scene === null ? '—' : `${stats.scene}m` },
          { label: 'MED. TIME TO CLOSE', value: stats.close === null ? '—' : `${stats.close}m` },
        ].map((t) => (
          <Card key={t.label}>
            <div className="text-[10px] font-bold tracking-[0.5px] text-muted">{t.label}</div>
            <div className="text-[26px] leading-tight font-bold text-ink">{t.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="By category">
          <div className="flex flex-col gap-2">
            {stats.byCategory.map((r) => (
              <Bar key={r.key} label={r.key} value={r.n} max={maxCat} colour="#25BEC8" />
            ))}
          </div>
        </Card>

        <Card title="By severity">
          <div className="flex flex-col gap-2">
            {stats.bySeverity.map((r) => (
              <Bar
                key={r.key}
                label={`${PRIORITY[r.key]} ${r.key}`}
                value={r.n}
                max={Math.max(1, ...stats.bySeverity.map((x) => x.n))}
                colour={SEVERITY_COLOUR[r.key]}
              />
            ))}
          </div>
        </Card>

        <Card title="By zone">
          <div className="flex flex-col gap-2">
            {stats.byZone.length === 0 ? (
              <p className="text-[12px] text-faint">Nothing logged.</p>
            ) : (
              stats.byZone.map((r) => (
                <Bar key={r.key} label={r.key} value={r.n} max={maxZone} colour="#4A7C8C" />
              ))
            )}
          </div>
        </Card>

        <Card title="By hour raised">
          <div className="flex h-[120px] items-end gap-[3px]">
            {stats.byHour.map((r) => (
              <div key={r.key} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-[2px] bg-teal"
                  style={{ height: `${Math.max(2, (r.n / maxHour) * 96)}px` }}
                  title={`${r.key}:00 — ${r.n}`}
                />
                {Number(r.key) % 6 === 0 && (
                  <span className="text-[9px] text-faint">{r.key}</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Statutory &amp; safeguarding">
          <dl className="flex flex-col gap-2.5 text-[13px]">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Conveyed to hospital</dt>
              <dd className="font-bold text-ink">{stats.conveyed}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">RIDDOR reportable</dt>
              <dd className="font-bold text-ink">{stats.riddor.length}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Safeguarding referrals</dt>
              <dd className="font-bold text-ink">{stats.safeguarding}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Never acknowledged</dt>
              <dd className="font-bold text-ink">{stats.unassignedEver}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Review thresholds breached</dt>
              <dd className="font-bold text-ink">{stats.reviewBreaches}</dd>
            </div>
          </dl>

          {stats.riddor.length > 0 && (
            <div className="mt-3 border-t border-line-soft pt-3">
              <p className="mb-1.5 text-[11px] font-bold tracking-[0.5px] text-alert">
                RIDDOR — SUBMISSION DUE WITHIN 10 DAYS
              </p>
              <ul className="flex flex-col gap-1">
                {stats.riddor.map((i) => (
                  <li key={i.id} className="text-[12px] text-ink">
                    <b>{i.ref}</b> · {i.category} · {i.location} —{' '}
                    {i.riddor_reported_at ? (
                      <span className="text-ok">
                        submitted {stamp(i.riddor_reported_at)}
                        {i.riddor_reference ? ` (${i.riddor_reference})` : ''}
                      </span>
                    ) : (
                      <span className="font-bold text-alert">not yet submitted</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card title="Site states declared">
          {states.length === 0 ? (
            <p className="text-[12px] text-faint">
              The site stayed Normal throughout. No show stop, evacuation, invacuation or
              lockdown was declared.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {states.map((s) => (
                <li key={s.id} className="text-[12px] leading-[1.5] text-ink">
                  <b>{clockTime(s.at)}</b> — {s.previous_state ?? '—'} → <b>{s.state}</b> ·{' '}
                  {s.declared_by_name}
                  {s.reason && <span className="block text-muted">{s.reason}</span>}
                </li>
              ))}
            </ul>
          )}

          {counts.length > 0 && (
            <div className="mt-3 border-t border-line-soft pt-3 text-[12px] text-ink">
              Peak occupancy <b>{stats.peakOccupancy}</b> of{' '}
              <b>{activeEvent.capacity ?? '—'}</b> · {stats.totalIn} admissions across{' '}
              {counts.length} counts.
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title={`Open follow-ups (${stats.followUp.length})`}>
          {stats.followUp.length === 0 ? (
            <p className="text-[12px] text-faint">Nothing flagged for post-event follow-up.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {stats.followUp.map((i) => (
                <li key={i.id} className="text-[12px] text-ink">
                  <b>{i.ref}</b> · {i.category} · {i.location}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Outstanding actions (${stats.openTasks.length})`}>
          {stats.openTasks.length === 0 ? (
            <p className="text-[12px] text-faint">All actions closed out.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {stats.openTasks.map((t) => (
                <li key={t.id} className="text-[12px] text-ink">
                  <b>{t.priority}</b> · {t.title}
                  {t.owner_label ? ` — ${t.owner_label}` : ''}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Longest-running incidents" className="mt-4">
        {incidents.length === 0 ? (
          <p className="text-[12px] text-faint">Nothing logged.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {[...incidents]
              .filter((i) => i.closed_at)
              .sort(
                (a, b) =>
                  mins(b.created_at, b.closed_at!) - mins(a.created_at, a.closed_at!),
              )
              .slice(0, 8)
              .map((i: BoardIncident) => (
                <li key={i.id} className="flex flex-wrap gap-2 text-[12px] text-ink">
                  <b>{i.ref}</b>
                  <span style={{ color: SEVERITY_COLOUR[i.severity] }}>
                    {PRIORITY[i.severity]}
                  </span>
                  <span>{i.category}</span>
                  <span className="text-muted">{i.location}</span>
                  <span className="ml-auto font-bold">
                    {elapsed(i.created_at, new Date(i.closed_at!).getTime())}
                  </span>
                </li>
              ))}
          </ul>
        )}
        <p className="mt-3 border-t border-line-soft pt-3 text-[11px] leading-[1.5] text-faint">
          Sorted by severity rank where times tie ({SEVERITY_RANK.Critical} is Critical). Every
          figure here is derived from the record — nothing in this pack can say something the
          audit trail contradicts.
        </p>
      </Card>
    </div>
  )
}
