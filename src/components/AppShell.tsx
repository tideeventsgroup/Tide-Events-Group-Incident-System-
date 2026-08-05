import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLive } from '../context/LiveContext'
import { clockSeconds, dayLabel, addDays } from '../lib/format'
import { initials } from '../lib/style'
import { canWrite } from '../lib/types'
import Alerts from './Alerts'

/* ------------------------------------------------------------------ icons */
/* Inline so the shell has no icon dependency and works offline. */

const ICON = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', strokeWidth: 1.9 } as const

function BoardIcon() {
  return (
    <svg {...ICON} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M9 9v11" />
    </svg>
  )
}
function LogIcon() {
  return (
    <svg {...ICON} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
function HistoryIcon() {
  return (
    <svg {...ICON} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}
function LogbookIcon() {
  return (
    <svg {...ICON} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H19v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
      <path d="M8 8h7M8 12h7M8 16h4" />
    </svg>
  )
}
function SettingsIcon() {
  return (
    <svg {...ICON} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H7a1.7 1.7 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V7a1.7 1.7 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  )
}

interface Tab {
  to: string
  label: string
  short: string
  end: boolean
  icon: () => ReactNode
  writeOnly?: boolean
  primary?: boolean
}

function MoreIcon() {
  return (
    <svg {...ICON} stroke="currentColor" strokeLinecap="round">
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** The five that are in an operator's hands all night. */
const TABS: Tab[] = [
  { to: '/control', label: 'Dashboard', short: 'Board', end: true, icon: BoardIcon },
  { to: '/control/log', label: 'Event Log', short: 'Log', end: false, icon: LogbookIcon },
  { to: '/control/new', label: 'New Incident', short: 'New', end: false, icon: LogIcon, writeOnly: true, primary: true },
  { to: '/control/history', label: 'History', short: 'History', end: false, icon: HistoryIcon },
  { to: '/control/settings', label: 'Event Settings', short: 'Event', end: false, icon: SettingsIcon },
]

/**
 * Everything else, behind one door. A control room tool that puts twelve
 * destinations across the top has stopped being a tool, and the five above are
 * the ones reached without thinking.
 */
const MORE: {
  to: string
  label: string
  note: string
  alarm?: boolean
  /** Hidden from read-only roles, whose policies would return an empty page. */
  writeOnly?: boolean
}[] = [
  {
    to: '/control/methane',
    label: 'M/ETHANE',
    note: 'JESIP major incident report',
    alarm: true,
    writeOnly: true,
  },
  { to: '/control/map', label: 'Site Map', note: 'Incidents pinned on the site plan' },
  { to: '/control/occupancy', label: 'Occupancy', note: 'Entry counts against capacity' },
  { to: '/control/planning', label: 'Actions & Risks', note: 'Follow-ups and the risk register' },
  {
    to: '/control/public',
    label: 'Public & Property',
    note: 'Public reports and lost property',
    writeOnly: true,
  },
  { to: '/control/debrief', label: 'Debrief Pack', note: 'Post-event statistics and export' },
]

function LiveClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return <>{clockSeconds(now)}</>
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const { events, activeEvent, activeEventId, setActiveEventId, connected, pending } = useLive()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    setMenuOpen(false)
    setMoreOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!moreOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moreOpen])

  const write = canWrite(profile?.role)
  const tabs = TABS.filter((t) => !t.writeOnly || write)
  // A Client following a link to a page whose select policy excludes them gets
  // a blank screen and no explanation. Do not offer the door.
  const more = MORE.filter((m) => !m.writeOnly || write)
  const dayText = activeEvent
    ? `Day ${activeEvent.active_day} · ${dayLabel(
        addDays(activeEvent.start_date, activeEvent.active_day - 1),
      )}`
    : ''

  return (
    <div className="app-shell">
      {/* ------------------------------------------------------- app bar */}
      <header className="app-bar">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src="/tide-logo-white.png"
            alt="Tide Events Group"
            className="h-[20px] w-auto shrink-0"
          />
          <div className="hidden h-[24px] w-px shrink-0 bg-[#555] sm:block" />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[13px] font-bold">
              <span className="hidden sm:inline">Incident Management System</span>
              <span className="sm:hidden">Tide IMS</span>
            </div>
            <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-[#b8b8b8]">
              {events.length > 1 ? (
                <select
                  aria-label="Active event"
                  value={activeEventId ?? ''}
                  onChange={(e) => setActiveEventId(e.target.value)}
                  className="!w-auto max-w-[46vw] truncate !border-none !bg-transparent !p-0 !text-[11px] !text-[#b8b8b8] sm:max-w-none"
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
              {activeEvent && <span className="hidden lg:inline">· {dayText}</span>}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 sm:gap-5">
          <Alerts />
          <div className="hidden items-center gap-1.5 md:flex">
            <span
              className={`h-[7px] w-[7px] rounded-full ${connected ? 'bg-ok tide-pulse' : 'bg-[#8a8a8a]'}`}
              aria-hidden="true"
            />
            <span className="text-[11px] tracking-[0.5px] text-[#b8b8b8]">
              {connected ? 'LIVE' : 'RECONNECTING'} — <LiveClock />
            </span>
          </div>

          {/* Desktop tabs sit in the bar; small screens get the bottom bar. */}
          <nav className="hidden items-center gap-1 lg:flex">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `rounded-full px-3.5 py-2 text-[12.5px] font-bold no-underline transition-colors ${
                    isActive
                      ? 'bg-teal text-white'
                      : 'text-[#c8c8c8] hover:bg-[#444] hover:text-white'
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className="rounded-full px-3.5 py-2 text-[12.5px] font-bold text-[#c8c8c8] transition-colors hover:bg-[#444] hover:text-white"
            >
              More ▾
            </button>
          </nav>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Account"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal text-[13px] font-bold text-white"
            >
              {initials(profile?.full_name ?? '')}
            </button>
            {menuOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setMenuOpen(false)}
                  className="fixed inset-0 z-30 cursor-default bg-black/20"
                />
                <div
                  role="menu"
                  className="absolute right-0 z-40 mt-2 w-64 rounded-[6px] border border-line bg-white p-3 text-ink shadow-xl"
                >
                  <p className="text-[13px] font-bold">{profile?.full_name}</p>
                  <p className="text-[11px] text-muted">{profile?.role}</p>
                  {profile?.callsign && (
                    <p className="text-[11px] text-faint">Callsign {profile.callsign}</p>
                  )}
                  <p className="mt-2 border-t border-line-soft pt-2 text-[11px] break-all text-faint">
                    {profile?.email}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-faint">
                    <span
                      className={`h-[6px] w-[6px] rounded-full ${connected ? 'bg-ok' : 'bg-[#8a8a8a]'}`}
                    />
                    {connected ? 'Live' : 'Reconnecting'}
                    {pending.length > 0 && ` · ${pending.length} queued`}
                  </div>
                  <Link
                    to="/control/methane"
                    className="mt-3 block rounded-[4px] border border-alert px-3 py-2.5 text-center text-[12px] font-bold text-alert no-underline lg:hidden"
                  >
                    M/ETHANE report
                  </Link>
                  <Link
                    to="/"
                    className="mt-2 block rounded-[4px] border border-line px-3 py-2.5 text-center text-[12px] font-bold text-muted no-underline hover:bg-wash"
                  >
                    ← Tide public site
                  </Link>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="mt-2 w-full rounded-[4px] bg-ink px-3 py-2.5 text-[12px] font-bold text-white"
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="app-main">{children}</main>

      {/* ------------------------------------------------------ more sheet */}
      {moreOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-black/50"
          />
          <div
            role="dialog"
            aria-label="More sections"
            className="more-sheet"
          >
            <div className="flex items-center justify-between px-4 pt-1 pb-3">
              <p className="text-[11px] font-bold tracking-[1.2px] text-faint">MORE</p>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="text-[11px] font-bold text-muted"
              >
                CLOSE
              </button>
            </div>
            {more.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-baseline gap-2 border-t border-line-soft px-4 py-3.5 no-underline"
              >
                <span
                  className={`text-[14px] font-bold ${item.alarm ? 'text-alert' : 'text-ink'}`}
                >
                  {item.label}
                </span>
                <span className="text-[11px] text-faint">{item.note}</span>
              </Link>
            ))}
            <Link
              to="/control/settings"
              className="flex items-baseline gap-2 border-t border-line-soft px-4 py-3.5 no-underline lg:hidden"
            >
              <span className="text-[14px] font-bold text-ink">Event Settings</span>
              <span className="text-[11px] text-faint">Configuration, team, units, retention</span>
            </Link>
          </div>
        </>
      )}

      {/* --------------------------------------------- bottom tab bar */}
      <nav className="tab-bar lg:hidden" aria-label="Sections">
        {tabs
          .filter((t) => t.to !== '/control/settings')
          .map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `tab ${isActive ? 'is-active' : ''} ${tab.primary ? 'is-primary' : ''}`
            }
          >
            <span className="tab-icon">
              <tab.icon />
            </span>
            <span className="tab-label">{tab.short}</span>
            {tab.to === '/control' && pending.length > 0 && (
              <span className="tab-badge" aria-label={`${pending.length} queued`}>
                {pending.length}
              </span>
            )}
          </NavLink>
        ))}
        <button type="button" onClick={() => setMoreOpen(true)} className="tab">
          <span className="tab-icon">
            <MoreIcon />
          </span>
          <span className="tab-label">More</span>
        </button>
      </nav>
    </div>
  )
}
