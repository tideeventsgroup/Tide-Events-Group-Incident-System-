import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLive } from '../context/LiveContext'
import { SITE_STATES, type SiteState } from '../lib/types'

/**
 * Declaring a show stop, evacuation, invacuation or lockdown.
 *
 * HSE and the Purple Guide treat a controlled halt to a performance as a
 * command action in its own right — "a rapid and controlled halt to a
 * performance to prevent further risk" — and until now the strongest thing
 * this system could record was a METHANE report. It is reserved to the
 * Incident Commander in the insert policy, not merely greyed out here, and
 * the declaration is append-only: the event's current state is read off the
 * latest entry and the log shows how the night went.
 */

export const SITE_STATE_COLOUR: Record<SiteState, string> = {
  Normal: '#4FA97D',
  'Show stop': '#FF5069',
  Evacuation: '#FF5069',
  Invacuation: '#E0455E',
  Lockdown: '#E0455E',
}

export default function SiteStateControl({ onClose }: { onClose: () => void }) {
  const { profile, session } = useAuth()
  const { activeEvent, refresh, refreshEvents } = useLive()
  const [state, setState] = useState<SiteState>(activeEvent?.site_state ?? 'Normal')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const current = activeEvent?.site_state ?? 'Normal'
  const changing = state !== current
  const escalating = state !== 'Normal'

  async function declare() {
    if (escalating && !reason.trim()) {
      setError('A declaration this serious needs a reason on the record.')
      return
    }
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.from('site_state_log').insert({
      event_id: activeEvent!.id,
      state,
      previous_state: current,
      declared_by: session!.user.id,
      declared_by_name: profile!.full_name,
      declared_by_role: profile!.role,
      reason: reason.trim() || null,
    })
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    await Promise.all([refreshEvents(), refresh()])
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh]">
      <div className="w-full max-w-[460px] border border-[#363636] bg-[#1e1e1e] text-[#ececec]">
        <div className="flex items-center justify-between border-b border-[#363636] bg-[#272727] px-4 py-3">
          <h2 className="text-[11px] font-bold tracking-[1.2px] uppercase">Declare site state</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] font-bold text-[#9a9a9a]"
            aria-label="Close"
          >
            ESC
          </button>
        </div>

        <div className="px-4 py-4">
          <div className="grid grid-cols-2 gap-2">
            {SITE_STATES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setState(s)}
                className="rounded-[2px] px-3 py-3 text-[12px] font-bold"
                style={
                  state === s
                    ? { background: SITE_STATE_COLOUR[s], color: '#141414' }
                    : { border: '1px solid #363636', color: '#c8c8c8' }
                }
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>

          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              escalating
                ? 'Why, on whose advice, and what is being done — this is the record'
                : 'Reason for standing down (optional)'
            }
            className="mt-3 !border-[#363636] !bg-[#151515] !text-[#ececec]"
          />

          <p className="mt-2 text-[11px] leading-[1.5] text-[#8f8f8f]">
            Currently <b className="text-[#ececec]">{current}</b>. Declarations are append-only
            and attributed. Every open incident stays exactly as it is — this is the site's
            state, not theirs.
          </p>

          {error && <p className="mt-2 text-[11px] font-bold text-[#ff8a99]">{error}</p>}

          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="cc-chip">
              CANCEL
            </button>
            <button
              type="button"
              disabled={!changing || busy}
              onClick={() => void declare()}
              className="rounded-[2px] px-4 py-2 text-[12px] font-bold disabled:opacity-40"
              style={{
                background: escalating ? '#C41E3A' : '#25BEC8',
                color: escalating ? '#fff' : '#10343a',
              }}
            >
              {busy ? 'DECLARING…' : `DECLARE ${state.toUpperCase()}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
