import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLive } from '../context/LiveContext'
import { supabase } from '../lib/supabase'
import { Banner, Button, Card, Empty, FieldLabel, Spinner } from '../components/ui'
import { clockTime, dateShort, stamp } from '../lib/format'
import { canWrite, type MethaneReport, type MethaneReportType } from '../lib/types'

/**
 * M/ETHANE — the JESIP structure for passing major incident information.
 *
 * Reports are append-only snapshots, not one editable record, because a
 * control room is expected to take repeat METHANE updates as the picture
 * changes. The current state is read off the most recent report.
 */

const FIELDS: Array<{
  key: keyof MethaneReport
  letter: string
  label: string
  hint: string
  required?: boolean
  rows?: number
}> = [
  {
    key: 'exact_location',
    letter: 'E',
    label: 'Exact location',
    hint: 'Zone, landmark, grid reference or what3words — precise enough to drive to.',
    required: true,
  },
  {
    key: 'incident_type',
    letter: 'T',
    label: 'Type of incident',
    hint: 'What has happened. Crowd collapse, structural failure, vehicle, weapon, fire.',
    required: true,
  },
  {
    key: 'hazards',
    letter: 'H',
    label: 'Hazards, present and suspected',
    hint: 'Structures, crowd pressure, fuel, weather, secondary device risk.',
    rows: 2,
  },
  {
    key: 'access',
    letter: 'A',
    label: 'Access and egress',
    hint: 'Best route in for emergency vehicles, and the route out. Name the gate.',
    rows: 2,
  },
  {
    key: 'casualties',
    letter: 'N',
    label: 'Number and type of casualties',
    hint: 'Numbers, severity, and whether anyone is trapped.',
    rows: 2,
  },
  {
    key: 'emergency_services',
    letter: 'E',
    label: 'Emergency services present and required',
    hint: 'Who is on scene, and what you are asking for.',
    rows: 2,
  },
]

function ReportCard({ report }: { report: MethaneReport }) {
  const isStandDown = report.report_type === 'stand_down'
  const accent = isStandDown ? '#3D8361' : report.major_incident ? '#C41E3A' : '#4A7C8C'

  return (
    <div
      className="rounded-[3px] border border-line bg-white p-4"
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className="rounded-[2px] px-2 py-1 text-[10px] font-bold tracking-[0.5px] text-white"
          style={{ backgroundColor: accent }}
        >
          {isStandDown
            ? 'STOOD DOWN'
            : report.major_incident
              ? 'MAJOR INCIDENT'
              : 'ETHANE'}
        </span>
        <span className="text-[12px] font-bold text-ink">METHANE {report.seq}</span>
        <span className="text-[11px] text-faint">
          {report.report_type === 'update' ? 'Update · ' : ''}
          {stamp(report.at)} · {report.author_name}
          {report.author_role ? ` (${report.author_role})` : ''}
        </span>
      </div>

      <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {FIELDS.map((f) => {
          const value = report[f.key] as string | null
          if (!value) return null
          return (
            <div key={f.key}>
              <dt className="text-[10px] font-bold tracking-[0.5px] text-faint">
                {f.letter} · {f.label.toUpperCase()}
              </dt>
              <dd className="m-0 text-[13px] whitespace-pre-wrap text-ink">{value}</dd>
            </div>
          )
        })}
      </dl>

      {report.notes && (
        <p className="mt-2 border-t border-line-soft pt-2 text-[12px] text-muted">
          {report.notes}
        </p>
      )}
    </div>
  )
}

