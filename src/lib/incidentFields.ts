import type { Category } from './types'

/**
 * Type-specific fields and response plans.
 *
 * Every incident used to be one free-text description whatever its category,
 * which makes a record that reads fine and counts for nothing. The commercial
 * products configure the form to the type — 24/7 Software by "incident type,
 * process or department", Halo with a purpose-built Ejection / Refusal form
 * carrying steward ID, police involvement and a body-worn video reference.
 *
 * The shape lives here rather than in the database so it can be changed
 * without a migration; Postgres holds the answers as jsonb, audits every
 * change to them, and masks the whole object on a medical incident for roles
 * without clearance. `key` is therefore permanent: renaming one orphans the
 * answers already recorded against it.
 */

export type FieldKind = 'text' | 'longtext' | 'number' | 'select' | 'bool' | 'time'

export interface FieldSpec {
  key: string
  label: string
  kind: FieldKind
  options?: readonly string[]
  hint?: string
  /** Shown on the board summary and in exports, not just the record. */
  summary?: boolean
}

const YES_NO_UNKNOWN = ['Yes', 'No', 'Unknown'] as const

/**
 * A casualty's presenting complaint and treatment are health data. They live
 * under Medical, which is the category the database masks.
 */
const MEDICAL: FieldSpec[] = [
  { key: 'casualty_name', label: 'Casualty name', kind: 'text' },
  { key: 'casualty_age', label: 'Age (or estimate)', kind: 'text' },
  { key: 'presenting', label: 'Presenting complaint', kind: 'longtext', summary: true },
  { key: 'treatment', label: 'Treatment given', kind: 'longtext' },
  { key: 'clinician', label: 'Treating clinician / callsign', kind: 'text' },
  {
    key: 'ambulance_called',
    label: 'Ambulance requested',
    kind: 'select',
    options: YES_NO_UNKNOWN,
  },
  { key: 'ambulance_ref', label: 'SAS / ambulance reference', kind: 'text' },
  { key: 'hospital', label: 'Receiving hospital', kind: 'text' },
  {
    key: 'prf',
    label: 'Patient report form number',
    kind: 'text',
    hint: 'The clinical record stays with the medical provider; this is the pointer to it.',
  },
]

/**
 * Ejections and refusals are the security record a licensing review reads
 * first. Body-worn video and the steward's badge number are what make it
 * stand up, and both are routinely missed if the form does not ask.
 */
const SECURITY: FieldSpec[] = [
  {
    key: 'action',
    label: 'Action taken',
    kind: 'select',
    options: ['Advice given', 'Warning', 'Refusal of entry', 'Ejection', 'Detained', 'None'],
    summary: true,
  },
  { key: 'reason', label: 'Reason', kind: 'longtext' },
  { key: 'subject_desc', label: 'Subject description', kind: 'longtext' },
  { key: 'steward_id', label: 'Steward / SIA badge number', kind: 'text' },
  {
    key: 'police_involved',
    label: 'Police involved',
    kind: 'select',
    options: YES_NO_UNKNOWN,
    summary: true,
  },
  { key: 'police_ref', label: 'Police incident reference', kind: 'text' },
  {
    key: 'bwv',
    label: 'Body-worn video reference',
    kind: 'text',
    hint: 'Record it now — footage is routinely overwritten before anyone asks for it.',
  },
  { key: 'cctv_ref', label: 'CCTV camera / timestamp', kind: 'text' },
]

/**
 * A lost child is the highest-anxiety incident at a family event and has its
 * own procedure and its own clock. Reunification time is the number the
 * debrief and any safeguarding review will ask for.
 */
