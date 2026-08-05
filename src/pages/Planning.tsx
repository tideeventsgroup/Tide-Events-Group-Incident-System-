import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLive } from '../context/LiveContext'
import { supabase } from '../lib/supabase'
import { Banner, Button, Card, Empty, FieldLabel, Spinner } from '../components/ui'
import { stamp } from '../lib/format'
import { SEVERITY_COLOUR } from '../lib/style'
import {
  CATEGORIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  canWrite,
  riskBand,
  riskScore,
  type Category,
  type RiskRecord,
  type TaskPriority,
  type TaskRecord,
  type TaskStatus,
} from '../lib/types'

/**
 * Actions and risks.
 *
 * WeTrack and 24/7 Software both keep follow-up actions separate from
 * incidents, and for the same reason the event log is separate: "raise a
 * barrier inspection for tomorrow" is not an incident, and forcing it to
 * become one corrupts the statistics a debrief depends on. Here it used to be
 * a single follow-up boolean.
 *
 * The risk register is WeTrack's original product. It earns its place because
 * a realised risk is the point of keeping one — an incident can point back at
 * the risk it came from, which is the question a SAG asks after the event.
 */

const BAND_COLOUR: Record<string, string> = {
  Low: '#3D8361',
  Medium: '#8C5A66',
  High: '#A31B32',
  Extreme: '#C41E3A',
}

const TASK_PRIORITY_COLOUR: Record<TaskPriority, string> = {
  Low: '#8a8a8a',
  Normal: '#4A7C8C',
  High: '#A31B32',
  Urgent: '#C41E3A',
}

function Tasks({ writable }: { writable: boolean }) {
  const { profile, session } = useAuth()
  const { activeEvent, incidents, lastSync } = useLive()
  const [rows, setRows] = useState<TaskRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showDone, setShowDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('Normal')
  const [owner, setOwner] = useState('')
  const [due, setDue] = useState('')
  const [incidentId, setIncidentId] = useState('')

  const load = useCallback(async () => {
    if (!activeEvent) return
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('event_id', activeEvent.id)
      .order('created_at', { ascending: false })
    setRows((data as TaskRecord[]) ?? [])
    setLoading(false)
  }, [activeEvent])

  useEffect(() => {
    void load()
  }, [load, lastSync])

  const shown = useMemo(
    () => rows.filter((t) => showDone || t.status !== 'Done'),
    [rows, showDone],
  )

  const overdue = rows.filter(
    (t) => t.status !== 'Done' && t.due_at && new Date(t.due_at).getTime() < Date.now(),
  ).length

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setError(null)
    const { error: err } = await supabase.from('tasks').insert({
      event_id: activeEvent!.id,
      incident_id: incidentId || null,
      title: title.trim(),
      priority,
      owner_label: owner.trim() || null,
      due_at: due ? new Date(due).toISOString() : null,
      created_by: session!.user.id,
      created_by_name: profile!.full_name,
    })
    if (err) {
      setError(err.message)
      return
    }
    setTitle('')
    setOwner('')
    setDue('')
    setIncidentId('')
    await load()
  }

  async function setStatus(task: TaskRecord, status: TaskStatus) {
    const { error: err } = await supabase.from('tasks').update({ status }).eq('id', task.id)
    if (err) setError(err.message)
    await load()
  }

  const refFor = new Map(incidents.map((i) => [i.id, i.ref]))

  return (
    <>
      {writable && (
        <Card className="mb-4" title="Raise an action">
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="t-title">ACTION</FieldLabel>
              <input
                id="t-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Re-inspect Zone C barrier line before doors"
              />
            </div>
            <div>
              <FieldLabel htmlFor="t-owner">OWNER</FieldLabel>
              <input
                id="t-owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="Sierra 1"
              />
            </div>
            <div>
              <FieldLabel htmlFor="t-due">DUE</FieldLabel>
              <input
                id="t-due"
                type="datetime-local"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="t-pri">PRIORITY</FieldLabel>
              <select
                id="t-pri"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-4">
              <FieldLabel htmlFor="t-inc">LINKED INCIDENT (OPTIONAL)</FieldLabel>
              <select
                id="t-inc"
                value={incidentId}
                onChange={(e) => setIncidentId(e.target.value)}
              >
                <option value="">Not linked</option>
                {incidents.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.ref} · {i.category} · {i.location}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end sm:col-span-1">
              <Button type="submit" block disabled={!title.trim()}>
                Raise
              </Button>
            </div>
          </form>
          {error && <p className="mt-2 text-[11px] font-bold text-alert">{error}</p>}
        </Card>
      )}

      {overdue > 0 && (
        <div className="mb-4">
          <Banner tone="error">
            {overdue} action{overdue === 1 ? ' is' : 's are'} past their due time.
          </Banner>
        </div>
      )}

      <Card
        title={`Actions (${shown.length})`}
        padded={false}
        action={
          <label className="flex items-center gap-1.5 text-[11px] text-muted">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
              className="!w-auto"
            />
            Show completed
          </label>
        }
      >
        {loading ? (
          <Spinner label="Loading actions" />
        ) : shown.length === 0 ? (
          <Empty>Nothing outstanding.</Empty>
        ) : (
          shown.map((t) => {
            const late =
              t.status !== 'Done' && t.due_at && new Date(t.due_at).getTime() < Date.now()
            return (
              <div
                key={t.id}
                className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-3 last:border-b-0"
              >
                <span
                  className="rounded-[2px] px-1.5 py-[3px] text-[9px] font-bold tracking-[0.5px] text-white"
                  style={{ background: TASK_PRIORITY_COLOUR[t.priority] }}
                >
                  {t.priority.toUpperCase()}
                </span>
                <span
                  className={`text-[13px] ${t.status === 'Done' ? 'text-muted line-through' : 'text-ink'}`}
                >
                  {t.title}
                </span>
                {t.incident_id && refFor.has(t.incident_id) && (
                  <Link
                    to={`/control/incident/${t.incident_id}`}
                    className="text-[11px] font-bold text-teal"
                  >
                    {refFor.get(t.incident_id)}
                  </Link>
                )}
                {t.owner_label && <span className="text-[11px] text-faint">{t.owner_label}</span>}
                {t.due_at && (
                  <span className={`text-[11px] ${late ? 'font-bold text-alert' : 'text-faint'}`}>
                    due {stamp(t.due_at)}
                  </span>
                )}
                {writable ? (
                  <select
                    aria-label={`Status of ${t.title}`}
                    value={t.status}
                    onChange={(e) => void setStatus(t, e.target.value as TaskStatus)}
                    className="!ml-auto !w-auto !py-1.5 !text-[11px]"
                  >
                    {TASK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="ml-auto text-[11px] font-bold text-muted">{t.status}</span>
                )}
              </div>
            )
          })
        )}
      </Card>
    </>
  )
}

