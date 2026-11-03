/** Small form controls used by the event wizard. */
import type { ComponentProps, ReactNode } from 'react'
import { Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

/** Number input that keeps "empty" as NaN so validation can say what is missing. */
export function NumberInput({
  id,
  value,
  onChange,
  min,
  max,
  step,
  prefix,
  suffix,
  invalid,
  className,
  placeholder,
  disabled,
}: {
  id: string
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  step?: number
  prefix?: string
  suffix?: string
  invalid?: boolean
  className?: string
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <div className={cn('flex h-10 min-w-0 items-stretch overflow-hidden rounded-lg border border-input bg-card pointer-coarse:h-auto focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50', invalid && 'border-destructive ring-3 ring-destructive/15', disabled && 'opacity-60', className)}>
      {prefix && <span className="flex items-center border-r bg-muted px-2.5 text-sm text-muted-foreground">{prefix}</span>}
      <input
        id={id}
        type="number"
        inputMode="numeric"
        className="w-full min-w-0 bg-transparent px-2.5 text-sm tabular-nums outline-none disabled:cursor-not-allowed pointer-coarse:min-h-11"
        value={Number.isFinite(value) ? String(value) : ''}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))}
      />
      {suffix && <span className="flex items-center border-l bg-muted px-2.5 text-xs whitespace-nowrap text-muted-foreground">{suffix}</span>}
    </div>
  )
}

export function TextInput({ id, invalid, className, ...props }: ComponentProps<typeof Input> & { id: string; invalid?: boolean }) {
  return <Input id={id} className={cn('h-10 bg-card', className)} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined} {...props} />
}

export function ToggleRow({ id, checked, onChange, title, description, disabled }: { id: string; checked: boolean; onChange: (v: boolean) => void; title: ReactNode; description?: ReactNode; disabled?: boolean }) {
  return (
    <div className={cn('flex items-start gap-3 rounded-lg border bg-card p-3', disabled && 'opacity-60')}>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} className="mt-0.5" />
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-sm font-semibold">{title}</span>
        {description && <span className="block text-xs text-muted-foreground">{description}</span>}
      </label>
    </div>
  )
}

export function ChoiceCards<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  disabled,
}: {
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; title: ReactNode; description?: ReactNode; icon?: ReactNode }>
  label: string
  className?: string
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('grid gap-2', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative flex min-h-12 items-start gap-3 rounded-lg border bg-card p-3 text-left text-sm transition focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60',
              active ? 'border-brand bg-brand-soft/50 ring-1 ring-brand' : 'hover:border-foreground/30',
            )}
          >
            {o.icon && <span className={cn('mt-0.5 [&_svg]:size-4', active ? 'text-brand' : 'text-muted-foreground')}>{o.icon}</span>}
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{o.title}</span>
              {o.description && <span className="block text-xs text-muted-foreground">{o.description}</span>}
            </span>
            {active && <Check className="size-4 shrink-0 text-brand" aria-hidden />}
          </button>
        )
      })}
    </div>
  )
}
