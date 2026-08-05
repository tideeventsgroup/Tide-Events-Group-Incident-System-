import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLive } from '../context/LiveContext'
import { supabase } from '../lib/supabase'
import { Banner, Button, Card, FieldLabel, SeverityBadge, Spinner, StatusPill } from '../components/ui'
import { clockTime, dateShort, elapsed, stamp } from '../lib/format'
import { RESOURCE_STATE_COLOUR, SEVERITY_COLOUR } from '../lib/style'
import {
  CATEGORIES,
  COMMAND_LEVELS,
  SEVERITIES,
  STATUSES,
  canSignOff,
  canWrite,
  type BoardIncident,
  type Category,
  type CommandLevel,
  type EntryType,
  type Severity,
  type Status,
  type TimelineEntry,
} from '../lib/types'

const ENTRY_LABEL: Record<EntryType, string> = {
  report: 'Initial report',
  update: 'Update',
  status: 'Status change',
  command: 'Command level',
  severity: 'Severity',
  resources: 'Resources',
  closure: 'Closure',
  system: 'System',
}

/** Entries the database generated, shown with a lighter treatment. */
const SYSTEM_ENTRIES: EntryType[] = ['status', 'command', 'severity', 'resources', 'system']

function TimelineItem({ entry, isLast }: { entry: TimelineEntry; isLast: boolean }) {
  const system = SYSTEM_ENTRIES.includes(entry.entry_type)
  const closure = entry.entry_type === 'closure'
  const accent = closure ? '#3D8361' : entry.entry_type === 'report' ? '#25BEC8' : '#E0DAD5'

  return (
    <li className="flex gap-3.5">
      <div className="relative flex flex-col items-center pt-1">
        <span
          className="block h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: accent === '#E0DAD5' ? '#c8c8c8' : accent }}
          aria-hidden="true"
        />
        {!isLast && <span className="mt-1 w-0.5 grow bg-line" aria-hidden="true" />}
      </div>

      <div className={`min-w-0 grow ${isLast ? 'pb-1' : 'pb-5'}`}>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span
            className="text-[11px] font-bold tracking-[0.5px]"
            style={{ color: closure ? '#3D8361' : entry.entry_type === 'report' ? '#25BEC8' : '#8a8a8a' }}
          >
            {clockTime(entry.at)}
          </span>
          <span className="text-[10px] tracking-[0.5px] text-faint uppercase">
            {ENTRY_LABEL[entry.entry_type]}
          </span>
        </div>
        <div className="mt-0.5 text-[13px] text-ink">
          <b>{entry.author_name}</b>{' '}
          {entry.author_role && (
            <span className="text-[11px] text-faint">{entry.author_role}</span>
          )}
        </div>
        <p
          className={`mt-1 text-[13px] leading-[1.5] whitespace-pre-wrap ${
            system ? 'text-muted italic' : 'text-ink'
          }`}
        >
          {entry.body}
        </p>
      </div>
    </li>
  )
}

