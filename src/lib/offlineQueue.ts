import { supabase } from './supabase'
import type { Category, CommandLevel, Severity } from './types'

/**
 * Queue of incidents raised while the control room had no connection.
 *
 * The record is append-only and the database assigns incident references, so
 * a queued incident is not a provisional record that later gets rewritten —
 * it is an insert that has not happened yet. Two consequences shape this:
 *
 *  1. The queue holds the client-generated primary key. Flushing twice hits
 *     the primary key and is rejected, so a half-completed sync can be retried
 *     without risking a duplicate incident on the board.
 *  2. References are allocated in the order the server receives incidents, not
 *     the order they happened. The record carries logged_offline and synced_at
 *     so a debrief can see the gap rather than being quietly misled by it.
 */

const DB_NAME = 'tide-ims'
const STORE = 'pending-incidents'
const DB_VERSION = 1

export interface PendingIncident {
  /** Client-generated. Becomes the incident's primary key — the idempotency key. */
  id: string
  event_id: string
  created_by: string
  created_at: string
  category: Category
  severity: Severity
  location: string
  reported_by: string
  description: string
  command_level: CommandLevel
  resources_deployed: string | null
  follow_up_required: boolean
  /** Bookkeeping, stripped before the row is sent. */
  queued_at: string
  attempts: number
  last_error?: string
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = run(t.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    t.oncomplete = () => db.close()
  })
}

export async function listPending(): Promise<PendingIncident[]> {
  const rows = await tx<PendingIncident[]>('readonly', (s) => s.getAll() as IDBRequest<PendingIncident[]>)
  return rows.sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export async function enqueue(incident: Omit<PendingIncident, 'queued_at' | 'attempts'>) {
  await tx('readwrite', (s) =>
    s.put({ ...incident, queued_at: new Date().toISOString(), attempts: 0 }),
  )
}

export async function dequeue(id: string) {
  await tx('readwrite', (s) => s.delete(id))
}

async function markAttempt(row: PendingIncident, message: string) {
  await tx('readwrite', (s) =>
    s.put({ ...row, attempts: row.attempts + 1, last_error: message }),
  )
}

/**
 * Ask the browser not to evict the queue under storage pressure. Best effort —
 * unsent safety records are worth asking for.
 */
export async function requestDurableStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist()
    }
  } catch {
    /* not supported — the queue still works, it is just evictable */
  }
}

export interface FlushResult {
  synced: number
  remaining: number
  /** Rejected outright — a locked event, or a permission the role no longer has. */
  rejected: PendingIncident[]
}

/** Postgres codes that mean "this will never succeed", so stop retrying. */
const PERMANENT = new Set([
  '23505', // unique violation — already synced, treat as done
  '23514', // check violation
  '42501', // insufficient privilege (locked event, RLS)
])

export async function flushQueue(): Promise<FlushResult> {
  const pending = await listPending()
  if (pending.length === 0) return { synced: 0, remaining: 0, rejected: [] }

  // A valid session is required for the RLS check; if the token expired while
  // offline this refreshes it before we start.
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) {
    return { synced: 0, remaining: pending.length, rejected: [] }
  }

  let synced = 0
  const rejected: PendingIncident[] = []

  // Serial, so references are allocated in the order incidents happened.
  for (const row of pending) {
    const { queued_at: _q, attempts: _a, last_error: _e, ...payload } = row

    const { error } = await supabase
      .from('incidents')
      .insert({ ...payload, logged_offline: true })

    if (!error) {
      await dequeue(row.id)
      synced += 1
      continue
    }

    const code = (error as { code?: string }).code ?? ''

    if (code === '23505') {
      // Already on the board from an earlier partial flush.
      await dequeue(row.id)
      synced += 1
      continue
    }

    if (PERMANENT.has(code)) {
      await dequeue(row.id)
      rejected.push({ ...row, last_error: error.message })
      continue
    }

    // Network or transient — leave it queued and stop, so we do not burn
    // through the whole queue against a connection that is still down.
    await markAttempt(row, error.message)
    break
  }

  const remaining = (await listPending()).length
  return { synced, remaining, rejected }
}
