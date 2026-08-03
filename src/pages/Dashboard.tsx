import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLive } from '../context/LiveContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Card, Empty, RestrictedTag, SeverityBadge, Spinner, StatusPill } from '../components/ui'
import { clockTime, elapsed } from '../lib/format'
import { OPEN_STATUSES, SEVERITY_COLOUR, SEVERITY_RANK, SEVERITY_TINT } from '../lib/style'
import { canWrite, type BoardIncident, type Severity, type TimelineEntry } from '../lib/types'
import { Button } from '../components/ui'

type SortKey = 'Time' | 'Severity' | 'Zone' | 'Category'

const COMMAND_RANK: Record<string, number> = {
  'Ground Team (L1)': 1,
  'Event Control (L2)': 2,
  'FMIC (L3)': 3,
  'Police Scotland (L4)': 4,
}

function StatTile({
  label,
  short,
  value,
  accent,
  valueColour,
}: {
  label: string
  /** Abbreviated for the compact phone strip, where four sit across. */
  short: string
  value: string | number
  accent: string
  valueColour?: string
}) {
  return (
    <div
      className="rounded-[3px] border border-line bg-white px-3 py-2.5 sm:px-4 sm:py-3.5"
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      <div className="text-[10px] leading-tight font-bold tracking-[0.5px] text-muted sm:text-[11px]">
        <span className="sm:hidden">{short}</span>
        <span className="hidden sm:inline">{label}</span>
      </div>
      <div
        className="text-[24px] leading-[1.2] font-bold sm:text-[30px]"
        style={{ color: valueColour ?? '#333333' }}
      >
        {value}
      </div>
    </div>
  )
}

