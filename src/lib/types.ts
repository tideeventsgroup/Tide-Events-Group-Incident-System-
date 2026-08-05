export const CATEGORIES = [
  'Medical',
  'Security',
  'Crowd',
  'Weather',
  'Fire',
  'Welfare',
  'Structural',
  'CT-Suspicious',
  'Other',
] as const

export const SEVERITIES = ['Minor', 'Moderate', 'Major', 'Critical'] as const

export const STATUSES = ['Open', 'Monitoring', 'Escalated', 'Resolved'] as const

export const COMMAND_LEVELS = [
  'Ground Team (L1)',
  'Event Control (L2)',
  'FMIC (L3)',
  'Police Scotland (L4)',
] as const

export const ROLES = [
  'Incident Commander',
  'Security Supervisor',
  'Medical Lead',
  'Client',
] as const

export const EVENT_STATUSES = ['Standby', 'Live', 'Closed'] as const

export type Category = (typeof CATEGORIES)[number]
export type Severity = (typeof SEVERITIES)[number]
export type Status = (typeof STATUSES)[number]
export type CommandLevel = (typeof COMMAND_LEVELS)[number]
export type Role = (typeof ROLES)[number]
export type EventStatus = (typeof EVENT_STATUSES)[number]

export interface Profile {
  id: string
  full_name: string
  role: Role
  callsign: string | null
  email: string | null
  created_at: string
}

export interface EventRecord {
  id: string
  name: string
  client: string
  venue: string | null
  start_date: string
  end_date: string | null
  status: EventStatus
  zones: string[]
  expected_attendance: string | null
  active_day: number
  retention_months: number
  retention_notes: string | null
  locked: boolean
  incident_seq: number
  created_at: string
  created_by: string | null
}

/** A row of `public.incident_board` — free text is masked server-side when
 *  the viewer is not permitted to see medical detail. */
export interface BoardIncident {
  id: string
  event_id: string
  ref: string
  seq: number
  created_at: string
  updated_at: string
  created_by: string | null
  category: Category
  severity: Severity
  location: string
  command_level: CommandLevel
  status: Status
  follow_up_required: boolean
  closed_at: string | null
  /** Most recent timeline entry, or creation. Drives the review-due flag. */
  last_update_at: string
  /** Raised while the control room had no connection, and synced later. */
  logged_offline: boolean
  synced_at: string | null
  restricted: boolean
  description: string | null
  reported_by: string | null
  resources_deployed: string | null
  outcome: string | null
  created_by_name: string | null
  created_by_role: Role | null
  closed_by_name: string | null
  event_name: string
  event_client: string
  event_locked: boolean
}

export type EntryType =
  | 'report'
  | 'update'
  | 'status'
  | 'command'
  | 'severity'
  | 'resources'
  | 'closure'
  | 'system'

export interface TimelineEntry {
  id: string
  incident_id: string
  event_id: string
  at: string
  author_id: string | null
  author_name: string
  author_role: Role | null
  entry_type: EntryType
  body: string
}

export const METHANE_REPORT_TYPES = ['declaration', 'update', 'stand_down'] as const
export type MethaneReportType = (typeof METHANE_REPORT_TYPES)[number]

/** A M/ETHANE report, per JESIP. Append-only — each one is a snapshot. */
export interface MethaneReport {
  id: string
  event_id: string
  incident_id: string | null
  seq: number
  at: string
  author_id: string | null
  author_name: string
  author_role: Role | null
  report_type: MethaneReportType
  major_incident: boolean
  exact_location: string
  incident_type: string
  hazards: string | null
  access: string | null
  casualties: string | null
  emergency_services: string | null
  notes: string | null
}

export const LOG_ENTRY_TYPES = [
  'radio',
  'note',
  'handover',
  'staffing',
  'weather',
  'check',
  'visitor',
] as const
export type LogEntryType = (typeof LOG_ENTRY_TYPES)[number]

/** The radio loggist's running log — control room traffic that is not an incident. */
export interface EventLogEntry {
  id: string
  event_id: string
  incident_id: string | null
  at: string
  author_id: string | null
  author_name: string
  author_role: Role | null
  entry_type: LogEntryType
  body: string
}

/**
 * How long an open incident may sit untouched before the board asks for a
 * review. Control rooms lose incidents to silence, not to disagreement.
 */
export const REVIEW_DUE_MINUTES: Record<Severity, number> = {
  Critical: 15,
  Major: 30,
  Moderate: 60,
  Minor: 120,
}

/**
 * Minutes since the last timeline entry, if that now exceeds the threshold.
 * The clock is injectable so a component driving a ticking board can pass the
 * same instant to every row, and so memoised work can depend on it honestly.
 */
export function reviewOverdueBy(
  incident: {
    severity: Severity
    status: Status
    last_update_at: string
  },
  now: number = Date.now(),
): number | null {
  if (incident.status === 'Resolved') return null
  const mins = Math.floor((now - new Date(incident.last_update_at).getTime()) / 60_000)
  return mins >= REVIEW_DUE_MINUTES[incident.severity] ? mins : null
}

export interface AuditEntry {
  id: number
  at: string
  actor_id: string | null
  actor_name: string | null
  actor_role: string | null
  entity: string
  entity_id: string | null
  event_id: string | null
  action: string
  changes: Record<string, unknown> | null
}

/** Roles permitted to create and amend incident records. */
export function canWrite(role: Role | undefined): boolean {
  return (
    role === 'Incident Commander' || role === 'Security Supervisor' || role === 'Medical Lead'
  )
}

/**
 * Medical free text is health data, so it is restricted (GDPR). The Incident
 * Commander owns the incident and the Medical Lead runs the clinical response;
 * the Client is the organiser, granted sight of their own event by agreement.
 */
export function canSeeMedical(role: Role | undefined): boolean {
  return role === 'Incident Commander' || role === 'Medical Lead' || role === 'Client'
}

/** Closing and signing off an incident, and setting command level. */
export function canSignOff(role: Role | undefined): boolean {
  return role === 'Incident Commander' || role === 'Medical Lead'
}

/** Event configuration, team and retention. */
export function canManageEvent(role: Role | undefined): boolean {
  return role === 'Incident Commander'
}

/** The audit log and website enquiries. */
export function canSeeAudit(role: Role | undefined): boolean {
  return role === 'Incident Commander'
}
