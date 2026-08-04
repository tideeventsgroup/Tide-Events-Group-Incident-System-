import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLive } from '../context/LiveContext'
import { supabase } from '../lib/supabase'
import { Banner, Button, Card, Empty, Spinner } from '../components/ui'
import { clockTime, dateShort } from '../lib/format'
import { canWrite, LOG_ENTRY_TYPES, type EventLogEntry, type LogEntryType } from '../lib/types'

/**
 * The radio loggist's running log.
 *
 * Most control room traffic is not an incident — a gate opening, a shift
 * handover, a wind reading, a contractor signing in. Forcing it through the
 * incident form would both slow the operator down and pollute the incident
 * statistics that a debrief depends on. This is the other half of the record.
 */

const TYPE_LABEL: Record<LogEntryType, string> = {
  radio: 'Radio',
  note: 'Note',
  handover: 'Handover',
  staffing: 'Staffing',
  weather: 'Weather',
  check: 'Check',
  visitor: 'Visitor',
}

const TYPE_COLOUR: Record<LogEntryType, string> = {
  radio: '#4A7C8C',
  note: '#6B7280',
  handover: '#333333',
  staffing: '#6B7280',
  weather: '#4A7C8C',
  check: '#3D8361',
  visitor: '#6B7280',
}

export default function EventLog() {
  const { profile, session } = useAuth()
  const { activeEvent, incidents, lastSync } = useLive()

  const [entries, setEntries] = useState<EventLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<LogEntryType | 'all'>('all')

  const [type, setType] = useState<LogEntryType>('radio')
  const [body, setBody] = useState('')
  const [incidentId, setIncidentId] = useState('')

  const writable = canWrite(profile?.role) && !activeEvent?.locked

  const load = useCallback(async () => {
    if (!activeEvent) return
    const { data } = await supabase
      .from('event_log')
      .select('*')
      .eq('event_id', activeEvent.id)
      .order('at', { ascending: false })
      .limit(500)
    setEntries((data as EventLogEntry[]) ?? [])
    setLoading(false)
  }, [activeEvent])

  useEffect(() => {
    void load()
  }, [load, lastSync])

  const shown = useMemo(
    () => (filter === 'all' ? entries : entries.filter((e) => e.entry_type === filter)),
    [entries, filter],
  )

  // Group by day, so a multi-day event reads as a diary.
  const grouped = useMemo(() => {
    const out = new Map<string, EventLogEntry[]>()
    for (const e of shown) {
      const key = dateShort(e.at)
      const list = out.get(key) ?? []
      list.push(e)
      out.set(key, list)
    }
    return [...out.entries()]
  }, [shown])

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setError(null)
    setBusy(true)

    const { error: err } = await supabase.from('event_log').insert({
      event_id: activeEvent!.id,
      incident_id: incidentId || null,
      author_id: session!.user.id,
      author_name: profile!.full_name,
      author_role: profile!.role,
      entry_type: type,
      body: body.trim(),
    })
    setBusy(false)

    if (err) {
      setError(err.message)
      return
    }
    setBody('')
    setIncidentId('')
    await load()
  }

  if (!activeEvent) {
    return (
      <div className="mx-auto max-w-[900px] px-4 py-8 sm:px-7">
        <Empty>No event selected.</Empty>
      </div>
    )
  }

  const openIncidents = incidents.filter((i) => i.status !== 'Resolved')

  return (
    <div className="mx-auto max-w-[900px] px-4 pt-5 pb-10 sm:px-7">
      <div className="mb-4">
        <h1 className="text-[22px] font-bold text-ink sm:text-[24px]">Event Log</h1>
        <p className="mt-1 text-[12px] leading-[1.5] text-muted">
          The running control room log. Radio traffic, handovers, checks and observations that are
          not incidents — kept separate so incident statistics stay meaningful at debrief.
          Append-only, like everything else in the record.
        </p>
      </div>

      {writable && (
        <Card className="mb-4">
          <form onSubmit={add}>
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {LOG_ENTRY_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className="rounded-[3px] px-2.5 py-1.5 text-[11px] font-bold"
                  style={
                    type === t
                      ? { background: TYPE_COLOUR[t], color: '#fff' }
                      : { border: '1px solid #E0DAD5', color: '#6b6b6b' }
                  }
                >
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>

            <textarea
              rows={2}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Sierra 1 reports Zone A gates open, flow steady…"
              aria-label="Log entry"
              className="mb-2.5"
            />

            <div className="flex flex-wrap items-center justify-between gap-2.5">
              {openIncidents.length > 0 ? (
                <select
                  value={incidentId}
                  onChange={(e) => setIncidentId(e.target.value)}
                  aria-label="Link to incident"
                  className="!w-auto max-w-full !text-[12px]"
                >
                  <option value="">Not linked to an incident</option>
                  {openIncidents.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.ref} · {i.category}
                    </option>
                  ))}
                </select>
              ) : (
                <span />
              )}
              <Button type="submit" disabled={busy || !body.trim()}>
                {busy ? 'Logging…' : 'Add to log'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {error && (
        <div className="mb-4">
          <Banner tone="error">{error}</Banner>
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`rounded-[3px] border px-2.5 py-1.5 text-[11px] font-bold ${
            filter === 'all' ? 'border-ink bg-ink text-white' : 'border-line text-muted'
          }`}
        >
          All ({entries.length})
        </button>
        {LOG_ENTRY_TYPES.map((t) => {
          const n = entries.filter((e) => e.entry_type === t).length
          if (n === 0) return null
          return (
            <button
              key={t}
              type="button"
              onClick={() => setFilter(t)}
              className={`rounded-[3px] border px-2.5 py-1.5 text-[11px] font-bold ${
                filter === t ? 'border-ink bg-ink text-white' : 'border-line text-muted'
              }`}
            >
              {TYPE_LABEL[t]} ({n})
            </button>
          )
        })}
      </div>

      {loading ? (
        <Spinner label="Loading log" />
      ) : shown.length === 0 ? (
        <Card>
          <Empty>Nothing logged yet.</Empty>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map(([day, list]) => (
            <div key={day}>
              <p className="mb-1.5 text-[11px] font-bold tracking-[0.5px] text-faint">{day}</p>
              <Card padded={false}>
                {list.map((e) => (
                  <div
                    key={e.id}
                    className="flex gap-3 border-b border-line-soft px-4 py-3 last:border-b-0"
                  >
                    <span className="w-[42px] shrink-0 text-[13px] font-bold text-ink">
                      {clockTime(e.at)}
                    </span>
                    <span
                      className="mt-0.5 h-[7px] w-[7px] shrink-0 rounded-full"
                      style={{ background: TYPE_COLOUR[e.entry_type] }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-[1.5] whitespace-pre-wrap text-ink">
                        {e.body}
                      </p>
                      <p className="mt-0.5 text-[11px] text-faint">
                        {TYPE_LABEL[e.entry_type]} · {e.author_name}
                        {e.author_role ? ` (${e.author_role})` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
