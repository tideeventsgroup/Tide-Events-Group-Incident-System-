import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLive } from '../context/LiveContext'
import { clockSeconds, dayLabel, addDays } from '../lib/format'
import { initials } from '../lib/style'
import { canWrite } from '../lib/types'

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/new', label: 'New Incident', end: false, writeOnly: true },
  { to: '/history', label: 'Incident History', end: false },
  { to: '/settings', label: 'Event Settings', end: false },
]

function LiveClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return <>{clockSeconds(now)}</>
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth()
  const { events, activeEvent, activeEventId, setActiveEventId, connected } = useLive()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  const dayText = activeEvent
    ? `Day ${activeEvent.active_day} (${dayLabel(
        addDays(activeEvent.start_date, activeEvent.active_day - 1),
      )})`
    : ''

  const tabs = NAV.filter((t) => !t.writeOnly || canWrite(profile?.role))

  return (
    <div className="min-h-screen bg-shell">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-ink px-4 py-3 text-white sm:px-7">
        <div className="flex min-w-0 items-center gap-3.5">
          <img src="/tide-logo-white.png" alt="Tide Events Group" className="h-[22px] w-auto" />
          <div className="hidden h-[26px] w-px bg-[#555555] sm:block" />
          <div className="min-w-0 leading-[1.25]">
            <div className="text-[13px] font-bold">Incident Management System</div>
            <div className="flex items-center gap-1.5 text-[11px] text-[#b8b8b8]">
              {events.length > 1 ? (
                <select
                  aria-label="Active event"
                  value={activeEventId ?? ''}
                  onChange={(e) => setActiveEventId(e.target.value)}
                  className="!w-auto max-w-[52vw] truncate !border-none !bg-transparent !p-0 !text-[11px] !text-[#b8b8b8] focus-visible:!outline-teal sm:max-w-none"
                >
                  {events.map((e) => (
                    <option key={e.id} value={e.id} className="text-ink">
                      {e.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="truncate">{activeEvent?.name ?? 'No event selected'}</span>
              )}
              {activeEvent && <span className="hidden sm:inline">— {dayText}</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:gap-[22px]">
          <div className="hidden items-center gap-1.5 md:flex">
            <span
              className={`h-[7px] w-[7px] rounded-full ${connected ? 'bg-ok tide-pulse' : 'bg-[#8a8a8a]'}`}
              aria-hidden="true"
            />
            <span className="text-[11px] tracking-[0.5px] text-[#b8b8b8]">
              {connected ? 'LIVE' : 'RECONNECTING'} — <LiveClock />
            </span>
          </div>

          <div className="hidden text-right leading-[1.3] sm:block">
            <div className="text-[12px] font-bold">{profile?.full_name ?? '—'}</div>
            <div className="text-[10px] font-bold tracking-[0.5px] text-teal">
              {profile?.role?.toUpperCase()}
            </div>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-teal text-[13px] font-bold text-white"
            >
              {initials(profile?.full_name ?? '')}
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 z-20 mt-2 w-60 rounded-[3px] border border-line bg-white p-3 text-ink shadow-lg"
              >
                <p className="text-[13px] font-bold">{profile?.full_name}</p>
                <p className="text-[11px] text-muted">{profile?.role}</p>
                {profile?.callsign && (
                  <p className="text-[11px] text-faint">Callsign {profile.callsign}</p>
                )}
                <p className="mt-2 border-t border-line-soft pt-2 text-[11px] text-faint">
                  {profile?.email}
                </p>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="mt-3 w-full rounded-[3px] bg-ink px-3 py-2.5 text-[12px] font-bold text-white"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <nav className="flex overflow-x-auto border-b border-line bg-white px-2 sm:px-7">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `shrink-0 whitespace-nowrap border-b-[3px] px-3.5 py-3.5 text-[13px] font-bold no-underline sm:px-[18px] ${
                isActive ? 'border-teal text-teal' : 'border-transparent text-muted hover:text-ink'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <main>{children}</main>
    </div>
  )
}
