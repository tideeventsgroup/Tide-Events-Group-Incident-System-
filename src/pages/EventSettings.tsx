import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLive } from '../context/LiveContext'
import { supabase } from '../lib/supabase'
import { Banner, Button, Card, ChipGroup, FieldLabel } from '../components/ui'
import { addDays, dayLabel, daysBetween, retentionUntil, stamp } from '../lib/format'
import { RESOURCE_STATE_COLOUR } from '../lib/style'
import {
  EVENT_STATUSES,
  RESOURCE_KINDS,
  canManageEvent,
  canWrite,
  isCommitted,
  type AuditEntry,
  type EventStatus,
  type EventRecord,
  type Profile,
  type ResourceKind,
} from '../lib/types'

const RETENTION_OPTIONS = [
  { months: 12, label: '1 year' },
  { months: 36, label: '3 years (ESMP minimum)' },
  { months: 72, label: '6 years' },
  { months: 84, label: '7 years' },
]

function NewEventForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [client, setClient] = useState('')
  const [venue, setVenue] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function create() {
    if (!name.trim() || !client.trim() || !startDate) {
      setError('Event name, client and start date are required.')
      return
    }
    setBusy(true)
    const { error: err } = await supabase.from('events').insert({
      name: name.trim(),
      client: client.trim(),
      venue: venue.trim() || null,
      start_date: startDate,
      end_date: endDate || startDate,
      status: 'Standby',
      zones: ['Whole Site'],
    })
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    onDone()
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <FieldLabel htmlFor="ne-name">EVENT NAME</FieldLabel>
        <input id="ne-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <FieldLabel htmlFor="ne-client">CLIENT</FieldLabel>
        <input id="ne-client" value={client} onChange={(e) => setClient(e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <FieldLabel htmlFor="ne-venue">VENUE</FieldLabel>
        <input id="ne-venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
      </div>
      <div>
        <FieldLabel htmlFor="ne-start">START DATE</FieldLabel>
        <input
          id="ne-start"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </div>
      <div>
        <FieldLabel htmlFor="ne-end">END DATE</FieldLabel>
        <input
          id="ne-end"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>
      {error && (
        <div className="sm:col-span-2">
          <Banner tone="error">{error}</Banner>
        </div>
      )}
      <div className="sm:col-span-2">
        <Button disabled={busy} onClick={() => void create()}>
          Create Event
        </Button>
      </div>
    </div>
  )
}

/**
 * The unit roster — the teams, vehicles and contractors event control can send.
 *
 * Signing a unit on and off is a dispatcher's job rather than a configuration
 * change, so any role that can work an incident can do it. Units are never
 * deleted: one that has been committed to an incident is part of that
 * incident's record, so it goes Off duty instead.
 */
function UnitRoster({ writable }: { writable: boolean }) {
  const { activeEvent, units, dispatch, refresh } = useLive()
  const [callsign, setCallsign] = useState('')
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ResourceKind>('Security')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function add() {
    if (!callsign.trim() || !name.trim()) {
      setError('A unit needs a callsign and a name.')
      return
    }
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.from('resources').insert({
      event_id: activeEvent!.id,
      callsign: callsign.trim(),
      name: name.trim(),
      kind,
    })
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    setCallsign('')
    setName('')
    await refresh()
  }

  return (
    <Card title="Deployable Units">
      <div className="hidden grid-cols-[110px_1fr_110px_130px_100px] border-b border-line py-2 text-[10px] font-bold tracking-[0.5px] text-faint sm:grid">
        <div>CALLSIGN</div>
        <div>UNIT</div>
        <div>TYPE</div>
        <div>STATE</div>
        <div />
      </div>

      {units.length === 0 ? (
        <p className="py-4 text-[12px] text-faint">
          No units signed on. Add the teams, vehicles and contractors event control can send —
          they become the dispatch list on the board.
        </p>
      ) : (
        units.map((u) => (
          <div
            key={u.id}
            className="grid gap-1 border-b border-line-soft py-2.5 last:border-b-0 sm:grid-cols-[110px_1fr_110px_130px_100px] sm:items-center sm:gap-0"
          >
            <div className="text-[13px] font-bold text-ink">{u.callsign}</div>
            <div className="text-[13px] text-ink">{u.name}</div>
            <div className="text-[12px] text-muted">{u.kind}</div>
            <div
              className="text-[11px] font-bold"
              style={{ color: u.state === 'Off duty' ? '#8a8a8a' : RESOURCE_STATE_COLOUR[u.state] }}
            >
              {u.state.toUpperCase()}
            </div>
            <div className="sm:text-right">
              {writable && !isCommitted(u.state) && (
                <button
                  type="button"
                  onClick={() =>
                    void dispatch(u.id, u.state === 'Off duty' ? 'Available' : 'Off duty', null)
                  }
                  className="text-[11px] font-bold text-teal underline"
                >
                  {u.state === 'Off duty' ? 'Sign on' : 'Sign off'}
                </button>
              )}
              {isCommitted(u.state) && (
                <span className="text-[11px] text-faint">on a call</span>
              )}
            </div>
          </div>
        ))
      )}

      {writable && (
        <div className="mt-3 grid gap-2 border-t border-line-soft pt-3 sm:grid-cols-[110px_1fr_130px_90px]">
          <input
            value={callsign}
            onChange={(e) => setCallsign(e.target.value)}
            placeholder="Sierra 6"
            aria-label="Callsign"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Zone D Stewards"
            aria-label="Unit name"
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ResourceKind)}
            aria-label="Unit type"
          >
            {RESOURCE_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <Button variant="ghost" disabled={busy} onClick={() => void add()}>
            Add
          </Button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-[11px] font-bold text-alert">{error}</p>
      )}

      <p className="mt-3 border-t border-line-soft pt-3 text-[11px] leading-[1.5] text-faint">
        Signing a unit on or off is a control room action, not a configuration change, so every
        role that can work an incident can do it. Units are never deleted — one that has been
        committed to an incident is part of that incident's record.
      </p>
    </Card>
  )
}