const MISSING: FieldSpec[] = [
  {
    key: 'missing_type',
    label: 'Who is missing',
    kind: 'select',
    options: ['Child', 'Vulnerable adult', 'Adult'],
    summary: true,
  },
  { key: 'person_name', label: 'Name', kind: 'text' },
  { key: 'person_age', label: 'Age', kind: 'text' },
  { key: 'description', label: 'Description and clothing', kind: 'longtext', summary: true },
  { key: 'last_seen', label: 'Last seen — where and when', kind: 'longtext' },
  { key: 'reported_by_rel', label: 'Reported by (relationship)', kind: 'text' },
  { key: 'contact', label: 'Contact number', kind: 'text' },
  { key: 'reunited_at', label: 'Time reunited', kind: 'time', summary: true },
  { key: 'reunited_with', label: 'Reunited with / handed to', kind: 'text' },
  {
    key: 'police_notified',
    label: 'Police notified',
    kind: 'select',
    options: YES_NO_UNKNOWN,
    summary: true,
  },
]

const CROWD: FieldSpec[] = [
  {
    key: 'crowd_issue',
    label: 'Issue',
    kind: 'select',
    options: [
      'Queue build-up',
      'Crush / density',
      'Surge',
      'Barrier failure',
      'Pitch/stage incursion',
      'Disorder',
      'Other',
    ],
    summary: true,
  },
  { key: 'est_numbers', label: 'Estimated numbers involved', kind: 'text', summary: true },
  { key: 'density', label: 'Observed density / flow', kind: 'text' },
  { key: 'measures', label: 'Crowd measures applied', kind: 'longtext' },
  { key: 'ingress_held', label: 'Ingress held', kind: 'select', options: YES_NO_UNKNOWN },
]

const WEATHER: FieldSpec[] = [
  { key: 'wind_mean', label: 'Mean wind speed (mph)', kind: 'number', summary: true },
  { key: 'wind_gust', label: 'Gust (mph)', kind: 'number', summary: true },
  { key: 'rainfall', label: 'Rain / conditions', kind: 'text' },
  { key: 'reading_from', label: 'Reading taken from', kind: 'text' },
  {
    key: 'threshold',
    label: 'Threshold reached',
    kind: 'select',
    options: ['None', 'Monitor', 'Action', 'Stop use', 'Evacuate'],
    summary: true,
  },
  { key: 'structures', label: 'Structures affected', kind: 'longtext' },
]

const FIRE: FieldSpec[] = [
  {
    key: 'fire_type',
    label: 'Type',
    kind: 'select',
    options: ['Alarm activation', 'Smoke', 'Fire', 'LPG / fuel', 'Electrical', 'False alarm'],
    summary: true,
  },
  { key: 'extinguished_by', label: 'Extinguished / made safe by', kind: 'text' },
  {
    key: 'sfrs_called',
    label: 'Scottish Fire & Rescue called',
    kind: 'select',
    options: YES_NO_UNKNOWN,
    summary: true,
  },
  { key: 'sfrs_ref', label: 'SFRS incident reference', kind: 'text' },
  { key: 'equipment_used', label: 'Equipment used', kind: 'text' },
]

const STRUCTURAL: FieldSpec[] = [
  { key: 'structure', label: 'Structure / equipment', kind: 'text', summary: true },
  { key: 'contractor', label: 'Responsible contractor', kind: 'text' },
  {
    key: 'made_safe',
    label: 'Made safe',
    kind: 'select',
    options: ['Yes', 'No — cordoned', 'No — in progress'],
    summary: true,
  },
  { key: 'engineer', label: 'Engineer / competent person attending', kind: 'text' },
  { key: 'out_of_use', label: 'Taken out of use', kind: 'select', options: YES_NO_UNKNOWN },
]

const WELFARE: FieldSpec[] = [
  {
    key: 'welfare_issue',
    label: 'Issue',
    kind: 'select',
    options: [
      'Intoxication',
      'Drugs',
      'Distress',
      'Vulnerability',
      'Sexual harassment',
      'Lost property',
      'Other',
    ],
    summary: true,
  },
  { key: 'support', label: 'Support provided', kind: 'longtext' },
  { key: 'referred_to', label: 'Referred to', kind: 'text' },
]

/**
 * Suspicious items and behaviour, in the ACT / HOT language the police and
 * Martyn's Law guidance use.
 */
