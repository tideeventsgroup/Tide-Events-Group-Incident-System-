import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLive } from '../context/LiveContext'
import { supabase } from '../lib/supabase'
import { enqueue } from '../lib/offlineQueue'
import { Banner, Button, ChipGroup, FieldLabel } from '../components/ui'
import { DetailFields, cleanDetails, type Details } from '../components/DetailFields'
import { fieldsFor } from '../lib/incidentFields'
import { clockSeconds } from '../lib/format'
import { SEVERITY_COLOUR } from '../lib/style'
import {
  CATEGORIES,
  COMMAND_LEVELS,
  SEVERITIES,
  canSeeMedical,
  canWrite,
  type Category,
  type CommandLevel,
  type Severity,
} from '../lib/types'

export default function NewIncident() {
  const navigate = useNavigate()
  const { profile, session } = useAuth()
  const { activeEvent, refresh, syncNow, refreshPending } = useLive()

  const [category, setCategory] = useState<Category | null>(null)
  const [severity, setSeverity] = useState<Severity | null>(null)
  const [location, setLocation] = useState('')
  const [reportedBy, setReportedBy] = useState(
    profile ? `${profile.full_name}${profile.callsign ? ` — ${profile.callsign}` : ''}` : '',
  )
  const [description, setDescription] = useState('')
  const [commandLevel, setCommandLevel] = useState<CommandLevel>('Ground Team (L1)')
  const [resources, setResources] = useState('')
  const [followUp, setFollowUp] = useState(false)
  const [details, setDetails] = useState<Details>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const nextRef = useMemo(
    () => `INC-${String((activeEvent?.incident_seq ?? 0) + 1).padStart(4, '0')}`,
    [activeEvent],
  )

  // Escalation beyond Event Control is an Incident Commander decision.
  const restrictedCommand = useMemo<CommandLevel[]>(
    () =>
      profile?.role === 'Incident Commander'
        ? []
        : ['FMIC (L3)', 'Police Scotland (L4)'],
    [profile?.role],
  )

  if (!canWrite(profile?.role)) {
    return (
      <div className="mx-auto max-w-[980px] px-4 py-7 sm:px-7">
        <Banner tone="info">
          Your role has read and export access. Incident logging is carried out by the Incident
          Commander, Security Supervisor and Medical Lead.
        </Banner>
      </div>
    )
  }

  if (!activeEvent) {
    return (
      <div className="mx-auto max-w-[980px] px-4 py-7 sm:px-7">
        <Banner tone="info">No event selected. Choose or create one under Event Settings.</Banner>
      </div>
    )
  }

  if (activeEvent.locked) {
    return (
      <div className="mx-auto max-w-[980px] px-4 py-7 sm:px-7">
        <Banner tone="error">
          {activeEvent.name} has been ended and its records are locked. No further incidents can
          be logged against it.
        </Banner>
      </div>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!category) return setError('Select a category.')
    if (!severity) return setError('Select a severity.')
    if (!location.trim()) return setError('Select or enter a location.')
    if (!description.trim()) return setError('A description is required.')

    setBusy(true)

    const payload = {
      id: crypto.randomUUID(),
      event_id: activeEvent!.id,
      created_by: session!.user.id,
      created_at: new Date().toISOString(),
      category,
      severity,
      location: location.trim(),
      reported_by: reportedBy.trim() || profile!.full_name,
      description: description.trim(),
      command_level: commandLevel,
      resources_deployed: resources.trim() || null,
      follow_up_required: followUp,
      details: cleanDetails(details),
    }

    // No connection: hold it in the durable queue and get the operator back to
    // the radio. It syncs itself the moment the signal returns.
    if (!navigator.onLine) {
      await enqueue(payload)
      await refreshPending()
      setBusy(false)
      navigate('/control', { state: { queued: true } })
      return
    }

    // The opening timeline entry is written by a database trigger, so a single
    // insert is all the client needs. Asking for the row back is another
    // matter: INSERT … RETURNING is checked against the SELECT policy, so
    // requesting it while logging a medical incident you are not cleared to
    // read would fail the whole insert. Skip the read-back in that case.
    const readBack = !(category === 'Medical' && !canSeeMedical(profile?.role))

    const { data, error: insertError } = readBack
      ? await supabase.from('incidents').insert(payload).select('id').maybeSingle()
      : await supabase.from('incidents').insert(payload)

    if (insertError) {
      // The connection dropped between the check above and the request. Queue
      // it rather than losing what the operator typed.
      if (!navigator.onLine || insertError.message.toLowerCase().includes('fetch')) {
        await enqueue(payload)
        await refreshPending()
        setBusy(false)
        navigate('/control', { state: { queued: true } })
        return
      }
      setBusy(false)
      setError(insertError.message)
      return
    }

    await Promise.all([refresh(), syncNow()])

    // A non-medical role logging a medical incident cannot open its detail
    // view, by design — send them back to the board instead.
    const created = data as { id?: string } | null
    if (created?.id) {
      navigate(`/control/incident/${created.id}`)
    } else {
      navigate('/control')
    }
  }

  const medicalWarning = category === 'Medical' && !canSeeMedical(profile?.role)

  return (
    <div className="mx-auto max-w-[980px] px-4 pt-6 pb-16 sm:px-7">
      <div className="mb-4.5 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-[24px] font-bold text-ink">Log New Incident</h1>
          <p className="mt-0.5 text-[12px] text-muted">
            Auto-timestamped on submission — next ID:{' '}
            <b className="text-ink">{nextRef}</b>
          </p>
        </div>
        <p className="text-[11px] text-faint">
          Reporting at <b className="text-ink">{clockSeconds(new Date())}</b>
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="rounded-[3px] border border-line bg-white px-5 py-6 sm:px-7"
      >
        <p className="mb-2.5 text-[11px] font-bold tracking-[0.5px] text-ink">CATEGORY</p>
        <div className="mb-6">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {CATEGORIES.map((c) => {
              const selected = category === c
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setCategory(c)}
                  className="rounded-[3px] text-center text-[12px] font-bold"
                  style={
                    selected
                      ? {
                          border: '2px solid #25BEC8',
                          backgroundColor: '#FFF5F1',
                          color: '#25BEC8',
                          padding: '13px 8px',
                        }
                      : {
                          border: '1px solid #E0DAD5',
                          color: '#333333',
                          padding: '14px 8px',
                        }
                  }
                >
                  {c}
                </button>
              )
            })}
          </div>
        </div>

        {medicalWarning && (
          <div className="mb-6">
            <Banner tone="info">
              🔒 Medical detail is restricted. You may log this incident, but its description and
              timeline will only be readable by roles cleared for medical detail — which, after
              submission, will not include you.
            </Banner>
          </div>
        )}

        <p className="mb-2.5 text-[11px] font-bold tracking-[0.5px] text-ink">SEVERITY</p>
        <div className="mb-6">
          <ChipGroup
            ariaLabel="Severity"
            options={SEVERITIES}
            value={severity}
            onChange={setSeverity}
            gridClassName="grid-cols-2 sm:grid-cols-4"
            colourFor={(s) => SEVERITY_COLOUR[s]}
          />
        </div>

        <div className="mb-5 grid gap-5 md:grid-cols-2">
          <div>
            <FieldLabel htmlFor="location">LOCATION / ZONE</FieldLabel>
            {activeEvent.zones.length > 0 ? (
              <select
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              >
                <option value="">Select a zone…</option>
                {activeEvent.zones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Zone or area on site"
              />
            )}
          </div>
          <div>
            <FieldLabel htmlFor="reportedBy">REPORTED BY (NAME, ROLE, CALLSIGN)</FieldLabel>
            <input
              id="reportedBy"
              type="text"
              value={reportedBy}
              onChange={(e) => setReportedBy(e.target.value)}
              placeholder="J. Kerr — Zone Steward, Sierra 4"
            />
          </div>
        </div>

        <FieldLabel htmlFor="description">DESCRIPTION</FieldLabel>
        <textarea
          id="description"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What happened, who is involved, current situation…"
          className="mb-5"
        />

        {/* The fields the type actually needs. Blank ones are dropped, so
            nothing forces an operator to fill a form to get back to the radio. */}
        {category && fieldsFor(category).length > 0 && (
          <div className="mb-5 rounded-[3px] border border-line bg-wash px-4 py-4">
            <p className="mb-3 text-[11px] font-bold tracking-[0.5px] text-ink">
              {category.toUpperCase()} DETAIL — RECORD WHAT YOU HAVE
            </p>
            <DetailFields category={category} details={details} onChange={setDetails} />
          </div>
        )}

        <FieldLabel htmlFor="resources">DEPLOYMENT NOTE (OPTIONAL)</FieldLabel>
        <input
          id="resources"
          type="text"
          value={resources}
          onChange={(e) => setResources(e.target.value)}
          placeholder="Kit, external services, mutual aid — units are dispatched from the board"
          className="mb-5"
        />

        <p className="mb-2.5 text-[11px] font-bold tracking-[0.5px] text-ink">
          COMMAND LEVEL ENGAGED
        </p>
        <div className="mb-2">
          <ChipGroup
            ariaLabel="Command level"
            options={COMMAND_LEVELS}
            value={commandLevel}
            onChange={setCommandLevel}
            gridClassName="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
            colourFor={() => '#333333'}
            disabledOptions={restrictedCommand}
          />
        </div>
        <p className="mb-6 text-[11px] leading-[1.5] text-faint">
          Level 3 (FMIC) is declared by Tide; Level 4 hands scene command to Police Scotland.
          Escalation beyond Event Control requires the Incident Commander.
        </p>

        <label className="mb-6 flex items-center gap-2.5 text-[13px] text-ink">
          <input
            type="checkbox"
            checked={followUp}
            onChange={(e) => setFollowUp(e.target.checked)}
            className="!h-4 !w-4 !p-0"
          />
          Flag for post-event follow-up / debrief
        </label>

        {error && (
          <div className="mb-4">
            <Banner tone="error">{error}</Banner>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-3 border-t border-line-soft pt-5">
          <Button type="button" variant="ghost" onClick={() => navigate('/control')}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy} className="!text-[15px] tracking-[0.5px]">
            {busy ? 'LOGGING…' : 'LOG INCIDENT'}
          </Button>
        </div>
      </form>
    </div>
  )
}