export default function EventSettings() {
  const { profile } = useAuth()
  const { activeEvent, refreshEvents, incidents } = useLive()

  const [draft, setDraft] = useState<EventRecord | null>(null)
  const [zoneInput, setZoneInput] = useState('')
  const [team, setTeam] = useState<Profile[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)

  const manager = canManageEvent(profile?.role)

  useEffect(() => {
    setDraft(activeEvent ? { ...activeEvent } : null)
  }, [activeEvent])

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .order('full_name')
      .then(({ data }) => setTeam((data as Profile[]) ?? []))
  }, [])

  useEffect(() => {
    if (!activeEvent) return
    supabase
      .from('audit_log')
      .select('*')
      .eq('event_id', activeEvent.id)
      .order('at', { ascending: false })
      .limit(15)
      .then(({ data }) => setAudit((data as AuditEntry[]) ?? []))
  }, [activeEvent, message])

  const totalDays = useMemo(() => {
    if (!draft?.end_date) return 1
    return Math.max(1, daysBetween(draft.start_date, draft.end_date) + 1)
  }, [draft])

  const openCount = incidents.filter((i) => i.status !== 'Resolved').length

  async function save(patch: Partial<EventRecord>, note?: string) {
    if (!draft) return
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.from('events').update(patch).eq('id', draft.id)
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    setMessage(note ?? 'Changes saved.')
    await refreshEvents()
    setTimeout(() => setMessage(null), 4000)
  }

  if (!draft) {
    return (
      <div className="mx-auto max-w-[1080px] px-4 py-7 sm:px-7">
        <Card title="Create an event">
          {manager ? (
            <NewEventForm onDone={() => void refreshEvents()} />
          ) : (
            <Banner tone="info">
              No events exist yet. An Incident Commander can create one.
            </Banner>
          )}
        </Card>
      </div>
    )
  }

  const retention = retentionUntil(draft.end_date, draft.retention_months)

  return (
    <div className="mx-auto max-w-[1080px] px-4 pt-5 pb-16 sm:px-7">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold text-ink">Event Settings</h1>
          <p className="mt-0.5 text-[12px] text-muted">
            Configuration for the active event — changes apply immediately across the control
            room.
          </p>
        </div>
        {manager && (
          <Button
            disabled={busy || draft.locked}
            onClick={() =>
              void save({
                name: draft.name,
                client: draft.client,
                venue: draft.venue,
                start_date: draft.start_date,
                end_date: draft.end_date,
                expected_attendance: draft.expected_attendance,
                status: draft.status,
                zones: draft.zones,
                retention_months: draft.retention_months,
                retention_notes: draft.retention_notes,
              })
            }
          >
            SAVE CHANGES
          </Button>
        )}
      </div>

      {!manager && (
        <div className="mb-4">
          <Banner tone="info">
            Your role has read access to event configuration. Changes are made by the Incident
            Commander.
          </Banner>
        </div>
      )}
      {message && (
        <div className="mb-4">
          <Banner tone="success">{message}</Banner>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Banner tone="error">{error}</Banner>
        </div>
      )}
      {draft.locked && (
        <div className="mb-4">
          <Banner tone="error">
            This event has been ended. All incident records are locked against further edits.
          </Banner>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <Card title="Event Details">
            <div className="mb-4 grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="e-name">EVENT NAME</FieldLabel>
                <input
                  id="e-name"
                  disabled={!manager || draft.locked}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div>
                <FieldLabel htmlFor="e-client">CLIENT</FieldLabel>
                <input
                  id="e-client"
                  disabled={!manager || draft.locked}
                  value={draft.client}
                  onChange={(e) => setDraft({ ...draft, client: e.target.value })}
                />
              </div>
            </div>

            <div className="mb-4">
              <FieldLabel htmlFor="e-venue">VENUE</FieldLabel>
              <input
                id="e-venue"
                disabled={!manager || draft.locked}
                value={draft.venue ?? ''}
                onChange={(e) => setDraft({ ...draft, venue: e.target.value })}
              />
            </div>

            <div className="mb-4 grid gap-4 sm:grid-cols-3">
              <div>
                <FieldLabel htmlFor="e-start">START DATE</FieldLabel>
                <input
                  id="e-start"
                  type="date"
                  disabled={!manager || draft.locked}
                  value={draft.start_date}
                  onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
                />
              </div>
              <div>
                <FieldLabel htmlFor="e-end">END DATE</FieldLabel>
                <input
                  id="e-end"
                  type="date"
                  disabled={!manager || draft.locked}
                  value={draft.end_date ?? ''}
                  onChange={(e) => setDraft({ ...draft, end_date: e.target.value })}
                />
              </div>
              <div>
                <FieldLabel htmlFor="e-att">EXPECTED ATTENDANCE</FieldLabel>
                <input
                  id="e-att"
                  disabled={!manager || draft.locked}
                  value={draft.expected_attendance ?? ''}
                  onChange={(e) => setDraft({ ...draft, expected_attendance: e.target.value })}
                />
              </div>
            </div>

            <p className="mb-2 text-[11px] font-bold tracking-[0.5px] text-ink">EVENT STATUS</p>
            <div className="mb-5">
              <ChipGroup
                ariaLabel="Event status"
                options={EVENT_STATUSES}
                value={draft.status}
                onChange={(s: EventStatus) =>
                  manager && !draft.locked && setDraft({ ...draft, status: s })
                }
                gridClassName="grid-cols-3"
                colourFor={(s) => (s === 'Live' ? '#3D8361' : '#333333')}
              />
            </div>

            <p className="mb-2 text-[11px] font-bold tracking-[0.5px] text-ink">EVENT DAY</p>
            <div className="flex flex-wrap items-center gap-3 rounded-[3px] border border-line bg-wash px-3.5 py-3">
              <div className="flex flex-1 flex-wrap gap-1.5">
                {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => {
                  const active = day === draft.active_day
                  return (
                    <div
                      key={day}
                      className="min-w-[92px] flex-1 rounded-[3px] px-2 py-2 text-center text-[12px] font-bold"
                      style={
                        active
                          ? { background: '#25BEC8', color: '#fff' }
                          : { background: '#fff', border: '1px solid #D8CFCA', color: '#333' }
                      }
                    >
                      Day {day}
                      <br />
                      <span className="text-[10px] font-normal">
                        {dayLabel(addDays(draft.start_date, day - 1))}
                        {active ? ' — active' : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
              {manager && !draft.locked && draft.active_day < totalDays && (
                <Button
                  variant="dark"
                  disabled={busy}
                  onClick={() =>
                    void save(
                      { active_day: draft.active_day + 1 },
                      `Advanced to day ${draft.active_day + 1}.`,
                    )
                  }
                >
                  Advance to Day {draft.active_day + 1} →
                </Button>
              )}
            </div>
            <p className="mt-2 text-[11px] leading-[1.5] text-faint">
              Advancing the event day changes the control room header. Incidents are never
              archived or reset — the board keeps showing everything logged against this event,
              and the full record stays in Incident History.
              {openCount > 0 && (
                <>
                  {' '}
                  <b className="text-ink">
                    {openCount} incident{openCount === 1 ? '' : 's'} still open.
                  </b>
                </>
              )}
            </p>
          </Card>

          <Card
            title="Zones &amp; Locations"
            action={
              manager &&
              !draft.locked && (
                <span className="text-[11px] text-faint">
                  Used by the incident form and zone board
                </span>
              )
            }
          >
            <ul className="mb-3">
              {draft.zones.map((zone) => (
                <li
                  key={zone}
                  className="flex items-center justify-between border-b border-line-soft py-2.5 last:border-b-0"
                >
                  <span className="text-[13px] text-ink">{zone}</span>
                  {manager && !draft.locked && (
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({ ...draft, zones: draft.zones.filter((z) => z !== zone) })
                      }
                      className="text-[11px] font-bold text-alert hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
              {draft.zones.length === 0 && (
                <li className="py-3 text-[12px] text-faint">No zones configured.</li>
              )}
            </ul>

            {manager && !draft.locked && (
              <div className="flex gap-2">
                <input
                  value={zoneInput}
                  onChange={(e) => setZoneInput(e.target.value)}
                  placeholder="Zone E — VIP Enclosure"
                  aria-label="New zone name"
                  className="!text-[13px]"
                />
                <Button
                  variant="ghost"
                  onClick={() => {
                    const z = zoneInput.trim()
                    if (!z || draft.zones.includes(z)) return
                    setDraft({ ...draft, zones: [...draft.zones, z] })
                    setZoneInput('')
                  }}
                >
                  Add
                </Button>
              </div>
            )}
            <p className="mt-2 text-[11px] text-faint">
              Zone changes take effect once you press Save Changes. Existing incidents keep the
              zone they were logged against.
            </p>
          </Card>

          <UnitRoster writable={canWrite(profile?.role) && !draft.locked} />

          <Card title="Control Room Team &amp; Roles">
            <div className="hidden grid-cols-[1fr_1.2fr_140px] border-b border-line py-2 text-[10px] font-bold tracking-[0.5px] text-faint sm:grid">
              <div>NAME</div>
              <div>ROLE</div>
              <div>ACCESS</div>
            </div>
            {team.map((member) => (
              <div
                key={member.id}
                className="grid gap-1 border-b border-line-soft py-2.5 last:border-b-0 sm:grid-cols-[1fr_1.2fr_140px] sm:gap-0"
              >
                <div className="text-[13px] text-ink">
                  {member.full_name}
                  {member.callsign && (
                    <span className="text-[11px] text-faint"> · {member.callsign}</span>
                  )}
                </div>
                <div className="text-[12px] text-muted">{member.role}</div>
                <div
                  className="text-[11px] font-bold"
                  style={{ color: member.role === 'Client' ? '#6b6b6b' : '#3D8361' }}
                >
                  {member.role === 'Client' ? 'Read & export' : 'Log & update'}
                  {member.role !== 'Security Supervisor' ? ' · medical' : ''}
                </div>
              </div>
            ))}
            <p className="mt-3 border-t border-line-soft pt-3 text-[11px] leading-[1.5] text-faint">
              Accounts are created in Supabase Auth. Role assignment is enforced in the database,
              not the interface — only an Incident Commander can change one. Clients are linked to
              specific events and cannot see any other client's incidents.
            </p>
          </Card>

          <Card title="Recent Audit Trail">
            {audit.length === 0 ? (
              <p className="text-[12px] text-faint">
                No audit entries visible. This log is readable by the Incident Commander.
              </p>
            ) : (
              <ul className="space-y-2">
                {audit.map((entry) => (
                  <li
                    key={entry.id}
                    className="border-b border-line-soft pb-2 text-[12px] last:border-b-0"
                  >
                    <span className="font-bold text-ink">{stamp(entry.at)}</span>{' '}
                    <span className="text-muted">
                      {entry.actor_name ?? 'system'}
                      {entry.actor_role ? ` (${entry.actor_role})` : ''} — {entry.action}{' '}
                      {entry.entity}
                    </span>
                    {entry.changes && entry.action === 'update' && (
                      <span className="block text-[11px] text-faint">
                        fields: {Object.keys(entry.changes).join(', ')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-3.5">
          <Card title="Retention &amp; Compliance" className="!bg-wash">
            <p className="mb-3 text-[12px] leading-[1.5] text-muted">
              Incident records are retained for licensing and Martyn&rsquo;s Law audit purposes.
              Medical descriptions are personal health data and are role-restricted at the
              database.
            </p>
            <FieldLabel htmlFor="e-retention">RETENTION PERIOD</FieldLabel>
            <select
              id="e-retention"
              disabled={!manager}
              value={draft.retention_months}
              onChange={(e) =>
                setDraft({ ...draft, retention_months: Number(e.target.value) })
              }
              className="mb-3"
            >
              {RETENTION_OPTIONS.map((o) => (
                <option key={o.months} value={o.months}>
                  {o.label}
                </option>
              ))}
            </select>
            {retention && (
              <p className="mb-3 text-[11px] text-faint">
                Records for this event fall due for review on{' '}
                <b className="text-ink">{retention}</b>.
              </p>
            )}
            <FieldLabel htmlFor="e-retnotes">RETENTION NOTES</FieldLabel>
            <textarea
              id="e-retnotes"
              rows={3}
              disabled={!manager}
              value={draft.retention_notes ?? ''}
              onChange={(e) => setDraft({ ...draft, retention_notes: e.target.value })}
              className="!text-[12px]"
            />
          </Card>

          {manager && (
            <Card title="Create Another Event">
              {creating ? (
                <NewEventForm
                  onDone={() => {
                    setCreating(false)
                    void refreshEvents()
                  }}
                />
              ) : (
                <Button variant="ghost" block onClick={() => setCreating(true)}>
                  + New Event
                </Button>
              )}
            </Card>
          )}

          {manager && !draft.locked && (
            <div className="rounded-[3px] bg-ink px-4 py-4">
              <h2 className="mb-2 text-[13px] font-bold text-white">Danger Zone</h2>
              <p className="mb-3 text-[11px] leading-[1.5] text-[#d8d8d8]">
                Ending the event locks all incident logs against further edits. Records stay
                fully readable and exportable. This cannot be undone.
              </p>
              <Button
                variant="danger"
                block
                disabled={busy}
                onClick={() => {
                  const warning =
                    openCount > 0
                      ? `${openCount} incident(s) are still open. `
                      : ''
                  if (
                    window.confirm(
                      `${warning}End "${draft.name}" and lock its records permanently?`,
                    )
                  ) {
                    void save(
                      { locked: true, status: 'Closed' },
                      'Event ended. Records are now locked.',
                    )
                  }
                }}
                className="!text-[12px]"
              >
                End Event &amp; Lock Records
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