export default function IncidentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, session } = useAuth()
  const { refresh, lastSync, events, units, dispatch } = useLive()

  const [incident, setIncident] = useState<BoardIncident | null>(null)
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [note, setNote] = useState('')
  const [outcome, setOutcome] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Draft state for the editable detail panel.
  const [draft, setDraft] = useState<{
    category: Category
    severity: Severity
    status: Status
    command_level: CommandLevel
    location: string
    resources_deployed: string
    follow_up_required: boolean
  } | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    const [{ data: inc }, { data: entries }] = await Promise.all([
      supabase.from('incident_board').select('*').eq('id', id).maybeSingle(),
      supabase.from('incident_timeline').select('*').eq('incident_id', id).order('at'),
    ])

    if (!inc) {
      setNotFound(true)
      setLoading(false)
      return
    }

    const row = inc as BoardIncident
    setIncident(row)
    setTimeline((entries as TimelineEntry[]) ?? [])
    setDraft((prev) =>
      prev ?? {
        category: row.category,
        severity: row.severity,
        status: row.status,
        command_level: row.command_level,
        location: row.location,
        resources_deployed: row.resources_deployed ?? '',
        follow_up_required: row.follow_up_required,
      },
    )
    setLoading(false)
  }, [id])

  useEffect(() => {
    setLoading(true)
    setDraft(null)
    void load()
  }, [load])

  // Follow the live board: any realtime nudge refreshes this incident too.
  useEffect(() => {
    if (!lastSync) return
    void load()
  }, [lastSync, load])

  // Zones come from the incident's own event, which is not necessarily the
  // one currently selected on the board.
  const zones = useMemo(
    () => events.find((e) => e.id === incident?.event_id)?.zones ?? [],
    [events, incident?.event_id],
  )
  const committedUnits = useMemo(
    () => units.filter((u) => u.assigned_incident_id === id),
    [units, id],
  )

  const writable = canWrite(profile?.role) && !!incident && !incident.event_locked
  const closed = incident?.status === 'Resolved'

  const dirty = useMemo(() => {
    if (!incident || !draft) return false
    return (
      draft.category !== incident.category ||
      draft.severity !== incident.severity ||
      draft.status !== incident.status ||
      draft.command_level !== incident.command_level ||
      draft.location !== incident.location ||
      draft.resources_deployed !== (incident.resources_deployed ?? '') ||
      draft.follow_up_required !== incident.follow_up_required
    )
  }, [incident, draft])

  async function applyUpdate(patch: Record<string, unknown>, successReset?: () => void) {
    setError(null)
    setBusy(true)
    const { error: err } = await supabase.from('incidents').update(patch).eq('id', id!)
    setBusy(false)
    if (err) {
      setError(err.message)
      return false
    }
    successReset?.()
    await Promise.all([load(), refresh()])
    return true
  }

  async function addNote() {
    if (!note.trim() || !incident) return
    setError(null)
    setBusy(true)
    const { error: err } = await supabase.from('incident_updates').insert({
      incident_id: incident.id,
      event_id: incident.event_id,
      author_id: session!.user.id,
      author_name: profile!.full_name,
      author_role: profile!.role,
      entry_type: 'update',
      body: note.trim(),
    })
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    setNote('')
    await Promise.all([load(), refresh()])
  }

  async function saveDetails() {
    if (!draft) return
    await applyUpdate({
      category: draft.category,
      severity: draft.severity,
      status: draft.status,
      command_level: draft.command_level,
      location: draft.location,
      resources_deployed: draft.resources_deployed.trim() || null,
      follow_up_required: draft.follow_up_required,
    })
  }

  async function signOff() {
    if (!outcome.trim()) {
      setError('An outcome summary is required to close an incident.')
      return
    }
    const ok = await applyUpdate(
      {
        status: 'Resolved',
        outcome: outcome.trim(),
        closed_by: session!.user.id,
        closed_at: new Date().toISOString(),
      },
      () => setOutcome(''),
    )
    if (ok) setDraft(null)
  }

  async function escalate() {
    if (!incident) return
    const idx = COMMAND_LEVELS.indexOf(incident.command_level)
    if (idx >= COMMAND_LEVELS.length - 1) return
    const next = COMMAND_LEVELS[idx + 1]
    const ok = await applyUpdate({ command_level: next, status: 'Escalated' })
    if (ok) setDraft(null)
  }

  if (loading) return <Spinner label="Loading incident" />

  if (notFound) {
    return (
      <div className="mx-auto max-w-[1080px] px-4 py-8 sm:px-7">
        <Banner tone="error">
          This incident could not be opened. It may belong to an event you are not linked to, or be
          a medical record your role cannot see.
        </Banner>
        <p className="mt-4">
          <Link to="/control" className="text-[13px] font-bold text-teal underline">
            ← Back to dashboard
          </Link>
        </p>
      </div>
    )
  }

  if (!incident || !draft) return null

  return (
    <div className="mx-auto max-w-[1080px] px-4 pt-5 pb-16 sm:px-7">
      <button
        type="button"
        onClick={() => navigate('/control')}
        className="text-[12px] text-faint hover:text-ink"
      >
        ← Back to dashboard
      </button>

      <div className="mt-2.5 mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
            <span className="text-[13px] font-bold tracking-[0.5px] text-faint">
              {incident.ref}
            </span>
            <SeverityBadge severity={incident.severity} />
            <StatusPill status={incident.status} />
            {incident.restricted && (
              <span className="rounded-[2px] border border-line bg-wash px-2 py-1 text-[10px] font-bold tracking-[0.5px] text-faint">
                🔒 MEDICAL — RESTRICTED
              </span>
            )}
            {incident.follow_up_required && (
              <span className="rounded-[2px] border border-line bg-wash px-2 py-1 text-[10px] font-bold tracking-[0.5px] text-muted">
                FOLLOW-UP REQUIRED
              </span>
            )}
          </div>
          <h1 className="text-[22px] leading-tight font-bold text-ink sm:text-[24px]">
            {incident.category} — {incident.location}
          </h1>
          <p className="mt-1 text-[12px] text-muted">
            Raised {dateShort(incident.created_at)} at {clockTime(incident.created_at)}
            {incident.reported_by ? ` by ${incident.reported_by}` : ''} · Command level:{' '}
            <b className="text-ink">{incident.command_level}</b>
            {!closed && <> · open {elapsed(incident.created_at)}</>}
          </p>
        </div>

        {writable && !closed && incident.command_level !== 'Police Scotland (L4)' && (
          <Button variant="dark" onClick={() => void escalate()} disabled={busy}>
            + Escalate Command Level
          </Button>
        )}
      </div>

      {incident.event_locked && (
        <div className="mb-4">
          <Banner tone="info">
            This event has been ended. Its records are locked and read-only.
          </Banner>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <Banner tone="error">{error}</Banner>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* ------------------------------------------------ timeline column */}
        <div className="flex flex-col gap-4">
          {writable && !closed && (
            <Card title="Log Update">
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a timestamped update to this incident…"
                className="mb-2.5"
                aria-label="New timeline update"
              />
              <div className="flex justify-end">
                <Button onClick={() => void addNote()} disabled={busy || !note.trim()}>
                  Add to Timeline
                </Button>
              </div>
            </Card>
          )}

          <Card title="Incident Timeline">
            {timeline.length === 0 ? (
              <Banner tone="info">
                🔒 The narrative for this incident is restricted. You can see its category, severity,
                location and status above.
              </Banner>
            ) : (
              <ol className="mt-1">
                {timeline.map((entry, i) => (
                  <TimelineItem
                    key={entry.id}
                    entry={entry}
                    isLast={i === timeline.length - 1}
                  />
                ))}
              </ol>
            )}
          </Card>

          {closed && incident.outcome && (
            <Card title="Closure Record">
              <p className="text-[13px] leading-[1.6] whitespace-pre-wrap text-ink">
                {incident.outcome}
              </p>
              <p className="mt-3 border-t border-line-soft pt-3 text-[11px] text-faint">
                Signed off by <b className="text-ink">{incident.closed_by_name ?? 'unknown'}</b>
                {incident.closed_at ? ` at ${stamp(incident.closed_at)}` : ''}. This entry is
                locked into the audit record.
              </p>
            </Card>
          )}
        </div>

        {/* ------------------------------------------------- sidebar column */}
        <div className="flex flex-col gap-3.5">
          {/* Who is on this call, and the response times it will be judged on.
              Assignment itself is done on the board, where the free units are. */}
          <Card title="Units &amp; Response">
            <div className="grid grid-cols-2 gap-3 border-b border-line-soft pb-3">
              <div>
                <div className="text-[10px] font-bold tracking-[0.5px] text-faint">
                  ACKNOWLEDGED
                </div>
                <div className="mt-0.5 text-[13px] text-ink">
                  {incident.acknowledged_at ? (
                    <>
                      {clockTime(incident.acknowledged_at)}{' '}
                      <span className="text-[11px] text-muted">
                        (+{elapsed(incident.created_at, new Date(incident.acknowledged_at).getTime())})
                      </span>
                    </>
                  ) : (
                    <span className="text-[12px] font-bold text-alert">Not acknowledged</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold tracking-[0.5px] text-faint">ON SCENE</div>
                <div className="mt-0.5 text-[13px] text-ink">
                  {incident.on_scene_at ? (
                    <>
                      {clockTime(incident.on_scene_at)}{' '}
                      <span className="text-[11px] text-muted">
                        (+{elapsed(incident.created_at, new Date(incident.on_scene_at).getTime())})
                      </span>
                    </>
                  ) : (
                    <span className="text-[12px] text-faint">—</span>
                  )}
                </div>
              </div>
            </div>

            {committedUnits.length === 0 ? (
              <p className="pt-3 text-[12px] text-faint">
                No unit is committed to this incident.
                {writable && !closed && (
                  <>
                    {' '}
                    Dispatch one from the{' '}
                    <Link to="/control" className="font-bold text-teal underline">
                      board
                    </Link>
                    .
                  </>
                )}
              </p>
            ) : (
              <ul className="pt-3">
                {committedUnits.map((u) => (
                  <li
                    key={u.id}
                    className="flex flex-wrap items-center gap-2 border-b border-line-soft py-2 last:border-b-0"
                  >
                    <span className="text-[13px] font-bold text-ink">{u.callsign}</span>
                    <span className="text-[12px] text-muted">{u.name}</span>
                    <span
                      className="ml-auto text-[11px] font-bold"
                      style={{ color: RESOURCE_STATE_COLOUR[u.state] }}
                    >
                      {u.state.toUpperCase()}
                    </span>
                    {writable && !closed && (
                      <button
                        type="button"
                        onClick={() => void dispatch(u.id, 'Available', null)}
                        className="text-[11px] font-bold text-muted underline"
                      >
                        stand down
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Incident Details">
            <FieldLabel htmlFor="d-zone">ZONE</FieldLabel>
            {zones.length > 0 ? (
              <select
                id="d-zone"
                disabled={!writable || closed}
                value={draft.location}
                onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                className="mb-3"
              >
                {!zones.includes(draft.location) && (
                  <option value={draft.location}>{draft.location}</option>
                )}
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="d-zone"
                disabled={!writable || closed}
                value={draft.location}
                onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                className="mb-3"
              />
            )}

            <FieldLabel htmlFor="d-category">CATEGORY</FieldLabel>
            <select
              id="d-category"
              disabled={!writable || closed}
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value as Category })}
              className="mb-3"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <FieldLabel htmlFor="d-severity">SEVERITY</FieldLabel>
            <select
              id="d-severity"
              disabled={!writable || closed}
              value={draft.severity}
              onChange={(e) => setDraft({ ...draft, severity: e.target.value as Severity })}
              className="mb-3"
              style={{ color: SEVERITY_COLOUR[draft.severity], fontWeight: 700 }}
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s} style={{ color: '#333333', fontWeight: 400 }}>
                  {s}
                </option>
              ))}
            </select>

            <FieldLabel htmlFor="d-status">STATUS</FieldLabel>
            <select
              id="d-status"
              disabled={!writable || closed}
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value as Status })}
              className="mb-3"
            >
              {STATUSES.filter((s) => s !== 'Resolved' || draft.status === 'Resolved').map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {!closed && (
              <p className="mb-3 -mt-1.5 text-[10px] text-faint">
                Resolving requires a signed-off outcome, below.
              </p>
            )}

            <FieldLabel htmlFor="d-command">COMMAND LEVEL</FieldLabel>
            <select
              id="d-command"
              disabled={!writable || closed || profile?.role !== 'Incident Commander'}
              value={draft.command_level}
              onChange={(e) =>
                setDraft({ ...draft, command_level: e.target.value as CommandLevel })
              }
              className="mb-3"
            >
              {COMMAND_LEVELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <FieldLabel htmlFor="d-resources">RESOURCES DEPLOYED</FieldLabel>
            <textarea
              id="d-resources"
              rows={2}
              disabled={!writable || closed}
              value={draft.resources_deployed}
              onChange={(e) => setDraft({ ...draft, resources_deployed: e.target.value })}
              placeholder="Medical Team 2, Buggy Unit 1, Steward escort ×2"
              className="mb-3"
            />

            <label className="mb-3 flex items-center gap-2 text-[12px] text-ink">
              <input
                type="checkbox"
                disabled={!writable || closed}
                checked={draft.follow_up_required}
                onChange={(e) => setDraft({ ...draft, follow_up_required: e.target.checked })}
                className="!h-4 !w-4 !p-0"
              />
              Requires post-event follow-up
            </label>

            <div className="mb-3 border-t border-line-soft pt-3">
              <p className="text-[11px] tracking-[0.5px] text-faint">REPORTED BY</p>
              <p className="text-[13px] text-ink">
                {incident.reported_by ?? '🔒 Restricted'}
              </p>
              <p className="mt-2 text-[11px] tracking-[0.5px] text-faint">LOGGED BY</p>
              <p className="text-[13px] text-ink">
                {incident.created_by_name ?? '—'}
                {incident.created_by_role ? ` · ${incident.created_by_role}` : ''}
              </p>
            </div>

            {writable && !closed && (
              <Button variant="dark" block disabled={!dirty || busy} onClick={() => void saveDetails()}>
                {dirty ? 'Save Changes' : 'No Changes'}
              </Button>
            )}
          </Card>

          {writable && !closed && canSignOff(profile?.role) && (
            <div className="rounded-[3px] border border-line bg-wash px-4 py-4">
              <h2 className="mb-2.5 text-[13px] font-bold text-ink">Closure &amp; Sign-off</h2>
              <FieldLabel htmlFor="outcome">OUTCOME SUMMARY</FieldLabel>
              <textarea
                id="outcome"
                rows={3}
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                placeholder="Final outcome, casualty status, follow-up actions…"
                className="mb-3 !text-[12px]"
              />
              <p className="mb-3 text-[11px] leading-[1.5] text-faint">
                Signing off as{' '}
                <b className="text-ink">
                  {profile?.full_name}, {profile?.role}
                </b>{' '}
                — this action is timestamped and locked into the audit record.
              </p>
              <Button block disabled={busy} onClick={() => void signOff()}>
                CLOSE &amp; SIGN OFF INCIDENT
              </Button>
            </div>
          )}

          {writable && !closed && !canSignOff(profile?.role) && (
            <Banner tone="info">
              Closure and sign-off is carried out by the Incident Commander or Medical Lead.
            </Banner>
          )}
        </div>
      </div>
    </div>
  )
}