export default function Methane() {
  const { profile, session } = useAuth()
  const { activeEvent, incidents, refresh, lastSync } = useLive()

  const [reports, setReports] = useState<MethaneReport[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const [reportType, setReportType] = useState<MethaneReportType>('declaration')
  const [major, setMajor] = useState(false)
  const [incidentId, setIncidentId] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')

  const isCommander = profile?.role === 'Incident Commander'

  const load = useCallback(async () => {
    if (!activeEvent) return
    const { data } = await supabase
      .from('methane_reports')
      .select('*')
      .eq('event_id', activeEvent.id)
      .order('at', { ascending: false })
    setReports((data as MethaneReport[]) ?? [])
    setLoading(false)
  }, [activeEvent])

  useEffect(() => {
    void load()
  }, [load, lastSync])

  // Current state is the most recent report, not a mutable flag.
  const active = useMemo(() => {
    const latest = reports[0]
    if (!latest) return null
    if (latest.report_type === 'stand_down') return null
    return latest.major_incident ? latest : null
  }, [reports])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (reportType !== 'stand_down') {
      if (!values.exact_location?.trim()) return setError('Exact location is required.')
      if (!values.incident_type?.trim()) return setError('Type of incident is required.')
    }

    setBusy(true)
    const { error: err } = await supabase.from('methane_reports').insert({
      event_id: activeEvent!.id,
      incident_id: incidentId || null,
      author_id: session!.user.id,
      author_name: profile!.full_name,
      author_role: profile!.role,
      report_type: reportType,
      major_incident: reportType === 'stand_down' ? false : major,
      exact_location: values.exact_location?.trim() || (active?.exact_location ?? '—'),
      incident_type: values.incident_type?.trim() || (active?.incident_type ?? '—'),
      hazards: values.hazards?.trim() || null,
      access: values.access?.trim() || null,
      casualties: values.casualties?.trim() || null,
      emergency_services: values.emergency_services?.trim() || null,
      notes: notes.trim() || null,
    })
    setBusy(false)

    if (err) {
      setError(
        err.message.includes('row-level security')
          ? 'Declaring a major incident is reserved to the Incident Commander. You can still send an ETHANE report.'
          : err.message,
      )
      return
    }

    setValues({})
    setNotes('')
    setMajor(false)
    setIncidentId('')
    setShowForm(false)
    await Promise.all([load(), refresh()])
  }

  if (!activeEvent) {
    return (
      <div className="mx-auto max-w-[1000px] px-4 py-8 sm:px-7">
        <Empty>No event selected.</Empty>
      </div>
    )
  }

  const openIncidents = incidents.filter((i) => i.status !== 'Resolved')

  return (
    <div className="mx-auto max-w-[1000px] px-4 pt-5 pb-10 sm:px-7">
      <div className="mb-4">
        <h1 className="text-[22px] font-bold text-ink sm:text-[24px]">M/ETHANE</h1>
        <p className="mt-1 text-[12px] leading-[1.5] text-muted">
          The JESIP structure for passing major incident information. Send one as soon as there is
          something to say — an incomplete report sent now beats a complete one sent late — then
          send updates as the picture changes.
        </p>
      </div>

      {active && (
        <div className="mb-4 rounded-[3px] border border-alert bg-[#fdf2f4] px-4 py-3.5">
          <p className="flex items-center gap-2 text-[13px] font-bold text-alert">
            <span className="tide-pulse inline-block h-[9px] w-[9px] rounded-full bg-alert" />
            MAJOR INCIDENT DECLARED — {clockTime(active.at)} by {active.author_name}
          </p>
          <p className="mt-1 text-[12px] text-ink">
            {active.incident_type} at {active.exact_location}. Declared on METHANE {active.seq}.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <Banner tone="error">{error}</Banner>
        </div>
      )}

      {canWrite(profile?.role) && !activeEvent.locked && (
        <div className="mb-5">
          {!showForm ? (
            <div className="flex flex-wrap gap-2.5">
              <Button
                onClick={() => {
                  setReportType(active ? 'update' : 'declaration')
                  setMajor(Boolean(active))
                  setShowForm(true)
                }}
              >
                {active ? 'Send METHANE update' : 'Send M/ETHANE report'}
              </Button>
              {active && isCommander && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setReportType('stand_down')
                    setShowForm(true)
                  }}
                >
                  Stand down major incident
                </Button>
              )}
            </div>
          ) : (
            <Card title={reportType === 'stand_down' ? 'Stand down' : 'M/ETHANE report'}>
              <form onSubmit={submit}>
                {reportType !== 'stand_down' && (
                  <>
                    <div className="mb-4 rounded-[3px] border border-line bg-wash p-3.5">
                      <label className="flex items-start gap-2.5 text-[13px] text-ink">
                        <input
                          type="checkbox"
                          className="!mt-0.5 !h-4 !w-4 !p-0"
                          checked={major}
                          disabled={!isCommander}
                          onChange={(e) => setMajor(e.target.checked)}
                        />
                        <span>
                          <b>M — Major incident declared.</b>
                          <span className="block text-[11.5px] leading-[1.5] text-muted">
                            Tick only if a major incident is being declared. Leave it clear and
                            this is an ETHANE report — the same structure, below the major
                            incident threshold.
                            {!isCommander && ' Reserved to the Incident Commander.'}
                          </span>
                        </span>
                      </label>
                    </div>

                    {FIELDS.map((f) => (
                      <div key={f.key} className="mb-3.5">
                        <FieldLabel htmlFor={`m-${f.key}`}>
                          {f.letter} — {f.label.toUpperCase()}
                          {f.required && ' *'}
                        </FieldLabel>
                        {f.rows ? (
                          <textarea
                            id={`m-${f.key}`}
                            rows={f.rows}
                            value={values[f.key] ?? ''}
                            onChange={(e) =>
                              setValues((v) => ({ ...v, [f.key]: e.target.value }))
                            }
                            placeholder={f.hint}
                          />
                        ) : (
                          <input
                            id={`m-${f.key}`}
                            type="text"
                            value={values[f.key] ?? ''}
                            onChange={(e) =>
                              setValues((v) => ({ ...v, [f.key]: e.target.value }))
                            }
                            placeholder={f.hint}
                          />
                        )}
                      </div>
                    ))}
                  </>
                )}

                <FieldLabel htmlFor="m-incident">LINK TO AN OPEN INCIDENT (OPTIONAL)</FieldLabel>
                <select
                  id="m-incident"
                  value={incidentId}
                  onChange={(e) => setIncidentId(e.target.value)}
                  className="mb-3.5"
                >
                  <option value="">Not linked</option>
                  {openIncidents.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.ref} · {i.category} · {i.location}
                    </option>
                  ))}
                </select>
                <p className="mt-[-8px] mb-3.5 text-[11px] text-faint">
                  Linking writes this report onto that incident's timeline.
                </p>

                <FieldLabel htmlFor="m-notes">NOTES</FieldLabel>
                <textarea
                  id="m-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mb-4"
                />

                <div className="flex flex-wrap justify-end gap-2.5">
                  <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={busy}>
                    {busy
                      ? 'Sending…'
                      : reportType === 'stand_down'
                        ? 'Confirm stand down'
                        : 'Send report'}
                  </Button>
                </div>
              </form>
            </Card>
          )}
        </div>
      )}

      <h2 className="mb-2.5 text-[13px] font-bold tracking-[0.5px] text-faint">
        REPORT HISTORY — {activeEvent.name}
      </h2>

      {loading ? (
        <Spinner label="Loading reports" />
      ) : reports.length === 0 ? (
        <Card>
          <Empty>
            No M/ETHANE reports sent for this event.{' '}
            <Link to="/control" className="font-bold text-teal underline">
              Back to the board
            </Link>
            .
          </Empty>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {reports.map((r) => (
            <div key={r.id}>
              <p className="mb-1 text-[11px] text-faint">{dateShort(r.at)}</p>
              <ReportCard report={r} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
