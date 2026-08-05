import { useEffect, useRef, useState } from 'react'
import { useLive } from '../context/LiveContext'
import { SEVERITY_RANK } from '../lib/style'

/**
 * Severity-triggered alerting.
 *
 * Controlled Events and 24/7 both list "automated alerts triggered by incident
 * severity" as core, and the reason is the one thing a wall board cannot fix:
 * an operator looking at the other screen. A P1 arriving, or a site state
 * being declared, now raises a desktop notification and an audible tone.
 *
 * These are *foreground* notifications — they fire while the tool is open in a
 * tab or as an installed app. Waking a phone with the app closed needs a push
 * service subscription, a VAPID key pair and a server to send from; that is a
 * deployment decision with keys attached, so it is deliberately not faked
 * here. See the README.
 */

const STORAGE_KEY = 'tide.alerts'

/** A short two-tone chime, synthesised so nothing has to be downloaded. */
function chime(urgent: boolean) {
  try {
    const Ctx = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const now = ctx.currentTime
    const notes = urgent ? [880, 660, 880] : [660, 880]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + i * 0.18)
      gain.gain.exponentialRampToValueAtTime(0.22, now + i * 0.18 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.16)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + i * 0.18)
      osc.stop(now + i * 0.18 + 0.18)
    })
    setTimeout(() => void ctx.close(), 1200)
  } catch {
    /* an alert that cannot make a sound is still an alert */
  }
}

export default function Alerts() {
  const { incidents, activeEvent, activeEventId, lastSync } = useLive()
  const [on, setOn] = useState(() => localStorage.getItem(STORAGE_KEY) === 'on')
  const seen = useRef<Set<string> | null>(null)
  const lastState = useRef<string | null>(null)

  const primedFor = useRef<string | null>(null)

  /*
   * Prime from the *first completed sync of each event*, not the first render.
   * `incidents` starts as an empty array, so priming eagerly recorded nothing
   * as seen and the first real board then arrived looking like a dozen brand
   * new incidents — an alarm storm on every reload, which is exactly how you
   * get a control room to switch alerting off and leave it off. Switching
   * event re-primes for the same reason: arriving at a board that is already
   * in Show stop is not a declaration.
   */
  useEffect(() => {
    if (!lastSync || primedFor.current === activeEventId) return
    seen.current = new Set(incidents.map((i) => i.id))
    lastState.current = activeEvent?.site_state ?? null
    primedFor.current = activeEventId
  }, [lastSync, activeEventId, incidents, activeEvent?.site_state])

  useEffect(() => {
    if (!on || seen.current === null) return
    const fresh = incidents.filter((i) => !seen.current!.has(i.id))
    for (const i of fresh) seen.current.add(i.id)

    const urgent = fresh.filter((i) => SEVERITY_RANK[i.severity] >= 3)
    if (urgent.length === 0) return

    chime(urgent.some((i) => i.severity === 'Critical'))
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      for (const i of urgent) {
        new Notification(`${i.severity.toUpperCase()} — ${i.category}`, {
          body: `${i.ref} · ${i.location}`,
          tag: i.id,
        })
      }
    }
  }, [incidents, on])

  // A site state declaration is the loudest thing that can happen.
  useEffect(() => {
    const state = activeEvent?.site_state ?? null
    if (lastState.current !== null && state !== lastState.current && state && state !== 'Normal') {
      if (on) {
        chime(true)
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(`${state.toUpperCase()} DECLARED`, {
            body: activeEvent?.name ?? '',
            tag: 'site-state',
          })
        }
      }
    }
    lastState.current = state
  }, [activeEvent?.site_state, activeEvent?.name, on])

  async function toggle() {
    if (on) {
      setOn(false)
      localStorage.setItem(STORAGE_KEY, 'off')
      return
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      await Notification.requestPermission()
    }
    setOn(true)
    localStorage.setItem(STORAGE_KEY, 'on')
    chime(false)
  }

  // An inline mark rather than 🔔, whose emoji glyph renders orange — and teal
  // is the only accent colour this brand uses.
  const Bell = () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="inline-block align-[-2px]"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      {!on && <path d="M3 3l18 18" />}
    </svg>
  )

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      title={
        on
          ? 'Alerting on — P1/P2 incidents and site state declarations'
          : 'Alerting off — tap to enable sound and notifications'
      }
      aria-pressed={on}
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-bold tracking-[0.5px] ${
        on ? 'bg-teal text-[#10343a]' : 'text-[#9a9a9a] hover:bg-[#444] hover:text-white'
      }`}
    >
      <Bell />
      <span className="hidden sm:inline">ALERTS</span>
    </button>
  )
}
