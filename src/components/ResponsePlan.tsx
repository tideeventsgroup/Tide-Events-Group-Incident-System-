import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card } from './ui'
import { clockTime } from '../lib/format'
import { planFor } from '../lib/incidentFields'
import type { Category, ChecklistTick } from '../lib/types'

/**
 * The response plan for this incident type.
 *
 * WeTrack calls these "automated response plans"; the reason they exist is
 * that at 3am nobody remembers the fifth item. Ticking a step is append-only
 * and writes to the incident timeline, so the plan is part of the evidence
 * rather than a to-do list — which also means a step cannot be un-ticked to
 * make the record look tidier.
 */
export default function ResponsePlan({
  incidentId,
  eventId,
  category,
  writable,
}: {
  incidentId: string
  eventId: string
  category: Category
  writable: boolean
}) {
  const { profile, session } = useAuth()
  const [ticks, setTicks] = useState<ChecklistTick[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const steps = planFor(category)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('incident_checklist')
      .select('*')
      .eq('incident_id', incidentId)
    setTicks((data as ChecklistTick[]) ?? [])
  }, [incidentId])

  useEffect(() => {
    void load()
  }, [load])

  if (steps.length === 0) return null

  const done = new Map(ticks.map((t) => [t.step_key, t]))

  async function tick(step: string) {
    setBusy(step)
    setError(null)
    const { error: err } = await supabase.from('incident_checklist').insert({
      incident_id: incidentId,
      event_id: eventId,
      step_key: step,
      by_id: session!.user.id,
      by_name: profile!.full_name,
    })
    setBusy(null)
    if (err) {
      setError(err.message)
      return
    }
    await load()
  }

  const complete = steps.filter((s) => done.has(s)).length

  return (
    <Card title={`Response Plan — ${complete}/${steps.length}`}>
      <ul className="flex flex-col">
        {steps.map((step) => {
          const t = done.get(step)
          return (
            <li
              key={step}
              className="flex items-start gap-2.5 border-b border-line-soft py-2.5 last:border-b-0"
            >
              <button
                type="button"
                disabled={!writable || !!t || busy === step}
                aria-label={t ? `${step} — completed` : `Mark ${step} complete`}
                onClick={() => void tick(step)}
                className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] border text-[12px] font-bold"
                style={
                  t
                    ? { borderColor: '#3D8361', background: '#3D8361', color: '#fff' }
                    : { borderColor: '#D8CFCA', background: '#fff', color: 'transparent' }
                }
              >
                ✓
              </button>
              <div className="min-w-0">
                <p className={`text-[13px] leading-[1.45] ${t ? 'text-muted' : 'text-ink'}`}>
                  {step}
                </p>
                {t && (
                  <p className="text-[11px] text-faint">
                    {clockTime(t.at)} · {t.by_name}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {error && <p className="mt-2 text-[11px] font-bold text-alert">{error}</p>}
      <p className="mt-3 border-t border-line-soft pt-3 text-[11px] leading-[1.5] text-faint">
        Steps are recorded once and cannot be un-ticked — each one writes to the timeline with
        who and when. An unworked step is not a failure, it is a fact the debrief should see.
      </p>
    </Card>
  )
}