function Risks({ writable }: { writable: boolean }) {
  const { profile, session } = useAuth()
  const { activeEvent, incidents, lastSync } = useLive()
  const [rows, setRows] = useState<RiskRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<Category>('Crowd')
  const [likelihood, setLikelihood] = useState(3)
  const [impact, setImpact] = useState(3)
  const [mitigation, setMitigation] = useState('')

  const load = useCallback(async () => {
    if (!activeEvent) return
    const { data } = await supabase.from('risks').select('*').eq('event_id', activeEvent.id)
    setRows((data as RiskRecord[]) ?? [])
    setLoading(false)
  }, [activeEvent])

  useEffect(() => {
    void load()
  }, [load, lastSync])

  const sorted = useMemo(
    () => [...rows].sort((a, b) => riskScore(b) - riskScore(a)),
    [rows],
  )

  const realised = useMemo(() => {
    const map = new Map<string, number>()
    for (const i of incidents) {
      if (i.risk_id) map.set(i.risk_id, (map.get(i.risk_id) ?? 0) + 1)
    }
    return map
  }, [incidents])

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setError(null)
    const { error: err } = await supabase.from('risks').insert({
      event_id: activeEvent!.id,
      title: title.trim(),
      category,
      likelihood,
      impact,
      mitigation: mitigation.trim() || null,
      created_by: session!.user.id,
      created_by_name: profile!.full_name,
    })
    if (err) {
      setError(err.message)
      return
    }
    setTitle('')
    setMitigation('')
    await load()
  }

  return (
    <>
      {writable && (
        <Card className="mb-4" title="Add a risk">
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-[2fr_1fr_90px_90px_auto]">
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="r-title">RISK</FieldLabel>
              <input
                id="r-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Crowd build-up at Zone A entrance during headline act"
              />
            </div>
            <div>
              <FieldLabel htmlFor="r-cat">CATEGORY</FieldLabel>
              <select
                id="r-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="r-l">LIKELY</FieldLabel>
              <select
                id="r-l"
                value={likelihood}
                onChange={(e) => setLikelihood(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="r-i">IMPACT</FieldLabel>
              <select id="r-i" value={impact} onChange={(e) => setImpact(Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-4">
              <FieldLabel htmlFor="r-m">MITIGATION</FieldLabel>
              <textarea
                id="r-m"
                rows={2}
                value={mitigation}
                onChange={(e) => setMitigation(e.target.value)}
                placeholder="What is in place, and who owns it"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" block disabled={!title.trim()}>
                Add
              </Button>
            </div>
          </form>
          {error && <p className="mt-2 text-[11px] font-bold text-alert">{error}</p>}
        </Card>
      )}

      <Card title={`Risk register (${sorted.length})`} padded={false}>
        {loading ? (
          <Spinner label="Loading risks" />
        ) : sorted.length === 0 ? (
          <Empty>
            No risks recorded. The register is what an incident points back at when it happens.
          </Empty>
        ) : (
          sorted.map((r) => {
            const score = riskScore(r)
            const band = riskBand(score)
            const hits = realised.get(r.id) ?? 0
            return (
              <div key={r.id} className="border-b border-line-soft px-4 py-3 last:border-b-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-[2px] px-2 py-1 text-[10px] font-bold tracking-[0.5px] text-white"
                    style={{ background: BAND_COLOUR[band] }}
                  >
                    {band.toUpperCase()} {score}
                  </span>
                  <span className="text-[13px] font-bold text-ink">{r.title}</span>
                  <span
                    className="text-[11px] font-bold"
                    style={{ color: SEVERITY_COLOUR.Minor }}
                  >
                    {r.category}
                  </span>
                  {hits > 0 && (
                    <span className="rounded-[2px] border border-alert px-1.5 py-[3px] text-[9px] font-bold text-alert">
                      REALISED ×{hits}
                    </span>
                  )}
                  <span className="ml-auto text-[11px] text-faint">
                    L{r.likelihood} × I{r.impact}
                  </span>
                </div>
                {r.mitigation && (
                  <p className="mt-1 text-[12px] leading-[1.5] text-muted">{r.mitigation}</p>
                )}
              </div>
            )
          })
        )}
        <p className="border-t border-line-soft px-4 py-3 text-[11px] leading-[1.5] text-faint">
          Score is likelihood × impact, 1–25. An incident can be linked to the risk it came from
          on its record, which is the question a Safety Advisory Group asks afterwards.
        </p>
      </Card>
    </>
  )
}

export default function Planning() {
  const { profile } = useAuth()
  const { activeEvent } = useLive()
  const [tab, setTab] = useState<'actions' | 'risks'>('actions')

  const writable = canWrite(profile?.role) && !activeEvent?.locked

  if (!activeEvent) {
    return (
      <div className="mx-auto max-w-[980px] px-4 py-8 sm:px-7">
        <Empty>No event selected.</Empty>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[980px] px-4 pt-5 pb-10 sm:px-7">
      <div className="mb-4">
        <h1 className="text-[22px] font-bold text-ink sm:text-[24px]">Actions &amp; Risks</h1>
        <p className="mt-1 text-[12px] leading-[1.5] text-muted">
          Follow-up actions kept separate from incidents, so a barrier inspection booked for
          tomorrow does not become an incident statistic — and the risk register the incidents
          point back at.
        </p>
      </div>

      <div className="mb-4 flex gap-2">
        {(['actions', 'risks'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-[3px] border px-3.5 py-2 text-[12px] font-bold ${
              tab === t ? 'border-ink bg-ink text-white' : 'border-line text-muted'
            }`}
          >
            {t === 'actions' ? 'ACTIONS' : 'RISK REGISTER'}
          </button>
        ))}
      </div>

      {tab === 'actions' ? <Tasks writable={writable} /> : <Risks writable={writable} />}
    </div>
  )
}
