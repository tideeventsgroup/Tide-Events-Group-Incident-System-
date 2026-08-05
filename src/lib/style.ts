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

/**
 * The same escalation scale, lifted for the dark command console. The hues are
 * unchanged — cool grey through to crimson — but luminance is raised so each
 * step clears contrast against a near-black panel. Still no orange anywhere.
 */
export const SEVERITY_COLOUR_DARK: Record<Severity, string> = {
  Minor: '#9AA3B2',
  Moderate: '#C08A97',
  Major: '#E0455E',
  Critical: '#FF5069',
}

/** Row wash on the console. Barely there — the priority block does the work. */
export const SEVERITY_TINT_DARK: Record<Severity, string> = {
  Minor: 'rgba(154, 163, 178, 0.05)',
  Moderate: 'rgba(192, 138, 151, 0.07)',
  Major: 'rgba(224, 69, 94, 0.10)',
  Critical: 'rgba(255, 80, 105, 0.13)',
}

export const STATUS_COLOUR_DARK: Record<Status, string> = {
  Open: '#FF5069',
  Monitoring: '#63A6BC',
  Escalated: '#E0455E',
  Resolved: '#4FA97D',
}

export const SEVERITY_RANK: Record<Severity, number> = {
  Minor: 1,
  Moderate: 2,
  Major: 3,
  Critical: 4,
}

/**
 * Dispatch priority. Control rooms and the emergency services both talk in
 * P-numbers on the radio, so the board speaks the same language — P1 is the
 * one you deal with now. Inverse of the severity rank.
 */
export const PRIORITY: Record<Severity, string> = {
  Critical: 'P1',
  Major: 'P2',
  Moderate: 'P3',
  Minor: 'P4',
}

export const COMMAND_RANK: Record<string, number> = {
  'Ground Team (L1)': 1,
  'Event Control (L2)': 2,
  'FMIC (L3)': 3,
  'Police Scotland (L4)': 4,
}

/** Radio shorthand for the command tier, for the dense queue row. */
export const COMMAND_SHORT: Record<string, string> = {
  'Ground Team (L1)': 'L1 GROUND',
  'Event Control (L2)': 'L2 CONTROL',
  'FMIC (L3)': 'L3 FMIC',
  'Police Scotland (L4)': 'L4 POLICE',
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
