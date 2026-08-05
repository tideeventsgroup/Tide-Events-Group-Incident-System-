import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLive } from '../context/LiveContext'
import { supabase } from '../lib/supabase'
import { Button, Card, Empty, FieldLabel, Spinner } from '../components/ui'
import { stamp } from '../lib/format'
import {
  PROPERTY_STATES,
  canWrite,
  type PropertyRecord,
  type PropertyState,
  type PublicReport,
} from '../lib/types'

/**
 * Lost property, and the public's own reports.
 *
 * Both are their own module in every venue product, and both exist for the
 * same reason as the event log: they are high-volume, they are not incidents,
 * and putting them through the incident form would bury the incidents.
 *
 * Public reports are the "see something, say something" channel. WeTrack does
 * it by SMS; a QR code pointing at a web form does the same job without a
 * telco account, and `anon` holds INSERT on the table and nothing else, so
 * anybody with the publishable key can submit a report and nobody can read
 * the reports back.
 */

const STATE_COLOUR: Record<PropertyState, string> = {
  Held: '#4A7C8C',
  Claimed: '#3D8361',
  'Handed to police': '#6B7280',
  Disposed: '#8a8a8a',
}

function Triage({ writable }: { writable: boolean }) {
  const navigate = useNavigate()
  const { activeEvent, lastSync } = useLive()
  const { session } = useAuth()
  const [rows, setRows] = useState<PublicReport[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!activeEvent) return
    const { data } = await supabase
      .from('public_reports')
      .select('*')
      .eq('event_id', activeEvent.id)
      .order('at', { ascending: false })
      .limit(200)
    setRows((data as PublicReport[]) ?? [])
    setLoading(false)
  }, [activeEvent])

  useEffect(() => {
    void load()
  }, [load, lastSync])

  const untriaged = rows.filter((r) => !r.triaged_at && !r.dismissed)
  const triaged = rows.filter((r) => r.triaged_at || r.dismissed)

  async function dismiss(r: PublicReport) {
    await supabase
      .from('public_reports')
      .update({ dismissed: true, triaged_at: new Date().toISOString(), triaged_by: session!.user.id })
      .eq('id', r.id)
    await load()
  }

  /**
   * Mark the report handled *before* leaving for the form, then hand the
   * report's own id across so the new incident can link back to it. Without
   * both halves the report sat in the untriaged list for ever while an
   * incident quietly existed for it, and the form opened blank — the operator
   * had to retype what the public had already written.
   */
  async function raise(r: PublicReport) {
    await supabase
      .from('public_reports')
      .update({ triaged_at: new Date().toISOString(), triaged_by: session!.user.id })
      .eq('id', r.id)
    navigate('/control/new', {
      state: {
        fromReport: r.id,
        description: r.what,
        location: r.where_text ?? '',
        reportedBy: `Member of the public${r.contact ? ` — ${r.contact}` : ''}`,
      },
    })
  }

  const reportUrl = `${window.location.origin}/report/${activeEvent?.id ?? ''}`

  return (
    <>
      <Card className="mb-4" title="Public reporting link">
        <p className="text-[12px] leading-[1.5] text-muted">
          Put this on signage, wristbands or a QR code. It takes a report from anyone on site
          without an account, and lands it here for triage.
        </p>
        <p className="mt-2 rounded-[3px] border border-line bg-wash px-3 py-2 text-[12px] break-all text-ink">
          {reportUrl}
        </p>
      </Card>

      <Card title={`Untriaged reports (${untriaged.length})`} padded={false}>
        {loading ? (
          <Spinner label="Loading reports" />
        ) : untriaged.length === 0 ? (
          <Empty>Nothing waiting.</Empty>
        ) : (
          untriaged.map((r) => (
            <div key={r.id} className="border-b border-line-soft px-4 py-3 last:border-b-0">
              <p className="text-[13px] leading-[1.5] whitespace-pre-wrap text-ink">{r.what}</p>
              <p className="mt-1 text-[11px] text-faint">
                {stamp(r.at)}
                {r.where_text ? ` · ${r.where_text}` : ''}
                {r.contact ? ` · ${r.contact}` : ''}
              </p>
              {writable && (
                <div className="mt-2 flex gap-2">
                  <Button
                    variant="ghost"
                    className="!px-3 !py-1.5 !text-[11px]"
                    onClick={() => void raise(r)}
                  >
                    Raise as incident
                  </Button>
                  <Button
                    variant="ghost"
                    className="!px-3 !py-1.5 !text-[11px]"
                    onClick={() => void dismiss(r)}
                  >
                    No action
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
        <p className="border-t border-line-soft px-4 py-3 text-[11px] leading-[1.5] text-faint">
          Reports are kept whether or not they are acted on — a dismissed report is still part of
          what the control room was told and when.
        </p>
      </Card>

      {triaged.length > 0 && (
        <Card title={`Already triaged (${triaged.length})`} className="mt-4" padded={false}>
          {triaged.slice(0, 25).map((r) => (
            <div key={r.id} className="border-b border-line-soft px-4 py-2.5 last:border-b-0">
              <p className="text-[12px] leading-[1.5] text-muted">{r.what}</p>
              <p className="mt-0.5 text-[11px] text-faint">
                {stamp(r.at)} ·{' '}
                {r.dismissed ? (
                  'no action taken'
                ) : r.incident_id ? (
                  <Link
                    to={`/control/incident/${r.incident_id}`}
                    className="font-bold text-teal"
                  >
                    raised as an incident
                  </Link>
                ) : (
                  'handled'
                )}
              </p>
            </div>
          ))}
        </Card>
      )}
    </>
  )
}

function Property({ writable }: { writable: boolean }) {
  const { profile, session } = useAuth()
  const { activeEvent, lastSync } = useLive()
  const [rows, setRows] = useState<PropertyRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [description, setDescription] = useState('')
  const [where, setWhere] = useState('')
  const [holder, setHolder] = useState('')
  const [claiming, setClaiming] = useState<string | null>(null)
  const [claimName, setClaimName] = useState('')
  const [claimContact, setClaimContact] = useState('')

  const load = useCallback(async () => {
    if (!activeEvent) return
    const { data } = await supabase
      .from('lost_property')
      .select('*')
      .eq('event_id', activeEvent.id)
      .order('found_at', { ascending: false })
    setRows((data as PropertyRecord[]) ?? [])
    setLoading(false)
  }, [activeEvent])

  useEffect(() => {
    void load()
  }, [load, lastSync])

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!description.trim()) return
    setError(null)
    // The reference is assigned by the database. Counting the rows this
    // browser happened to have loaded gave two operators the same LP-004.
    const { error: err } = await supabase.from('lost_property').insert({
      event_id: activeEvent!.id,
      description: description.trim(),
      found_location: where.trim() || null,
      holder: holder.trim() || null,
      created_by: session!.user.id,
      created_by_name: profile!.full_name,
    })
    if (err) {
      setError(err.message)
      return
    }
    setDescription('')
    setWhere('')
    await load()
  }

  async function claim(item: PropertyRecord, name: string, contact: string) {
    if (!name.trim()) return
    const { error: err } = await supabase
      .from('lost_property')
      .update({
        state: 'Claimed',
        claimed_at: new Date().toISOString(),
        claimed_by_name: name.trim(),
        claimed_contact: contact.trim() || null,
      })
      .eq('id', item.id)
    if (err) setError(err.message)
    setClaiming(null)
    await load()
  }

  return (
    <>
      {writable && (
        <Card className="mb-4" title="Log found property">
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="p-desc">ITEM</FieldLabel>
              <input
                id="p-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Black rucksack, red zip, water bottle inside"
              />
            </div>
            <div>
              <FieldLabel htmlFor="p-where">FOUND</FieldLabel>
              <input
                id="p-where"
                value={where}
                onChange={(e) => setWhere(e.target.value)}
                placeholder="Zone B"
              />
            </div>
            <div>
              <FieldLabel htmlFor="p-holder">HELD BY</FieldLabel>
              <input
                id="p-holder"
                value={holder}
                onChange={(e) => setHolder(e.target.value)}
                placeholder="Welfare 1"
              />
            </div>
            <div className="flex items-end sm:col-span-4">
              <Button type="submit" disabled={!description.trim()}>
                Log item
              </Button>
            </div>
          </form>
          {error && <p className="mt-2 text-[11px] font-bold text-alert">{error}</p>}
        </Card>
      )}

      <Card title={`Property (${rows.length})`} padded={false}>
        {loading ? (
          <Spinner label="Loading property" />
        ) : rows.length === 0 ? (
          <Empty>Nothing logged.</Empty>
        ) : (
          rows.map((item) => (
            <div key={item.id} className="border-b border-line-soft px-4 py-3 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-faint">{item.ref}</span>
              <span className="text-[13px] text-ink">{item.description}</span>
              {item.found_location && (
                <span className="text-[11px] text-faint">{item.found_location}</span>
              )}
              {item.holder && <span className="text-[11px] text-faint">held by {item.holder}</span>}
              <span
                className="ml-auto text-[11px] font-bold"
                style={{ color: STATE_COLOUR[item.state] }}
              >
                {item.state.toUpperCase()}
                {item.claimed_by_name ? ` — ${item.claimed_by_name}` : ''}
              </span>
              {writable && item.state === 'Held' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setClaiming(claiming === item.id ? null : item.id)
                      setClaimName('')
                      setClaimContact('')
                    }}
                    className="text-[11px] font-bold text-teal underline"
                  >
                    {claiming === item.id ? 'cancel' : 'claim'}
                  </button>
                  <select
                    aria-label={`State of ${item.ref}`}
                    value={item.state}
                    onChange={(e) =>
                      void supabase
                        .from('lost_property')
                        .update({ state: e.target.value })
                        .eq('id', item.id)
                        .then(load)
                    }
                    className="!w-auto !py-1 !text-[11px]"
                  >
                    {PROPERTY_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </>
              )}
              </div>

              {claiming === item.id && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void claim(item, claimName, claimContact)
                  }}
                  className="mt-2.5 grid gap-2 border-t border-line-soft pt-2.5 sm:grid-cols-[1fr_1fr_auto]"
                >
                  <input
                    value={claimName}
                    onChange={(e) => setClaimName(e.target.value)}
                    placeholder="Claimed by (name)"
                    aria-label={`Claimant name for ${item.ref}`}
                    autoFocus
                  />
                  <input
                    value={claimContact}
                    onChange={(e) => setClaimContact(e.target.value)}
                    placeholder="Contact (optional)"
                    aria-label={`Claimant contact for ${item.ref}`}
                  />
                  <Button type="submit" variant="ghost" disabled={!claimName.trim()}>
                    Record claim
                  </Button>
                </form>
              )}
            </div>
          ))
        )}
        {error && <p className="px-4 py-2 text-[11px] font-bold text-alert">{error}</p>}
      </Card>
    </>
  )
}

export default function PropertyAndReports() {
  const { profile } = useAuth()
  const { activeEvent } = useLive()
  const [tab, setTab] = useState<'reports' | 'property'>('reports')
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
        <h1 className="text-[22px] font-bold text-ink sm:text-[24px]">Public &amp; Property</h1>
        <p className="mt-1 text-[12px] leading-[1.5] text-muted">
          What the public tell you, and what they leave behind. Both are high volume and neither
          is an incident until somebody decides it is.
        </p>
      </div>

      <div className="mb-4 flex gap-2">
        {(['reports', 'property'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-[3px] border px-3.5 py-2 text-[12px] font-bold ${
              tab === t ? 'border-ink bg-ink text-white' : 'border-line text-muted'
            }`}
          >
            {t === 'reports' ? 'PUBLIC REPORTS' : 'LOST PROPERTY'}
          </button>
        ))}
      </div>

      {tab === 'reports' ? <Triage writable={writable} /> : <Property writable={writable} />}
    </div>
  )
}
