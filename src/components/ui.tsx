import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { SEVERITY_COLOUR, STATUS_COLOUR } from '../lib/style'
import type { Severity, Status } from '../lib/types'

/* ------------------------------------------------------------------ badges */

export function SeverityBadge({ severity, small }: { severity: Severity; small?: boolean }) {
  const critical = severity === 'Critical'
  return (
    <span
      className={`inline-block rounded-[2px] font-bold tracking-[0.5px] text-white ${
        small ? 'px-1.5 py-[3px] text-[9px]' : 'px-2 py-1 text-[10px]'
      } ${critical ? 'tide-pulse' : ''}`}
      style={{ backgroundColor: SEVERITY_COLOUR[severity] }}
    >
      {severity.toUpperCase()}
    </span>
  )
}

export function StatusPill({ status }: { status: Status }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-bold whitespace-nowrap"
      style={{ color: STATUS_COLOUR[status] }}
    >
      <span aria-hidden="true">●</span>
      {status.toUpperCase()}
    </span>
  )
}

export function RestrictedTag({ children = 'MEDICAL — RESTRICTED' }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[2px] border border-line bg-wash px-2 py-1 text-[10px] font-bold tracking-[0.5px] text-faint">
      <span aria-hidden="true">🔒</span>
      {children}
    </span>
  )
}

/* ------------------------------------------------------------- containers */

export function Card({
  title,
  action,
  children,
  padded = true,
  className = '',
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  padded?: boolean
  className?: string
}) {
  return (
    <section className={`rounded-[3px] border border-line bg-white ${className}`}>
      {title && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3.5 sm:px-[18px]">
          <h2 className="text-[15px] font-bold text-ink">{title}</h2>
          {action}
        </header>
      )}
      <div className={padded ? 'px-4 py-4 sm:px-[18px]' : ''}>{children}</div>
    </section>
  )
}

export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-2 block text-[11px] font-bold tracking-[0.5px] text-ink"
    >
      {children}
    </label>
  )
}

/* ---------------------------------------------------------------- buttons */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'dark' | 'ghost' | 'danger'
  block?: boolean
}

export function Button({
  variant = 'primary',
  block,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-[3px] px-5 py-3 text-[14px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50'
  const variants: Record<string, string> = {
    primary: 'bg-teal text-white hover:bg-teal-dark',
    dark: 'bg-ink text-white hover:bg-black',
    ghost: 'border border-line-input bg-white text-muted hover:bg-wash',
    danger: 'border border-alert bg-transparent text-alert hover:bg-[#fdf2f4]',
  }
  return (
    <button
      className={`${base} ${variants[variant]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

/** Segmented chip grid used for category / severity / command pickers. */
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  gridClassName = 'grid-cols-2 sm:grid-cols-4',
  colourFor,
  disabledOptions,
  ariaLabel,
}: {
  options: readonly T[]
  value: T | null
  onChange: (v: T) => void
  gridClassName?: string
  colourFor?: (v: T) => string
  disabledOptions?: readonly T[]
  ariaLabel: string
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={`grid gap-2.5 ${gridClassName}`}>
      {options.map((option) => {
        const selected = value === option
        const disabled = disabledOptions?.includes(option) ?? false
        const accent = colourFor?.(option) ?? '#25BEC8'
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option)}
            className="rounded-[3px] px-2 py-3.5 text-center text-[12px] font-bold transition-colors disabled:cursor-not-allowed"
            style={
              selected
                ? {
                    border: `2px solid ${accent}`,
                    backgroundColor: '#FFF5F1',
                    color: accent,
                    padding: '13px 8px',
                  }
                : {
                    border: '1px solid #E0DAD5',
                    backgroundColor: disabled ? '#FAFAFA' : '#FFFFFF',
                    color: disabled ? '#9a9a9a' : '#333333',
                  }
            }
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}

/* ----------------------------------------------------------------- states */

export function Banner({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'error' | 'success'
  children: ReactNode
}) {
  const tones = {
    info: 'border-line bg-wash text-muted',
    error: 'border-alert bg-[#fdf2f4] text-alert',
    success: 'border-ok bg-[#f3faf6] text-ok',
  }
  return (
    <div className={`rounded-[3px] border px-3.5 py-3 text-[12px] font-bold ${tones[tone]}`}>
      {children}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-1 py-10 text-center text-[13px] text-faint">{children}</p>
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <p role="status" className="px-1 py-10 text-center text-[13px] text-faint">
      {label}…
    </p>
  )
}
