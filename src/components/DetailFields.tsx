import { FieldLabel } from './ui'
import { fieldsFor, type FieldSpec } from '../lib/incidentFields'
import type { Category } from '../lib/types'

/**
 * Renders the type-specific part of an incident form from the spec in
 * `incidentFields.ts`. Answers are held as a flat string map so they survive
 * a spec change without migration: a field that disappears leaves its answer
 * in the record rather than deleting evidence, and a field that appears is
 * simply blank on older incidents.
 */

export type Details = Record<string, string>

function Field({
  spec,
  value,
  onChange,
  disabled,
}: {
  spec: FieldSpec
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const id = `f-${spec.key}`
  const common = {
    id,
    disabled,
    value,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
  }

  return (
    <div>
      <FieldLabel htmlFor={id}>{spec.label.toUpperCase()}</FieldLabel>
      {spec.kind === 'longtext' ? (
        <textarea rows={2} {...common} />
      ) : spec.kind === 'select' ? (
        <select {...common}>
          <option value="">—</option>
          {spec.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : spec.kind === 'number' ? (
        <input type="number" inputMode="decimal" {...common} />
      ) : spec.kind === 'time' ? (
        <input type="text" placeholder="e.g. 14:35" {...common} />
      ) : (
        <input type="text" {...common} />
      )}
      {spec.hint && <p className="mt-1 text-[11px] leading-[1.45] text-faint">{spec.hint}</p>}
    </div>
  )
}

export function DetailFields({
  category,
  details,
  onChange,
  disabled,
}: {
  category: Category | null
  details: Details
  onChange: (next: Details) => void
  disabled?: boolean
}) {
  if (!category) return null
  const specs = fieldsFor(category)
  if (specs.length === 0) return null

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {specs.map((spec) => (
        <div key={spec.key} className={spec.kind === 'longtext' ? 'sm:col-span-2' : undefined}>
          <Field
            spec={spec}
            disabled={disabled}
            value={details[spec.key] ?? ''}
            onChange={(v) => onChange({ ...details, [spec.key]: v })}
          />
        </div>
      ))}
    </div>
  )
}

/** Read-only rendering, for the record and the preview. */
export function DetailSummary({
  category,
  details,
  onlySummary,
}: {
  category: Category
  details: Details
  onlySummary?: boolean
}) {
  const specs = fieldsFor(category).filter(
    (s) => (details[s.key] ?? '').trim() !== '' && (!onlySummary || s.summary),
  )
  if (specs.length === 0) return null

  return (
    <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
      {specs.map((spec) => (
        <div key={spec.key} className={spec.kind === 'longtext' ? 'sm:col-span-2' : undefined}>
          <dt className="text-[10px] font-bold tracking-[0.5px] text-faint">
            {spec.label.toUpperCase()}
          </dt>
          <dd className="text-[13px] leading-[1.5] whitespace-pre-wrap text-ink">
            {details[spec.key]}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** Strips blanks, so an untouched field never lands in the record as "". */
export function cleanDetails(details: Details): Details {
  const out: Details = {}
  for (const [k, v] of Object.entries(details)) {
    const trimmed = (v ?? '').trim()
    if (trimmed) out[k] = trimmed
  }
  return out
}