const CT: FieldSpec[] = [
  {
    key: 'ct_type',
    label: 'Type',
    kind: 'select',
    options: [
      'Unattended item',
      'Suspicious behaviour',
      'Suspicious vehicle',
      'Threat received',
      'Hostile reconnaissance',
    ],
    summary: true,
  },
  {
    key: 'hot_hidden',
    label: 'HOT — Hidden?',
    kind: 'select',
    options: YES_NO_UNKNOWN,
    hint: 'Hidden, Obviously suspicious, Typical — the assessment the police expect you to have made.',
  },
  { key: 'hot_obvious', label: 'HOT — Obviously suspicious?', kind: 'select', options: YES_NO_UNKNOWN },
  { key: 'hot_typical', label: 'HOT — Typical of the location?', kind: 'select', options: YES_NO_UNKNOWN },
  { key: 'cordon', label: 'Cordon distance set', kind: 'text', summary: true },
  {
    key: 'police_notified',
    label: 'Police notified',
    kind: 'select',
    options: YES_NO_UNKNOWN,
    summary: true,
  },
  { key: 'police_ref', label: 'Police incident reference', kind: 'text' },
]

export const INCIDENT_FIELDS: Partial<Record<Category, FieldSpec[]>> = {
  Medical: MEDICAL,
  Security: SECURITY,
  'Missing Person': MISSING,
  Crowd: CROWD,
  Weather: WEATHER,
  Fire: FIRE,
  Structural: STRUCTURAL,
  Welfare: WELFARE,
  'CT-Suspicious': CT,
}

export function fieldsFor(category: Category): FieldSpec[] {
  return INCIDENT_FIELDS[category] ?? []
}

/* ------------------------------------------------------- response plans */

/**
 * The steps a control room is expected to have worked, per incident type —
 * WeTrack's "automated response plans", and the reason a checklist exists at
 * all: at 3am nobody remembers the fifth item. Ticking one is append-only and
 * writes to the incident timeline, so the plan is evidence rather than a
 * to-do list.
 */
export const RESPONSE_PLANS: Partial<Record<Category, string[]>> = {
  Medical: [
    'Medical resource dispatched',
    'Casualty location confirmed and access route clear',
    'Privacy screening in place',
    'Ambulance requested if required',
    'Next of kin considered',
    'Disposal recorded',
    'RIDDOR check — conveyed from scene to hospital?',
  ],
  Security: [
    'Security resource dispatched',
    'Subject contained or removed',
    'Body-worn video secured',
    'CCTV timestamp noted and retention requested',
    'Police notified if required',
    'Steward statement taken',
  ],
  'Missing Person': [
    'Description broadcast to all callsigns',
    'Exits and gates alerted',
    'Reunification point staffed',
    'Search of last-seen area started',
    'Police notified',
    'Reunited and identity of collector verified',
    'Safeguarding referral considered',
  ],
  Crowd: [
    'Zone assessment by supervisor on scene',
    'Ingress held or diverted if required',
    'Public address message considered',
    'Additional stewards deployed',
    'Density reassessed after measures',
  ],
  Weather: [
    'Reading recorded with source',
    'Structures inspected against wind action levels',
    'Contractor / competent person consulted',
    'Show stop or evacuation considered',
    'Decision and rationale logged',
  ],
  Fire: [
    'Area evacuated or cordoned',
    'Fire alarm panel checked',
    'Extinguished or made safe',
    'Scottish Fire & Rescue called if required',
    'Cause established and area handed back',
  ],
  Structural: [
    'Area cordoned and taken out of use',
    'Competent person / engineer requested',
    'Contractor notified',
    'Written sign-off before return to use',
  ],
  'CT-Suspicious': [
    'HOT assessment completed',
    'Cordon set at appropriate distance',
    'Police notified',
    'Do not use radio near the item',
    'Witnesses identified and held',
    'Evacuation or invacuation considered',
  ],
  Welfare: [
    'Welfare resource dispatched',
    'Safe space offered',
    'Vulnerability assessed',
    'Handover to appropriate service or responsible adult',
  ],
}

export function planFor(category: Category): string[] {
  return RESPONSE_PLANS[category] ?? []
}
