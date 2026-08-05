export const CATEGORIES = [
  'Medical',
  'Security',
  'Crowd',
  'Weather',
  'Fire',
  'Welfare',
  'Missing Person',
  'Structural',
  'CT-Suspicious',
  'Other',
] as const

/**
 * How a casualty left the incident. This is the RIDDOR trigger: a member of
 * the public taken directly from the scene to hospital for treatment is
 * reportable to HSE regardless of how trivial the injury proves, and the duty
 * falls on the person in control of the premises.
 */
export const DISPOSALS = [
  'Not applicable',
  'Treated on site',
  'Discharged',
  'Referred to GP',
  'Refused treatment',
  'Conveyed to hospital',
  'Own transport to hospital',
] as const

export const SITE_STATES = [
  'Normal',
  'Show stop',
  'Evacuation',
  'Invacuation',
  'Lockdown',
] as const

export const TASK_STATUSES = ['Open', 'In progress', 'Blocked', 'Done'] as const
export const TASK_PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'] as const
export const PROPERTY_STATES = ['Held', 'Claimed', 'Handed to police', 'Disposed'] as const

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
export type Disposal = (typeof DISPOSALS)[number]
export type SiteState = (typeof SITE_STATES)[number]
export type TaskStatus = (typeof TASK_STATUSES)[number]
export type TaskPriority = (typeof TASK_PRIORITIES)[number]
export type PropertyState = (typeof PROPERTY_STATES)[number]
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
  site_state: SiteState
  site_state_at: string | null
  capacity: number | null
  site_plan_path: string | null
  is_exercise: boolean
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
  /** Response milestones. Set once, then frozen — they are the response times. */
  acknowledged_at: string | null
  on_scene_at: string | null
  /** Dispatch state, rolled up from the units committed to this incident. */
  assigned_count: number
  assigned_units: string | null
  response_state: ResourceState | null
  restricted: boolean
  description: string | null
  reported_by: string | null
  resources_deployed: string | null
  outcome: string | null
  created_by_name: string | null
  created_by_role: Role | null
  closed_by_name: string | null
  /** Type-specific answers. Masked to `{}` when the medical restriction bites. */
  details: Record<string, string>
  disposal: Disposal
  safeguarding_referral: boolean
  riddor_reportable: boolean
  riddor_reference: string | null
  riddor_reported_at: string | null
  risk_id: string | null
  /** Pin position on the site plan, as a fraction of the image. */
  map_x: number | null
  map_y: number | null
  event_name: string
  event_client: string
  event_locked: boolean
  event_site_state: SiteState
  event_is_exercise: boolean
}

export interface SiteStateEntry {
  id: string
  event_id: string
  at: string
  state: SiteState
  previous_state: SiteState | null
  declared_by: string | null
  declared_by_name: string
  declared_by_role: Role | null
  reason: string | null
}

export interface OccupancyCount {
  id: string
  event_id: string
  at: string
  zone: string | null
  count_in: number
  count_out: number
  recorded_by: string | null
  recorded_by_name: string
  note: string | null
}

export interface TaskRecord {
  id: string
  event_id: string
  incident_id: string | null
  title: string
  detail: string | null
  status: TaskStatus
  priority: TaskPriority
  owner_id: string | null
  owner_label: string | null
  due_at: string | null
  done_at: string | null
  created_at: string
  created_by: string | null
  created_by_name: string
}

export interface ChecklistTick {
  id: string
  incident_id: string
  event_id: string
  step_key: string
  at: string
  by_id: string | null
  by_name: string
}

export interface Attachment {
  id: string
  event_id: string
  incident_id: string | null
  path: string
  filename: string
  mime_type: string
  bytes: number
  caption: string | null
  at: string
  by_id: string | null
  by_name: string
}

export interface RiskRecord {
  id: string
  event_id: string
  title: string
  category: Category
  likelihood: number
  impact: number
  mitigation: string | null
  owner_label: string | null
  active: boolean
  created_at: string
  created_by: string | null
  created_by_name: string
}

export interface PropertyRecord {
  id: string
  event_id: string
  ref: string | null
  description: string
  found_at: string
  found_location: string | null
  state: PropertyState
  holder: string | null
  claimed_at: string | null
  claimed_by_name: string | null
  claimed_contact: string | null
  notes: string | null
  created_at: string
  created_by: string | null
  created_by_name: string
}

export interface PublicReport {
  id: string
  event_id: string
  at: string
  what: string
  where_text: string | null
  contact: string | null
  triaged_at: string | null
  triaged_by: string | null
  incident_id: string | null
  dismissed: boolean
}

/**
 * Disposals that should put the RIDDOR question in front of somebody.
 *
 * The duty turns on the person being taken *directly from the scene to
 * hospital for treatment*. "Conveyed" is squarely that. "Own transport" is the
 * judgement call — it can still be a direct trip from the scene — so the board
 * raises the question rather than deciding it, and the operator ticks the flag
 * or does not. Prompting on a maybe is cheap; missing one is not.
 */
export function riddorTriggered(disposal: Disposal): boolean {
  return disposal === 'Conveyed to hospital' || disposal === 'Own transport to hospital'
}

/** Whether the prompt is a certainty or a judgement call. */
export function riddorCertain(disposal: Disposal): boolean {
  return disposal === 'Conveyed to hospital'
}

/** Risk score, 1–25. The register is sorted on it. */
export function riskScore(r: { likelihood: number; impact: number }): number {
  return r.likelihood * r.impact
}

export function riskBand(score: number): 'Low' | 'Medium' | 'High' | 'Extreme' {
  if (score >= 20) return 'Extreme'
  if (score >= 12) return 'High'
  if (score >= 6) return 'Medium'
  return 'Low'
}

export const RESOURCE_KINDS = [
  'Medical',
  'Security',
  'Steward',
  'Traffic',
  'Welfare',
  'Command',
  'Contractor',
  'Other',
] as const

/**
 * The unit lifecycle, in event control's language. `Assigned` is dispatch's
 * "dispatched"; `Clearing` is a unit finishing up but not yet free. Ordered
 * as a unit moves through it, so the array index is the progression.
 */
export const RESOURCE_STATES = [
  'Available',
  'Assigned',
  'En route',
  'On scene',
  'Clearing',
  'Off duty',
] as const

export type ResourceKind = (typeof RESOURCE_KINDS)[number]
export type ResourceState = (typeof RESOURCE_STATES)[number]

/** States in which a unit is committed to an incident. */
export const COMMITTED_STATES: ResourceState[] = ['Assigned', 'En route', 'On scene', 'Clearing']

export function isCommitted(state: ResourceState): boolean {
  return COMMITTED_STATES.includes(state)
}

/** A deployable unit — a team, a vehicle, a contractor on site. */
export interface ResourceUnit {
  id: string
  event_id: string
  callsign: string
  name: string
  kind: ResourceKind
  state: ResourceState
  assigned_incident_id: string | null
  state_changed_at: string
  notes: string | null
  created_at: string
  created_by: string | null
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
