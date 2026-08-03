import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '../lib/supabase'
import {
  flushQueue,
  listPending,
  requestDurableStorage,
  type PendingIncident,
} from '../lib/offlineQueue'
import type { BoardIncident, EventRecord } from '../lib/types'
import { useAuth } from './AuthContext'

const STORAGE_KEY = 'tide.activeEventId'
const EVENTS_KEY = 'tide.events'

/**
 * Event configuration — names, zones, dates — is cached so an operator who
 * reloads on a dead signal can still open the form and log an incident against
 * the right zone. Incident state is deliberately never cached: configuration
 * going slightly stale is harmless, an out-of-date board is not.
 */
function cachedEvents(): EventRecord[] {
  try {
    const raw = localStorage.getItem(EVENTS_KEY)
    return raw ? (JSON.parse(raw) as EventRecord[]) : []
  } catch {
    return []
  }
}

interface LiveValue {
  events: EventRecord[]
  activeEvent: EventRecord | null
  activeEventId: string | null
  setActiveEventId: (id: string) => void
  incidents: BoardIncident[]
  /** Ids touched by the most recent realtime refresh, for row highlighting. */
  recentlyChanged: Set<string>
  connected: boolean
  lastSync: Date | null
  loading: boolean
  refresh: () => Promise<void>
  refreshEvents: () => Promise<void>
  /** Incidents raised offline and not yet accepted by the server. */
  pending: PendingIncident[]
  /** Queued incidents the server refused outright — needs an operator decision. */
  rejected: PendingIncident[]
  dismissRejected: () => void
  syncNow: () => Promise<void>
  /** Re-read the local queue — call after enqueuing so the board updates at once. */
  refreshPending: () => Promise<void>
}

const Ctx = createContext<LiveValue | null>(null)

export function LiveProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [events, setEvents] = useState<EventRecord[]>(cachedEvents)
  const [activeEventId, setActiveEventIdState] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY),
  )
  const [incidents, setIncidents] = useState<BoardIncident[]>([])
  const [recentlyChanged, setRecentlyChanged] = useState<Set<string>>(new Set())
  const [connected, setConnected] = useState(false)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<PendingIncident[]>([])
  const [rejected, setRejected] = useState<PendingIncident[]>([])

  const stampsRef = useRef<Map<string, string>>(new Map())
  const eventIdRef = useRef<string | null>(activeEventId)
  eventIdRef.current = activeEventId

  const setActiveEventId = useCallback((id: string) => {
    localStorage.setItem(STORAGE_KEY, id)
    stampsRef.current = new Map()
    setIncidents([])
    setActiveEventIdState(id)
  }, [])

  const refreshEvents = useCallback(async () => {
    const { data } = await supabase
      .from('events')
      .select('*')
      .order('start_date', { ascending: false })
    const rows = (data as EventRecord[]) ?? []
    if (rows.length === 0) return // offline or blocked — keep the cached config
    setEvents(rows)
    try {
      localStorage.setItem(EVENTS_KEY, JSON.stringify(rows))
    } catch {
      /* quota — the app still works, it just cannot log offline after a reload */
    }

    // Land on a sensible event the first time round: the live one, else newest.
    if (rows.length > 0) {
      const current = eventIdRef.current
      if (!current || !rows.some((e) => e.id === current)) {
        const pick = rows.find((e) => e.status === 'Live') ?? rows[0]
        localStorage.setItem(STORAGE_KEY, pick.id)
        setActiveEventIdState(pick.id)
      }
    }
  }, [])

  const refresh = useCallback(async () => {
    const id = eventIdRef.current
    if (!id) return

    const { data, error } = await supabase
      .from('incident_board')
      .select('*')
      .eq('event_id', id)
      .order('created_at', { ascending: false })

    if (error) return

    const rows = (data as BoardIncident[]) ?? []
    const previous = stampsRef.current
    const next = new Map<string, string>()
    const changed = new Set<string>()

    for (const row of rows) {
      next.set(row.id, row.updated_at)
      if (previous.size > 0 && previous.get(row.id) !== row.updated_at) {
        changed.add(row.id)
      }
    }

    stampsRef.current = next
    setIncidents(rows)
    setLastSync(new Date())
    setLoading(false)
    if (changed.size > 0) setRecentlyChanged(changed)
  }, [])

  const refreshPending = useCallback(async () => {
    setPending(await listPending())
  }, [])

  const syncNow = useCallback(async () => {
    if (!navigator.onLine) return
    const result = await flushQueue()
    await refreshPending()
    if (result.rejected.length > 0) {
      setRejected((prev) => [...prev, ...result.rejected])
    }
    if (result.synced > 0) await refresh()
  }, [refresh, refreshPending])

  const dismissRejected = useCallback(() => setRejected([]), [])

  useEffect(() => {
    if (!session) return
    void requestDurableStorage()
    void refreshPending()
    void syncNow()
  }, [session, refreshPending, syncNow])

  // Drain the queue the moment the connection comes back.
  useEffect(() => {
    if (!session) return
    const onOnline = () => void syncNow()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [session, syncNow])

  useEffect(() => {
    if (!session) return
    void refreshEvents()
  }, [session, refreshEvents])

  useEffect(() => {
    if (!session || !activeEventId) return
    setLoading(true)
    void refresh()
  }, [session, activeEventId, refresh])

  // Realtime. live_pings carries no incident content, so every role can
  // subscribe to it — including for medical incidents whose rows they are not
  // permitted to receive. A ping simply means "refetch the board".
  useEffect(() => {
    if (!session) return

    let timer: ReturnType<typeof setTimeout> | null = null
    const nudge = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void refresh(), 180)
    }

    const channel = supabase
      .channel('tide-control-room')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'live_pings' },
        (payload) => {
          const row = payload.new as { event_id?: string }
          if (!row?.event_id || row.event_id === eventIdRef.current) nudge()
        },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
        void refreshEvents()
      })
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED')
      })

    return () => {
      if (timer) clearTimeout(timer)
      void supabase.removeChannel(channel)
      setConnected(false)
    }
  }, [session, refresh, refreshEvents])

  // Fallback poll, so the board still moves if the socket drops.
  useEffect(() => {
    if (!session) return
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void refresh()
      void syncNow()
    }, 30_000)
    return () => clearInterval(id)
  }, [session, refresh, syncNow])

  useEffect(() => {
    if (recentlyChanged.size === 0) return
    const id = setTimeout(() => setRecentlyChanged(new Set()), 2200)
    return () => clearTimeout(id)
  }, [recentlyChanged])

  const activeEvent = useMemo(
    () => events.find((e) => e.id === activeEventId) ?? null,
    [events, activeEventId],
  )

  const value = useMemo(
    () => ({
      events,
      activeEvent,
      activeEventId,
      setActiveEventId,
      incidents,
      recentlyChanged,
      connected,
      lastSync,
      loading,
      refresh,
      refreshEvents,
      pending,
      rejected,
      dismissRejected,
      syncNow,
      refreshPending,
    }),
    [
      events,
      activeEvent,
      activeEventId,
      setActiveEventId,
      incidents,
      recentlyChanged,
      connected,
      lastSync,
      loading,
      refresh,
      refreshEvents,
      pending,
      rejected,
      dismissRejected,
      syncNow,
      refreshPending,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLive(): LiveValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useLive must be used inside LiveProvider')
  return v
}
