import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLive } from '../context/LiveContext'
import { supabase } from '../lib/supabase'
import { Banner, Button, Card, Empty, SeverityBadge, Spinner } from '../components/ui'
import { dateShort } from '../lib/format'
import { STATUS_COLOUR } from '../lib/style'
import {
  CATEGORIES,
  SEVERITIES,
  STATUSES,
  type BoardIncident,
  type TimelineEntry,
} from '../lib/types'

const PAGE_SIZE = 25

export default function History() {
  const { profile } = useAuth()
  const { events } = useLive()

  const [rows, setRows] = useState<BoardIncident[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [includeTimelines, setIncludeTimelines] = useState(true)

  const [q, setQ] = useState('')
  const [eventId, setEventId] = useState('')
  const [category, setCategory] = useState('')
  const [severity, setSeverity] = useState('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)

    let query = supabase
      .from('incident_board')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2000)

    if (eventId) query = query.eq('event_id', eventId)
    if (category) query = query.eq('category', category)
    if (severity) query = query.eq('severity', severity)
    if (status) query = query.eq('status', status)
    if (from) query = query.gte('created_at', `${from}T00:00:00Z`)
    if (to) query = query.lte('created_at', `${to}T23:59:59Z`)

    query.then(({ data }) => {
      if (!active) return
      setRows((data as BoardIncident[]) ?? [])
      setLoading(false)
      setPage(0)
    })

    return () => {
      active = false
    }
  }, [eventId, category, severity, status, from, to])

  // Free-text search runs client side across the filtered set.
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((r) =>
      [r.ref, r.location, r.category, r.description, r.reported_by, r.created_by_name, r.outcome]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term)),
    )
  }, [rows, q])

  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

  const filterSummary = useMemo(() => {
    const parts: string[] = []
    parts.push(eventId ? (events.find((e) => e.id === eventId)?.name ?? 'event') : 'All events')
    if (category) parts.push(`category ${category}`)
    if (severity) parts.push(`severity ${severity}`)
    if (status) parts.push(`status ${status}`)
    if (from || to) parts.push(`${from || 'start'} to ${to || 'today'}`)
    if (q.trim()) parts.push(`search "${q.trim()}"`)
    return parts.join(' · ')
  }, [eventId, category, severity, status, from, to, q, events])

  async function runExport(kind: 'csv' | 'pdf') {
    setExporting(kind)
    setExportError(null)
    try {
      let timelines: Record<string, TimelineEntry[]> | undefined

      if (includeTimelines && filtered.length > 0) {
        // Chunked so the ?in= filter stays within URL limits on big exports.
        const ids = filtered.map((r) => r.id)
        timelines = {}
        for (let i = 0; i < ids.length; i += 100) {
          const { data, error } = await supabase
            .from('incident_timeline')
            .select('*')
            .in('incident_id', ids.slice(i, i + 100))
            .order('at')
          if (error) throw error
          for (const entry of (data as TimelineEntry[]) ?? []) {
            ;(timelines[entry.incident_id] ??= []).push(entry)
          }
        }
      }

      const ctx = {
        incidents: filtered,
        timelines,
        filterSummary,
        generatedBy: profile?.full_name ?? 'unknown',
        generatedRole: profile?.role ?? 'unknown',
      }

      // Loaded on demand — jsPDF is far too heavy for the control room's
      // first paint, and most sessions never export.
      const { exportCsv, exportPdf } = await import('../lib/export')
      if (kind === 'csv') exportCsv(ctx)
      else exportPdf(ctx)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setExporting(null)
    }
  }

  function reset() {
    setQ('')
    setEventId('')
    setCategory('')
    setSeverity('')
    setStatus('')
    setFrom('')
    setTo('')
  }

  return (
    <div className="px-4 pt-5 pb-12 sm:px-7">
      <h1 className="mb-1 text-[24px] font-bold text-ink">Incident History &amp; Archive</h1>
      <p className="mb-5 text-[12px] text-muted">
        Searchable record across all events — evidence-grade audit trail for licensing and
        Martyn&rsquo;s Law compliance.
      </p>

      <div className="grid items-start gap-4 xl:grid-cols-[2.2fr_1fr]">
        <div>
          <div className="mb-4 rounded-[3px] border border-line bg-white px-4 py-4">
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search description, reference, reporter…"
                aria-label="Search incidents"
                className="!text-[12px] sm:col-span-2 lg:col-span-1"
              />
              <select
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                aria-label="Event"
                className="!text-[12px]"
              >
                <option value="">All Events</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                aria-label="Category"
                className="!text-[12px]"
              >
                <option value="">All Categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                aria-label="Severity"
                className="!text-[12px]"
              >
                <option value="">All Severities</option>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                aria-label="Status"
                className="!text-[12px]"
              >
                <option value="">All Status</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  aria-label="From date"
                  className="!text-[12px]"
                />
                <span className="text-[11px] text-faint">to</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  aria-label="To date"
                  className="!text-[12px]"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={reset}
              className="mt-3 text-[11px] font-bold text-teal hover:underline"
            >
              Clear all filters
            </button>
          </div>

          <Card
            padded={false}
            title={
              loading
                ? 'Searching…'
                : `${filtered.length} incident${filtered.length === 1 ? '' : 's'} found`
            }
            action={<span className="text-[11px] text-faint">Most recent first</span>}
          >
            <div className="hidden grid-cols-[86px_1.2fr_92px_100px_1.3fr_140px_90px] gap-2 border-b border-line bg-wash px-[18px] py-2.5 text-[10px] font-bold tracking-[0.5px] text-faint lg:grid">
              <div>DATE</div>
              <div>EVENT</div>
              <div>ID</div>
              <div>SEVERITY</div>
              <div>ZONE / CATEGORY</div>
              <div>COMMAND</div>
              <div>STATUS</div>
            </div>

            {loading ? (
              <Spinner label="Searching the archive" />
            ) : pageRows.length === 0 ? (
              <Empty>No incidents match these filters.</Empty>
            ) : (
              pageRows.map((r) => (
                <Link
                  key={r.id}
                  to={`/incident/${r.id}`}
                  className="block border-b border-line-soft no-underline last:border-b-0 hover:bg-wash"
                >
                  <div className="hidden grid-cols-[86px_1.2fr_92px_100px_1.3fr_140px_90px] items-center gap-2 px-[18px] py-3 lg:grid">
                    <div className="text-[12px] text-ink">{dateShort(r.created_at)}</div>
                    <div className="truncate text-[12px] text-ink">{r.event_name}</div>
                    <div className="text-[12px] font-bold text-ink">{r.ref}</div>
                    <div>
                      <SeverityBadge severity={r.severity} small />
                    </div>
                    <div className="truncate text-[12px] text-ink">
                      {r.location} · {r.category}
                      {r.restricted && ' 🔒'}
                    </div>
                    <div className="truncate text-[11px] text-ink">{r.command_level}</div>
                    <div
                      className="text-[11px] font-bold"
                      style={{ color: STATUS_COLOUR[r.status] }}
                    >
                      {r.status}
                    </div>
                  </div>

                  <div className="px-4 py-3 lg:hidden">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="text-[12px] font-bold text-ink">{r.ref}</span>
                      <SeverityBadge severity={r.severity} small />
                      <span
                        className="text-[11px] font-bold"
                        style={{ color: STATUS_COLOUR[r.status] }}
                      >
                        {r.status}
                      </span>
                    </div>
                    <div className="text-[12px] text-ink">
                      {r.category} · {r.location}
                      {r.restricted && ' 🔒'}
                    </div>
                    <div className="text-[11px] text-faint">
                      {dateShort(r.created_at)} · {r.event_name}
                    </div>
                  </div>
                </Link>
              ))
            )}

            {!loading && filtered.length > 0 && (
              <div className="flex items-center justify-between gap-3 border-t border-line px-[18px] py-3 text-[11px] text-faint">
                <span>
                  Showing {page * PAGE_SIZE + 1}–
                  {Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length} · Page{' '}
                  {page + 1} of {pages}
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                    className="font-bold text-teal disabled:text-[#c8c8c8]"
                  >
                    ← Prev
                  </button>
                  <button
                    type="button"
                    disabled={page >= pages - 1}
                    onClick={() => setPage((p) => p + 1)}
                    className="font-bold text-teal disabled:text-[#c8c8c8]"
                  >
                    Next →
                  </button>
                </span>
              </div>
            )}
          </Card>
        </div>

        <Card title="Audit Export Pack">
          <p className="mb-3.5 text-[11px] leading-[1.5] text-muted">
            Generates an evidence pack for the current filtered set — suitable for SAG debrief,
            licensing review, or Martyn&rsquo;s Law audit.
          </p>

          <p className="mb-2 text-[11px] font-bold tracking-[0.5px] text-faint">PACK CONTENTS</p>
          <ul className="mb-4 space-y-1 text-[12px] leading-[1.7] text-ink">
            <li>✓ Incident log entries &amp; metadata</li>
            <li>✓ Resources deployed per incident</li>
            <li>✓ Closure &amp; sign-off records</li>
            <li>✓ Command level escalation history</li>
            <li>✓ Reporting officer &amp; role attribution</li>
            <li className={includeTimelines ? '' : 'text-[#c0c0c0] line-through'}>
              ✓ Full timestamped timelines
            </li>
          </ul>

          <label className="mb-4 flex items-center gap-2 text-[12px] text-ink">
            <input
              type="checkbox"
              checked={includeTimelines}
              onChange={(e) => setIncludeTimelines(e.target.checked)}
              className="!h-4 !w-4 !p-0"
            />
            Include full timelines
          </label>

          <p className="mb-2 text-[11px] font-bold tracking-[0.5px] text-faint">FORMAT</p>
          <div className="mb-4 flex gap-2">
            <Button
              variant="ghost"
              block
              disabled={exporting !== null || filtered.length === 0}
              onClick={() => void runExport('pdf')}
              className="!text-[12px]"
            >
              {exporting === 'pdf' ? 'Building…' : 'PDF Report'}
            </Button>
            <Button
              variant="ghost"
              block
              disabled={exporting !== null || filtered.length === 0}
              onClick={() => void runExport('csv')}
              className="!text-[12px]"
            >
              {exporting === 'csv' ? 'Building…' : 'CSV Data'}
            </Button>
          </div>

          {exportError && (
            <div className="mb-3">
              <Banner tone="error">{exportError}</Banner>
            </div>
          )}

          <p className="text-center text-[10px] leading-[1.5] text-[#9a9a9a]">
            {filtered.length} incidents ·{' '}
            {new Set(filtered.map((r) => r.event_id)).size} event(s) · generated with audit
            timestamp
          </p>
          <p className="mt-3 border-t border-line-soft pt-3 text-[10px] leading-[1.5] text-faint">
            🔒 Medical detail you are not cleared to see is exported as
            &ldquo;RESTRICTED&rdquo; rather than omitted, so record counts stay accurate.
          </p>
        </Card>
      </div>
    </div>
  )
}
