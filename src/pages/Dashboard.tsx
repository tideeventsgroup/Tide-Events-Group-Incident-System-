import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLive } from '../context/LiveContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Empty } from '../components/ui'
import { clockTime, elapsed, elapsedClock, stamp } from '../lib/format'
import {
  COMMAND_RANK,
  COMMAND_SHORT,
  OPEN_STATUSES,
  PRIORITY,
  SEVERITY_COLOUR_DARK,
  SEVERITY_RANK,
  SEVERITY_TINT_DARK,
  STATUS_COLOUR_DARK,
} from '../lib/style'
import {
  canWrite,
  REVIEW_DUE_MINUTES,
  reviewOverdueBy,
  type BoardIncident,
  type Severity,
  type TimelineEntry,
} from '../lib/types'

/**
 * The incident board, as a command console.
 *
 * Laid out the way a dispatch screen is: a tote board of counts across the
 * top, a priority-ordered queue of live calls filling the screen, and a rail
 * carrying the selected call, sector status and the command log. One screen —
 * selecting a call previews it in place rather than navigating away, because
 * a control room that loses the board to open a record has lost the board.
 *
 * Every call carries a running clock instead of a timestamp. Dispatch screens
 * count up: an operator reads the row and knows how long it has been sitting,
 * and the clock turns as the incident's review threshold approaches and again
 * when it passes.
 */

type SortKey = 'PRI' | 'TIME' | 'ZONE'
type Filter = 'all' | 'live' | 'p12' | 'due' | 'unresourced'

const FILTERS: { key: Filter; label: string; alarm?: boolean }[] = [
  { key: 'live', label: 'LIVE' },
  { key: 'p12', label: 'P1 · P2' },
  { key: 'due', label: 'REVIEW DUE', alarm: true },
  { key: 'unresourced', label: 'NO RESOURCE' },
  { key: 'all', label: 'ALL' },
]

/* ------------------------------------------------------------------ hooks */

function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const update = () => setMatches(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [query])
  return matches
}

/* ------------------------------------------------------------- utilities */

/** How close an open incident is to its review threshold. */
function reviewState(incident: BoardIncident, now: number): 'ok' | 'near' | 'over' {
  if (incident.status === 'Resolved') return 'ok'
  const mins = (now - new Date(incident.last_update_at).getTime()) / 60_000
  const limit = REVIEW_DUE_MINUTES[incident.severity]
  if (mins >= limit) return 'over'
  if (mins >= limit * 0.75) return 'near'
  return 'ok'
}

/**
 * Whether anything is deployed against a call — but "restricted" is a third
 * answer, not a synonym for "none". Resources on a medical incident are masked
 * for roles without clearance, and a board that rendered that as *nothing sent*
 * would be telling a Security Supervisor something untrue about a casualty.
 */
function resourceState(i: BoardIncident): 'deployed' | 'none' | 'restricted' {
  if (i.restricted) return 'restricted'
  return (i.resources_deployed ?? '').trim().length > 0 ? 'deployed' : 'none'
}

/** An open call this viewer can see has nothing deployed against it. */
const needsResource = (i: BoardIncident) =>
  i.status !== 'Resolved' && resourceState(i) === 'none'

/* ------------------------------------------------------------ components */

function Pri({ severity }: { severity: Severity }) {
  return (
    <span
      className={`cc-pri cc-num ${severity === 'Critical' ? 'tide-pulse' : ''}`}
      style={{
        backgroundColor: SEVERITY_COLOUR_DARK[severity],
        color: severity === 'Minor' || severity === 'Moderate' ? '#1a1a1a' : '#ffffff',
      }}
      title={`${severity} — ${PRIORITY[severity]}`}
    >
      {PRIORITY[severity]}
    </span>
  )
}

function Status({ status }: { status: BoardIncident['status'] }) {
  return (
    <span
      className="text-[10.5px] font-bold tracking-[0.6px] whitespace-nowrap"
      style={{ color: STATUS_COLOUR_DARK[status] }}
    >
      {status.toUpperCase()}
    </span>
  )
}

