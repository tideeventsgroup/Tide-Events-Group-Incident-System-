import type { Severity, Status } from './types'

/**
 * Escalation scale. Neutral grey through to crimson, kept deliberately clear of
 * the brand teal so that teal only ever means "header, action, or active state".
 */
export const SEVERITY_COLOUR: Record<Severity, string> = {
  Minor: '#6B7280',
  Moderate: '#8C5A66',
  Major: '#A31B32',
  Critical: '#C41E3A',
}

/** Faint tint of the same hue, for row and zone-tile backgrounds. */
export const SEVERITY_TINT: Record<Severity, string> = {
  Minor: '#F4F5F6',
  Moderate: '#FAF3F4',
  Major: '#FBF0F2',
  Critical: '#FDEEF0',
}

export const STATUS_COLOUR: Record<Status, string> = {
  Open: '#C41E3A',
  Monitoring: '#4A7C8C',
  Escalated: '#A31B32',
  Resolved: '#3D8361',
}

export const SEVERITY_RANK: Record<Severity, number> = {
  Minor: 1,
  Moderate: 2,
  Major: 3,
  Critical: 4,
}

export const OPEN_STATUSES: Status[] = ['Open', 'Monitoring', 'Escalated']

export function isLive(status: Status): boolean {
  return status !== 'Resolved'
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
