// Small, accessible UI primitives shared by every tool page.
import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Slider as RSlider, Switch as RSwitch, ToggleGroup } from 'radix-ui';
import { CircleCheck, CircleX, Info, LoaderCircle, TriangleAlert } from 'lucide-react';

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover shadow-sm',
  secondary: 'bg-surface text-text border border-border hover:bg-surface-2',
  ghost: 'text-text hover:bg-surface-2',
  danger: 'bg-surface text-danger border border-border hover:bg-danger-soft',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'lg' | 'sm';
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'lg' ? 'px-6 text-base' : size === 'sm' ? 'min-h-9 px-3 text-sm' : 'px-4 text-sm',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function Card({ children, className, as: Tag = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' } & Record<string, unknown>) {
  return (
    <Tag className={cx('rounded-xl border border-border bg-surface p-4 sm:p-5', className)} {...rest}>
      {children}
    </Tag>
  );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger'; className?: string }) {
  const tones = {
    neutral: 'bg-surface-2 text-muted',
    accent: 'bg-accent-soft text-accent',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>;
}

export function Field({ label, hint, htmlFor, children, className }: { label: ReactNode; hint?: ReactNode; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

const inputClass =
  'min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text disabled:opacity-50 aria-[invalid=true]:border-danger';

export function Select<T extends string>({
  id,
  label,
  value,
  onChange,
  options,
  hint,
  disabled,
}: {
  id?: string;
  label: ReactNode;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; disabled?: boolean }[];
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <Field label={label} hint={hint} htmlFor={selectId}>
      <select id={selectId} className={inputClass} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  hint,
  disabled,
  invalid,
}: {
  label: ReactNode;
  value: number | '';
  onChange: (value: number | '') => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  hint?: ReactNode;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          className={cx(inputClass, suffix && 'pr-12')}
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">{suffix}</span>}
      </div>
    </Field>
  );
}

export function TextInput({ label, value, onChange, hint, placeholder, invalid }: { label: ReactNode; value: string; onChange: (v: string) => void; hint?: ReactNode; placeholder?: string; invalid?: boolean }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <input id={id} className={inputClass} value={value} placeholder={placeholder} aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
  hint,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm">
        <span id={id} className="font-medium">
          {label}
        </span>
        <span className="tabular-nums text-muted">{format ? format(value) : value}</span>
      </div>
      <RSlider.Root
        className="relative flex h-11 w-full touch-none select-none items-center"
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(v) => onChange(v[0] ?? value)}
        aria-labelledby={id}
      >
        <RSlider.Track className="relative h-1.5 grow rounded-full bg-surface-2">
          <RSlider.Range className="absolute h-full rounded-full bg-accent" />
        </RSlider.Track>
        <RSlider.Thumb
          className="block size-5 rounded-full border-2 border-accent bg-surface shadow focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-labelledby={id}
          aria-valuetext={format ? format(value) : undefined}
        />
      </RSlider.Root>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Switch({ label, checked, onChange, hint, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <RSwitch.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        className="relative mt-0.5 inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-border bg-surface-2 transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent disabled:opacity-50"
      >
        <RSwitch.Thumb className="block size-5 translate-x-1 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-6" />
      </RSwitch.Root>
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode; title?: string; disabled?: boolean }[];
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="text-sm font-medium">
        {label}
      </span>
      <ToggleGroup.Root
        type="single"
        value={value}
        onValueChange={(v) => v && onChange(v as T)}
        aria-labelledby={id}
        className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface-2 p-1"
      >
        {options.map((o) => (
          <ToggleGroup.Item
            key={o.value}
            value={o.value}
            title={o.title}
            disabled={o.disabled}
            className="min-h-10 flex-1 rounded-md px-3 text-sm font-medium text-muted transition-colors hover:text-text disabled:opacity-40 data-[state=on]:bg-surface data-[state=on]:text-text data-[state=on]:shadow-sm"
          >
            {o.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

const ALERT_TONES = {
  info: { cls: 'border-accent/30 bg-accent-soft', icon: Info, iconCls: 'text-accent' },
  success: { cls: 'border-success/30 bg-success-soft', icon: CircleCheck, iconCls: 'text-success' },
  warning: { cls: 'border-warning/30 bg-warning-soft', icon: TriangleAlert, iconCls: 'text-warning' },
  danger: { cls: 'border-danger/30 bg-danger-soft', icon: CircleX, iconCls: 'text-danger' },
};

export function Alert({ tone = 'info', title, children, action, role }: { tone?: keyof typeof ALERT_TONES; title?: ReactNode; children?: ReactNode; action?: ReactNode; role?: 'alert' | 'status' }) {
  const t = ALERT_TONES[tone];
  const Icon = t.icon;
  return (
    <div role={role} className={cx('flex gap-3 rounded-lg border p-3 text-sm', t.cls)}>
      <Icon className={cx('mt-0.5 size-5 shrink-0', t.iconCls)} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-text/90">{children}</div>}
        {action && <div className="mt-1 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}