function IncidentRow({ incident, flash }: { incident: BoardIncident; flash: boolean }) {
  const live = incident.status !== 'Resolved'
  return (
    <Link
      to={`/control/incident/${incident.id}`}
      className={`block border-b border-line-soft no-underline last:border-b-0 ${flash ? 'tide-flash' : ''}`}
      style={{
        backgroundColor: live ? SEVERITY_TINT[incident.severity] : undefined,
        opacity: live ? 1 : 0.72,
      }}
    >
      {/* Desktop grid */}
      <div className="hidden grid-cols-[64px_1.1fr_110px_1.3fr_120px_150px_12px] items-center gap-2 px-[18px] py-3.5 lg:grid">
        <div className="text-[13px] font-bold text-ink">{clockTime(incident.created_at)}</div>
        <div className="flex items-center gap-2 text-[13px] text-ink">
          {incident.category}
          {incident.restricted && <span title="Medical — restricted">🔒</span>}
        </div>
        <div>
          <SeverityBadge severity={incident.severity} />
        </div>
        <div className="truncate text-[13px] text-ink">{incident.location}</div>
        <div>
          <StatusPill status={incident.status} />
        </div>
        <div className="truncate text-[12px] font-bold text-ink">{incident.command_level}</div>
        <div className="text-[#c8c8c8]" aria-hidden="true">
          ›
        </div>
      </div>

      {/* Mobile / tablet card */}
      <div className="px-4 py-3.5 lg:hidden">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-bold text-ink">{clockTime(incident.created_at)}</span>
          <span className="text-[11px] text-faint">{incident.ref}</span>
          <SeverityBadge severity={incident.severity} small />
          <StatusPill status={incident.status} />
        </div>
        <div className="text-[13px] font-bold text-ink">
          {incident.category}
          {incident.restricted && <span title="Medical — restricted"> 🔒</span>}
        </div>
        <div className="text-[12px] text-muted">{incident.location}</div>
        <div className="mt-1 text-[11px] text-faint">
          {incident.command_level} · raised {elapsed(incident.created_at)} ago
        </div>
      </div>
    </Link>
  )
}

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
  const [sort, setSort] = useState<SortKey>('Time')
  const [commandLog, setCommandLog] = useState<TimelineEntry[]>([])

  // Command log: the escalation-relevant entries across the whole event.
  useEffect(() => {
    if (!activeEventId) return
    let active = true
    supabase
      .from('incident_timeline')
      .select('*')
      .eq('event_id', activeEventId)
      .in('entry_type', ['command', 'severity', 'closure', 'status'])
      .order('at', { ascending: false })
      .limit(8)
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
      resourced: open.filter((i) => (i.resources_deployed ?? '').trim().length > 0).length,
      highest: open.length > 0 ? highest : '—',
    }
  }, [open])

  const sorted = useMemo(() => {
    const rows = [...incidents]
    rows.sort((a, b) => {
      // Live incidents always sit above resolved ones.
      const aLive = a.status !== 'Resolved' ? 0 : 1
      const bLive = b.status !== 'Resolved' ? 0 : 1
      if (aLive !== bLive) return aLive - bLive

      switch (sort) {
        case 'Severity':
          return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
        case 'Zone':
          return a.location.localeCompare(b.location)
        case 'Category':
          return a.category.localeCompare(b.category)
        default:
          return b.created_at.localeCompare(a.created_at)
      }
    })
    return rows
  }, [incidents, sort])

  const zones = useMemo(() => {
    const list = activeEvent?.zones ?? []
    return list.map((zone) => {
      const active = open.filter((i) => i.location === zone)
      const worst = active.reduce<Severity | null>(
        (acc, i) => (acc === null || SEVERITY_RANK[i.severity] > SEVERITY_RANK[acc] ? i.severity : acc),
        null,
      )
      return { zone, count: active.length, worst }
    })
  }, [activeEvent, open])

  if (!activeEvent) {
    return (
      <div className="px-4 py-10 sm:px-7">
        <Empty>No event selected. Create one under Event Settings.</Empty>
      </div>
    )
  }

  const pendingHere = pending.filter((p) => p.event_id === activeEvent.id)

  return (
    <div className="px-4 pb-8 sm:px-7">
      {rejected.length > 0 && (
        <div className="mt-5 rounded-[3px] border border-alert bg-[#fdf2f4] px-4 py-3.5">
          <p className="text-[12px] font-bold text-alert">
            {rejected.length} incident{rejected.length === 1 ? '' : 's'} logged offline could not
            be accepted by the server and {rejected.length === 1 ? 'was' : 'were'} not saved.
          </p>
          <ul className="mt-2 space-y-1">
            {rejected.map((r) => (
              <li key={r.id} className="text-[11px] leading-[1.5] text-ink">
                <b>
                  {r.category} · {r.severity} · {r.location}
                </b>{' '}
                — {r.last_error}
                <span className="block text-faint">
                  Raised {clockTime(r.created_at)}. Re-enter it manually if it still stands.
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={dismissRejected}
            className="mt-2 text-[11px] font-bold text-alert underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {pendingHere.length > 0 && (
        <div className="mt-5 rounded-[3px] border border-line bg-white px-4 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] font-bold text-ink">
              <span className="tide-pulse mr-1.5 inline-block h-[7px] w-[7px] rounded-full bg-[#4A7C8C] align-middle" />
              {pendingHere.length} incident{pendingHere.length === 1 ? '' : 's'} logged offline,
              waiting to sync
            </p>
            <Button
              variant="ghost"
              onClick={() => void syncNow()}
              disabled={!navigator.onLine}
              className="!px-3 !py-1.5 !text-[11px]"
            >
              {navigator.onLine ? 'Sync now' : 'Waiting for signal'}
            </Button>
          </div>
          <ul className="mt-2.5 divide-y divide-line-soft">
            {pendingHere.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="text-[13px] font-bold text-ink">{clockTime(p.created_at)}</span>
                <SeverityBadge severity={p.severity} small />
                <span className="text-[13px] text-ink">{p.category}</span>
                <span className="text-[12px] text-muted">{p.location}</span>
                <span className="ml-auto rounded-[2px] border border-line bg-wash px-2 py-0.5 text-[10px] font-bold tracking-[0.5px] text-faint">
                  NOT YET ON THE BOARD
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-[1.5] text-faint">
            These are held on this device only. They are not visible to the rest of the control
            room, and will not carry an incident reference, until they sync.
          </p>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 pt-4 sm:gap-3 sm:pt-5 md:grid-cols-3 xl:grid-cols-5">
        <StatTile label="OPEN INCIDENTS" short="OPEN" value={stats.open} accent="#333333" />
        <StatTile
          label="CRITICAL"
          short="CRIT"
          value={stats.critical}
          accent={SEVERITY_COLOUR.Critical}
          valueColour={stats.critical > 0 ? SEVERITY_COLOUR.Critical : undefined}
        />
        <StatTile
          label="MAJOR"
          short="MAJOR"
          value={stats.major}
          accent={SEVERITY_COLOUR.Major}
          valueColour={stats.major > 0 ? SEVERITY_COLOUR.Major : undefined}
        />
        <StatTile
          label="RESOURCES DEPLOYED"
          short="RES"
          value={stats.resourced}
          accent="#333333"
        />
        {/* One slim line on a phone; a tile alongside the rest on desktop. */}
        <div className="col-span-4 flex items-baseline gap-2 rounded-[3px] bg-ink px-3 py-2 sm:px-4 sm:py-3.5 md:col-span-3 md:block xl:col-span-1">
          <div className="text-[10px] leading-tight font-bold tracking-[0.5px] whitespace-nowrap text-[#d8d8d8] sm:text-[11px]">
            HIGHEST COMMAND
            <span className="hidden sm:inline"> ENGAGED</span>
          </div>
          <div className="text-[13px] leading-tight font-bold text-teal sm:mt-0.5 sm:text-[18px]">
            {stats.highest}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 pt-4 xl:grid-cols-[2.1fr_1fr]">
        <Card
          padded={false}
          title="Active & Recent Incidents"
          action={
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <span className="font-bold text-ink">Sort:</span>
              {(['Time', 'Severity', 'Zone', 'Category'] as SortKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSort(key)}
                  className={sort === key ? 'font-bold text-ink underline' : 'hover:text-ink'}
                >
                  {key}
                </button>
              ))}
            </div>
          }
        >
          <div className="hidden grid-cols-[64px_1.1fr_110px_1.3fr_120px_150px_12px] gap-2 border-b border-line bg-wash px-[18px] py-2.5 text-[10px] font-bold tracking-[0.5px] text-faint lg:grid">
            <div>TIME</div>
            <div>CATEGORY</div>
            <div>SEVERITY</div>
            <div>ZONE</div>
            <div>STATUS</div>
            <div>COMMAND</div>
            <div />
          </div>

          {loading ? (
            <Spinner label="Loading incident board" />
          ) : sorted.length === 0 ? (
            <Empty>
              No incidents logged for this event yet.
              {canWrite(profile?.role) && (
                <>
                  {' '}
                  <Link to="/control/new" className="font-bold text-teal underline">
                    Log the first one
                  </Link>
                  .
                </>
              )}
            </Empty>
          ) : (
            sorted
              .slice(0, 40)
              .map((incident) => (
                <IncidentRow
                  key={incident.id}
                  incident={incident}
                  flash={recentlyChanged.has(incident.id)}
                />
              ))
          )}
        </Card>

        <div className="flex flex-col gap-3.5">
          <Card title="Site Overview — Zone Status">
            {zones.length === 0 ? (
              <p className="text-[12px] text-faint">No zones configured for this event.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {zones.map(({ zone, count, worst }) => (
                  <div
                    key={zone}
                    className="rounded-[3px] p-2.5"
                    style={
                      worst
                        ? {
                            border: `2px solid ${SEVERITY_COLOUR[worst]}`,
                            backgroundColor: SEVERITY_TINT[worst],
                          }
                        : { border: '1px solid #E0DAD5', backgroundColor: '#FAFAFA' }
                    }
                  >
                    <div
                      className="text-[11px] font-bold"
                      style={{ color: worst ? '#333333' : '#8a8a8a' }}
                    >
                      {zone}
                    </div>
                    <div
                      className="mt-0.5 text-[10px]"
                      style={{ color: worst ? '#6b6b6b' : '#9a9a9a' }}
                    >
                      {count > 0 ? `${count} active` : 'clear'}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3.5 flex flex-wrap gap-3 border-t border-line-soft pt-3 text-[10px] text-muted">
              {(['Minor', 'Moderate', 'Major', 'Critical'] as Severity[]).map((s) => (
                <span key={s}>
                  <span style={{ color: SEVERITY_COLOUR[s] }} aria-hidden="true">
                    ●
                  </span>{' '}
                  {s}
                </span>
              ))}
            </div>
          </Card>

          <div className="rounded-[3px] bg-ink px-4 py-4">
            <h2 className="mb-2.5 text-[13px] font-bold text-white">Command Log</h2>
            {commandLog.length === 0 ? (
              <p className="text-[11px] text-[#b8b8b8]">
                No command-level actions recorded yet.
              </p>
            ) : (
              <ul className="space-y-1.5 text-[11px] leading-[1.6] text-[#d8d8d8]">
                {commandLog.map((entry) => (
                  <li key={entry.id}>
                    <span className="font-bold text-teal">{clockTime(entry.at)}</span> —{' '}
                    {entry.body}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!canWrite(profile?.role) && (
            <div className="rounded-[3px] border border-line bg-white px-4 py-3.5">
              <RestrictedTag>READ &amp; EXPORT ACCESS</RestrictedTag>
              <p className="mt-2 text-[11px] leading-[1.5] text-muted">
                Your role has oversight and audit rights. Logging and updating incidents is
                carried out by the Incident Commander, Security Supervisor and Medical Lead.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
