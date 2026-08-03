import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { Button, FieldLabel } from '../components/ui'
import { ROLES } from '../lib/types'

const ROLE_BLURB: Record<string, string> = {
  'Incident Commander': 'Full oversight, closes incidents, sets command level',
  'Security Supervisor': 'Logs and updates security & crowd incidents',
  'Medical Lead': 'Manages medical incidents, casualty handovers',
  'Ops Director': 'Read access, history, audit & export rights',
}

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(
        err instanceof Error && /invalid/i.test(err.message)
          ? 'Those credentials were not recognised.'
          : err instanceof Error
            ? err.message
            : 'Sign in failed.',
      )
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-shell px-5 py-10">
      <div className="mb-7 flex items-center gap-3.5">
        <img src="/tide-logo.png" alt="Tide Events Group" className="h-[34px] w-auto" />
        <div className="h-[34px] w-px bg-[#D8C9C2]" />
        <div className="leading-[1.3]">
          <div className="text-[15px] font-bold text-ink">Incident Management System</div>
          <div className="text-[11px] tracking-[0.5px] text-faint">EVENT SAFETY CONSULTANCY</div>
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        className="w-[520px] max-w-[92vw] rounded-[4px] border border-[#EADFDA] bg-white px-6 py-8 shadow-[0_2px_24px_rgba(51,51,51,0.08)] sm:px-10 sm:py-9"
      >
        <p className="mb-1.5 text-[11px] font-bold tracking-[1px] text-teal">
          CONTROL ROOM ACCESS
        </p>
        <h1 className="mb-1 text-[22px] font-bold text-ink">Sign in to event control</h1>
        <p className="mb-6 text-[13px] text-muted">
          Your role and permissions are assigned to your account by the Ops Director.
        </p>

        <FieldLabel htmlFor="email">EMAIL</FieldLabel>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@tideeventsgroup.co.uk"
          className="mb-4"
        />

        <FieldLabel htmlFor="password">PASSWORD</FieldLabel>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-5"
        />

        {error && (
          <p role="alert" className="mb-4 text-[12px] font-bold text-alert">
            {error}
          </p>
        )}

        <Button type="submit" block disabled={busy} className="!text-[15px] tracking-[0.5px]">
          {busy ? 'SIGNING IN…' : 'SIGN IN TO CONTROL ROOM'}
        </Button>

        <div className="mt-6 border-t border-line-soft pt-4">
          <p className="mb-2.5 text-[11px] font-bold tracking-[0.5px] text-ink">
            ROLES IN THIS SYSTEM
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {ROLES.map((role) => (
              <div key={role} className="rounded-[3px] border border-line bg-white p-3.5">
                <div className="mb-1 text-[13px] font-bold text-ink">{role}</div>
                <div className="text-[11px] leading-[1.4] text-muted">{ROLE_BLURB[role]}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-[1.5] text-faint">
            Medical incident detail is visible to the Medical Lead and Ops Director only. All
            other roles see category, severity and status without the clinical narrative.
          </p>
        </div>
      </form>

      <p className="mt-6 text-center text-[11px] leading-[1.6] text-[#9a9a9a]">
        Confidential — for use by authorised control room personnel only.
        <br />© {new Date().getFullYear()} Tide Events Group Scotland
      </p>
    </div>
  )
}