/** The short flags that change what an operator does next. */
function Flags({ incident, now }: { incident: BoardIncident; now: number }) {
  const overdue = reviewOverdueBy(incident, now)
  return (
    <>
      {incident.restricted && (
        <span className="cc-flag" title="Medical — restricted">
          🔒 MED
        </span>
      )}
      {overdue !== null && (
        <span className="cc-flag is-alarm" title="No timeline entry within the review threshold">
          REVIEW {elapsed(incident.last_update_at, now)}
        </span>
      )}
      {needsResource(incident) && <span className="cc-flag">NO RESOURCE</span>}
      {incident.logged_offline && <span className="cc-flag">OFFLINE</span>}
      {incident.follow_up_required && <span className="cc-flag">FOLLOW-UP</span>}
    </>
  )
}

function QueueRow({
  incident,
  now,
  minute,
  selected,
  flash,
  onSelect,
  rowRef,
}: {
  incident: BoardIncident
  now: number
  minute: number
  selected: boolean
  flash: boolean
  onSelect: () => void
  rowRef: (el: HTMLButtonElement | null) => void
}) {
  const live = incident.status !== 'Resolved'
  const clock = reviewState(incident, now)

  return (
    <button
      type="button"
      ref={rowRef}
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={`cc-row ${selected ? 'is-selected' : ''} ${live ? '' : 'is-resolved'} ${
        flash ? 'cc-flash' : ''
      }`}
      style={
        live && !selected ? { backgroundColor: SEVERITY_TINT_DARK[incident.severity] } : undefined
      }
    >
      {/* Wide: one line per call, columns aligned to the header. */}
      <span className="cc-row-wide">
        <span>
          <Pri severity={incident.severity} />
        </span>
        <span className={`cc-clock cc-num is-${clock}`}>
          {live ? elapsedClock(incident.created_at, now) : '—'}
        </span>
        <span className="cc-num truncate text-[12px] font-bold text-[#ececec]">{incident.ref}</span>
        <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-[12.5px] text-[#ececec]">
          <span className="truncate">{incident.category}</span>
          <Flags incident={incident} now={minute} />
        </span>
        <span className="truncate text-[12px] text-[#b4b4b4]">{incident.location}</span>
        <span>
          <Status status={incident.status} />
        </span>
        <span className="cc-num truncate text-[10.5px] font-bold tracking-[0.5px] text-[#8f8f8f]">
          {COMMAND_SHORT[incident.command_level] ?? incident.command_level}
        </span>
      </span>

      {/* Narrow: the same information, stacked. */}
      <span className="cc-row-narrow">
        <span className="flex flex-wrap items-center gap-2">
          <Pri severity={incident.severity} />
          <span className={`cc-clock cc-num is-${clock}`}>
            {live ? elapsedClock(incident.created_at, now) : 'CLOSED'}
          </span>
          <span className="cc-num text-[11.5px] font-bold text-[#9a9a9a]">{incident.ref}</span>
          <span className="ml-auto">
            <Status status={incident.status} />
          </span>
        </span>
        <span className="mt-1.5 block text-[13px] font-bold text-[#ececec]">
          {incident.category}
          <span className="font-normal text-[#8f8f8f]"> · {incident.location}</span>
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="cc-flag">{COMMAND_SHORT[incident.command_level]}</span>
          <Flags incident={incident} now={minute} />
        </span>
      </span>
    </button>
  )
}

function Panel({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="cc-panel">
      <header className="cc-panel-head">
        <h2 className="cc-panel-title">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="cc-label">{label}</div>
      <div className="mt-0.5 text-[12.5px] leading-[1.5] text-[#e0e0e0]">{children}</div>
    </div>
  )
}

/** The selected call, previewed without leaving the board. */
function CallPreview({ incident, now }: { incident: BoardIncident; now: number }) {
  const overdue = reviewOverdueBy(incident, now)
  return (
    <div>
      <div
        className="flex flex-wrap items-center gap-2 border-b border-[#2b2b2b] px-3.5 py-3"
        style={{ backgroundColor: SEVERITY_TINT_DARK[incident.severity] }}
      >
        <Pri severity={incident.severity} />
        <span className="cc-num text-[13px] font-bold">{incident.ref}</span>
        <span className="text-[12.5px] text-[#c8c8c8]">{incident.severity}</span>
        <span className="ml-auto">
          <Status status={incident.status} />
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 px-3.5 py-3">
        <Field label="Elapsed">
          <span
            className={`cc-num font-bold is-${reviewState(incident, now)} cc-clock`}
            style={{ fontSize: 15 }}
          >
            {incident.status === 'Resolved'
              ? 'CLOSED'
              : elapsedClock(incident.created_at, now)}
          </span>
        </Field>
        <Field label="Raised">{stamp(incident.created_at)}</Field>
        <Field label="Category">{incident.category}</Field>
        <Field label="Sector">{incident.location}</Field>
        <Field label="Command">{incident.command_level}</Field>
        <Field label="Last update">
          {elapsed(incident.last_update_at, now)} ago
          {overdue !== null && <span className="ml-1.5 cc-flag is-alarm">REVIEW DUE</span>}
        </Field>
      </div>

      <div className="flex flex-col gap-3 border-t border-[#2b2b2b] px-3.5 py-3">
        <Field label="Resource deployed">
          {resourceState(incident) === 'deployed' && incident.resources_deployed}
          {resourceState(incident) === 'none' && <span className="cc-flag">NONE RECORDED</span>}
          {resourceState(incident) === 'restricted' && (
            <span className="text-[#8f8f8f]">🔒 Restricted with the medical detail.</span>
          )}
        </Field>
        <Field label={incident.restricted ? 'Detail — restricted' : 'Detail'}>
          {incident.restricted ? (
            <span className="text-[#8f8f8f]">
              🔒 Medical detail is not released to your role. Category, priority, sector and status
              are shown above.
            </span>
          ) : (
            incident.description || <span className="text-[#6e6e6e]">No description recorded.</span>
          )}
        </Field>
        {incident.reported_by && <Field label="Reported by">{incident.reported_by}</Field>}
      </div>

      <div className="border-t border-[#2b2b2b] px-3.5 py-3">
        <Link
          to={`/control/incident/${incident.id}`}
          className="flex items-center justify-center gap-2 rounded-[2px] bg-teal px-3 py-2.5 text-[12px] font-bold tracking-[0.6px] text-[#10343a] no-underline"
        >
          OPEN FULL RECORD <span className="cc-key">↵</span>
        </Link>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ page */

export default function Dashboard() {
  const {
    incidents,
    activeEvent,
    activeEventId,
    recentlyChanged,
    loading,
    lastSync,
    pending,
    rejected,
    dismissRejected,
    syncNow,
  } = useLive()
  const { profile } = useAuth()
  const navigate = useNavigate()

  // The clocks tick every second; review-due is a per-minute judgement. Pinning
  // the derived work to the minute keeps a re-sort of the whole queue — and a
  // rebind of the key handler — off the once-a-second path.
  const now = useNow(1000)
  const minute = useMemo(() => Math.floor(now / 60_000) * 60_000, [now])
  const wide = useMediaQuery('(min-width: 1280px)')
  const write = canWrite(profile?.role)

  const [sort, setSort] = useState<SortKey>('PRI')
  const [filter, setFilter] = useState<Filter>('live')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [commandLog, setCommandLog] = useState<TimelineEntry[]>([])

  const searchRef = useRef<HTMLInputElement>(null)
  const rowRefs = useRef(new Map<string, HTMLButtonElement>())

  // Command log: the escalation-relevant entries across the whole event.
  useEffect(() => {
    if (!activeEventId) return
    let active = true
    void supabase
      .from('incident_timeline')
      .select('*')
      .eq('event_id', activeEventId)
      .in('entry_type', ['command', 'severity', 'closure', 'status'])
      .order('at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (active) setCommandLog((data as TimelineEntry[]) ?? [])
      })
    return () => {
      active = false
    }
  }, [activeEventId, lastSync])

  const open = useMemo(
    () => incidents.filter((i) => OPEN_STATUSES.includes(i.status)),
    [incidents],
  )

  const stats = useMemo(() => {
    const bySeverity = (s: Severity) => open.filter((i) => i.severity === s).length
    const highest = open.reduce(
      (acc, i) => (COMMAND_RANK[i.command_level] > COMMAND_RANK[acc] ? i.command_level : acc),
      'Ground Team (L1)',
    )
    return {
      open: open.length,
      critical: bySeverity('Critical'),
      major: bySeverity('Major'),
      unresourced: open.filter(needsResource).length,
      reviewDue: open.filter((i) => reviewOverdueBy(i, minute) !== null).length,
      highest: open.length > 0 ? highest : 'Ground Team (L1)',
    }
  }, [open, minute])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    let rows = incidents.filter((i) => {
      switch (filter) {
        case 'live':
          return i.status !== 'Resolved'
        case 'p12':
          return i.status !== 'Resolved' && SEVERITY_RANK[i.severity] >= 3
        case 'due':
          return reviewOverdueBy(i, minute) !== null
        case 'unresourced':
          return needsResource(i)
        default:
          return true
      }
    })

    if (q) {
      rows = rows.filter((i) =>
        [i.ref, i.category, i.location, i.command_level, i.status, i.description ?? '']
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
    }

    return [...rows].sort((a, b) => {
      // Live calls always sit above closed ones, whatever the sort.
      const aLive = a.status !== 'Resolved' ? 0 : 1
      const bLive = b.status !== 'Resolved' ? 0 : 1
      if (aLive !== bLive) return aLive - bLive

      switch (sort) {
        case 'ZONE':
          return a.location.localeCompare(b.location) || a.created_at.localeCompare(b.created_at)
        case 'TIME':
          return b.created_at.localeCompare(a.created_at)
        default:
          // Dispatch order: highest priority first, then longest waiting.
          return (
            SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
            a.created_at.localeCompare(b.created_at)
          )
      }
    })
  }, [incidents, filter, query, sort, minute])

  const selected = useMemo(
    () => shown.find((i) => i.id === selectedId) ?? null,
    [shown, selectedId],
  )

  // A selection that has been filtered off the queue is stale — drop it.
  useEffect(() => {
    if (selectedId && !shown.some((i) => i.id === selectedId)) setSelectedId(null)
  }, [shown, selectedId])

  const openRecord = useCallback(
    (id: string) => navigate(`/control/incident/${id}`),
    [navigate],
  )

  const pick = useCallback(
    (id: string) => {
      if (wide) setSelectedId(id)
      else openRecord(id)
    },
    [wide, openRecord],
  )

  const move = useCallback(
    (delta: number) => {
      if (shown.length === 0) return
      const at = shown.findIndex((i) => i.id === selectedId)
      const next = shown[Math.max(0, Math.min(shown.length - 1, at < 0 ? 0 : at + delta))]
      setSelectedId(next.id)
      rowRefs.current.get(next.id)?.scrollIntoView({ block: 'nearest' })
      rowRefs.current.get(next.id)?.focus({ preventScroll: true })
    },
    [shown, selectedId],
  )

  // Keyboard first, like the console it is imitating. Shortcuts stand down
  // whenever focus is in a field, so typing a zone name never dispatches.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null
      const typing =
        !!el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable)

      if (e.key === 'Escape') {
        if (typing) el?.blur()
        else setQuery('')
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/' && !typing) {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }

      // Arrows step into the queue straight out of the filter box, so a search
      // and the call it turns up are one movement.
      const arrow = e.key === 'ArrowDown' || e.key === 'ArrowUp'
      if (typing && !(arrow && el === searchRef.current)) return

      if (arrow || e.key === 'j' || e.key === 'k') {
        e.preventDefault()
        move(e.key === 'ArrowUp' || e.key === 'k' ? -1 : 1)
        return
      }

      if (e.key === 'Enter') {
        // A focused chip or button owns its own Enter — only the queue's rows
        // hand it on to "open the selected call".
        const interactive = el?.closest('button, a, [role="button"]')
        if (interactive && !interactive.classList.contains('cc-row')) return
        if (!selectedId) return
        e.preventDefault()
        openRecord(selectedId)
        return
      }

      if ((e.key === 'n' || e.key === 'N') && write) {
        e.preventDefault()
        navigate('/control/new')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [move, selectedId, openRecord, navigate, write])

  const sectors = useMemo(() => {
    const list = activeEvent?.zones ?? []
    return list.map((zone) => {
      const active = open.filter((i) => i.location === zone)
      const worst = active.reduce<Severity | null>(
        (acc, i) =>
          acc === null || SEVERITY_RANK[i.severity] > SEVERITY_RANK[acc] ? i.severity : acc,
        null,
      )
      return { zone, count: active.length, worst }
    })
  }, [activeEvent, open])

  if (!activeEvent) {
    return (
      <div className="cc">
        <Empty>No event selected. Create one under Event Settings.</Empty>
      </div>
    )
  }

  const pendingHere = pending.filter((p) => p.event_id === activeEvent.id)
  const escalated = COMMAND_RANK[stats.highest] >= 3
  const alarm = stats.critical > 0 || escalated

  return (
    <div className="cc">
      {/* ------------------------------------------------------ alert strip */}
      {alarm && (
        <div className="cc-alert" role="status">
          <span className="tide-pulse">●</span>
          {stats.critical > 0 && (
            <span>
              P1 CRITICAL — {stats.critical} OPEN
            </span>
          )}
          {escalated && <span>{stats.highest.toUpperCase()} ENGAGED</span>}
          {stats.reviewDue > 0 && <span>{stats.reviewDue} AWAITING REVIEW</span>}
        </div>
      )}

      {/* ------------------------------------------------------- tote board */}
      <div className="cc-tote">
        <div className="cc-tote-cell">
          <div className="cc-label">Open</div>
          <div className={`cc-tote-value cc-num ${stats.open === 0 ? 'is-quiet' : ''}`}>
            {stats.open}
          </div>
        </div>
        <div className="cc-tote-cell">
          <div className="cc-label">P1 Critical</div>
          <div
            className={`cc-tote-value cc-num ${stats.critical === 0 ? 'is-quiet' : ''}`}
            style={stats.critical > 0 ? { color: SEVERITY_COLOUR_DARK.Critical } : undefined}
          >
            {stats.critical}
          </div>
        </div>
        <div className="cc-tote-cell">
          <div className="cc-label">P2 Major</div>
          <div
            className={`cc-tote-value cc-num ${stats.major === 0 ? 'is-quiet' : ''}`}
            style={stats.major > 0 ? { color: SEVERITY_COLOUR_DARK.Major } : undefined}
          >
            {stats.major}
          </div>
        </div>
        <div className="cc-tote-cell">
          <div className="cc-label">Review due</div>
          <div
            className={`cc-tote-value cc-num ${stats.reviewDue === 0 ? 'is-quiet' : ''}`}
            style={stats.reviewDue > 0 ? { color: SEVERITY_COLOUR_DARK.Critical } : undefined}
          >
            {stats.reviewDue}
          </div>
        </div>
        <div className="cc-tote-cell">
          <div className="cc-label">No resource</div>
          <div className={`cc-tote-value cc-num ${stats.unresourced === 0 ? 'is-quiet' : ''}`}>
            {stats.unresourced}
          </div>
        </div>
        <div className="cc-tote-cell">
          <div className="cc-label">Command engaged</div>
          <div className="cc-tote-text">{stats.open > 0 ? stats.highest : 'Standby'}</div>
        </div>
      </div>

      {/* ------------------------------------------------ offline / rejected */}
      {(rejected.length > 0 || pendingHere.length > 0) && (
        <div className="flex flex-col gap-2 px-3.5 pt-3 sm:px-[18px]">
          {rejected.length > 0 && (
            <div className="border border-[#5c1c27] bg-[#2a0d13] px-3.5 py-3">
              <p className="text-[12px] font-bold text-[#ff8a99]">
                {rejected.length} incident{rejected.length === 1 ? '' : 's'} logged offline could
                not be accepted by the server and {rejected.length === 1 ? 'was' : 'were'} not
                saved.
              </p>
              <ul className="mt-2 space-y-1">
                {rejected.map((r) => (
                  <li key={r.id} className="text-[11px] leading-[1.5] text-[#e0e0e0]">
                    <b>
                      {r.category} · {r.severity} · {r.location}
                    </b>{' '}
                    — {r.last_error}
                    <span className="block text-[#9a9a9a]">
                      Raised {clockTime(r.created_at)}. Re-enter it manually if it still stands.
                    </span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={dismissRejected}
                className="mt-2 text-[11px] font-bold text-[#ff8a99] underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {pendingHere.length > 0 && (
            <div className="border border-[#363636] bg-[#1e1e1e] px-3.5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12px] font-bold text-[#ececec]">
                  <span className="tide-pulse mr-1.5 inline-block h-[7px] w-[7px] rounded-full bg-[#63A6BC] align-middle" />
                  {pendingHere.length} incident{pendingHere.length === 1 ? '' : 's'} held on this
                  device, waiting to sync
                </p>
                <button
                  type="button"
                  onClick={() => void syncNow()}
                  disabled={!navigator.onLine}
                  className="cc-chip disabled:opacity-50"
                >
                  {navigator.onLine ? 'SYNC NOW' : 'WAITING FOR SIGNAL'}
                </button>
              </div>
              <ul className="mt-2.5">
                {pendingHere.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center gap-2 border-t border-[#2b2b2b] py-2"
                  >
                    <Pri severity={p.severity} />
                    <span className="cc-num text-[12.5px] font-bold text-[#ececec]">
                      {clockTime(p.created_at)}
                    </span>
                    <span className="text-[12.5px] text-[#ececec]">{p.category}</span>
                    <span className="text-[12px] text-[#9a9a9a]">{p.location}</span>
                    <span className="cc-flag ml-auto">NOT YET ON THE BOARD</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] leading-[1.5] text-[#8f8f8f]">
                Not visible to the rest of the control room, and carrying no incident reference,
                until they sync.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------ board */}
      <div className="cc-body">
        <Panel
          title={`Call queue — ${shown.length}${
            filter === 'all' ? '' : ` of ${incidents.length}`
          }`}
          action={
            <div className="flex items-center gap-2">
              <span className="cc-label">Sort</span>
              {(['PRI', 'TIME', 'ZONE'] as SortKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSort(key)}
                  className={`cc-chip ${sort === key ? 'is-on' : ''}`}
                >
                  {key}
                </button>
              ))}
            </div>
          }
        >
          <div className="cc-bar">
            <label className="cc-search">
              <span className="sr-only">Filter the call queue</span>
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by reference, category, sector…   /"
              />
            </label>
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`cc-chip ${f.alarm ? 'is-alarm' : ''} ${
                  filter === f.key ? 'is-on' : ''
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="cc-cols">
            <span className="cc-label">Pri</span>
            <span className="cc-label">Elapsed</span>
            <span className="cc-label">Ref</span>
            <span className="cc-label">Category</span>
            <span className="cc-label">Sector</span>
            <span className="cc-label">Status</span>
            <span className="cc-label">Command</span>
          </div>

          {loading ? (
            <p className="cc-queue-body px-3.5 py-10 text-center text-[12.5px] text-[#8f8f8f]">
              Loading incident board…
            </p>
          ) : shown.length === 0 ? (
            <p className="cc-queue-body px-3.5 py-10 text-center text-[12.5px] text-[#8f8f8f]">
              {incidents.length === 0 ? (
                <>
                  No incidents logged for this event.{' '}
                  {write && (
                    <Link to="/control/new" className="font-bold text-teal">
                      Log the first one
                    </Link>
                  )}
                </>
              ) : (
                <>
                  Nothing matches this filter.{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setFilter('all')
                      setQuery('')
                    }}
                    className="font-bold text-teal underline"
                  >
                    Show all
                  </button>
                </>
              )}
            </p>
          ) : (
            <div className="cc-queue-body">
              {shown.slice(0, 60).map((incident) => (
                <QueueRow
                  key={incident.id}
                  incident={incident}
                  now={now}
                  minute={minute}
                  selected={incident.id === selectedId}
                  flash={recentlyChanged.has(incident.id)}
                  onSelect={() => pick(incident.id)}
                  rowRef={(el) => {
                    if (el) rowRefs.current.set(incident.id, el)
                    else rowRefs.current.delete(incident.id)
                  }}
                />
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[#2b2b2b] px-3.5 py-2.5 text-[10.5px] text-[#6e6e6e]">
            <span>
              <span className="cc-key">↑</span> <span className="cc-key">↓</span> move
            </span>
            <span>
              <span className="cc-key">↵</span> open
            </span>
            <span>
              <span className="cc-key">/</span> filter
            </span>
            {write && (
              <span>
                <span className="cc-key">N</span> new incident
              </span>
            )}
            <span className="ml-auto">
              {lastSync ? `Board synced ${clockTime(lastSync)}` : 'Awaiting first sync'}
            </span>
          </div>
        </Panel>

        {/* ------------------------------------------------------------ rail */}
        <div className="cc-rail">
          {wide && (
            <Panel title={selected ? `Selected call — ${selected.ref}` : 'Selected call'}>
              {selected ? (
                <CallPreview incident={selected} now={now} />
              ) : (
                <p className="px-3.5 py-8 text-center text-[12px] leading-[1.6] text-[#6e6e6e]">
                  Select a call to preview it here without leaving the board.
                  <span className="mt-2 block">
                    <span className="cc-key">↑</span> <span className="cc-key">↓</span> to move
                    through the queue.
                  </span>
                </p>
              )}
            </Panel>
          )}

          <Panel
            title="Sector status"
            action={
              <span className="cc-label">
                {sectors.filter((s) => s.count === 0).length}/{sectors.length} clear
              </span>
            }
          >
            {sectors.length === 0 ? (
              <p className="px-3.5 py-6 text-center text-[12px] text-[#6e6e6e]">
                No sectors configured for this event.
              </p>
            ) : (
              <div className="cc-sectors">
                {sectors.map(({ zone, count, worst }) => (
                  <div
                    key={zone}
                    className="cc-sector"
                    style={
                      worst
                        ? {
                            borderLeftColor: SEVERITY_COLOUR_DARK[worst],
                            backgroundColor: SEVERITY_TINT_DARK[worst],
                          }
                        : undefined
                    }
                  >
                    <div className="cc-sector-name">{zone}</div>
                    <div
                      className="cc-sector-state cc-num"
                      style={worst ? { color: SEVERITY_COLOUR_DARK[worst] } : undefined}
                    >
                      {worst ? `${count} ACTIVE · ${PRIORITY[worst]}` : 'CLEAR'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Command log">
            {commandLog.length === 0 ? (
              <p className="px-3.5 py-6 text-center text-[12px] text-[#6e6e6e]">
                No command-level actions recorded yet.
              </p>
            ) : (
              <div>
                {commandLog.map((entry) => (
                  <div key={entry.id} className="cc-log-row">
                    <span className="cc-log-time cc-num">{clockTime(entry.at)}</span>
                    <span className="min-w-0">{entry.body}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {!write && (
            <div className="cc-panel px-3.5 py-3">
              <span className="cc-flag">READ &amp; EXPORT ACCESS</span>
              <p className="mt-2 text-[11.5px] leading-[1.5] text-[#9a9a9a]">
                Your role has oversight and audit rights. Logging and updating incidents is carried
                out by the Incident Commander, Security Supervisor and Medical Lead.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
