import clsx from 'clsx';
import { animate, motion } from 'motion/react';
import {
  useLayoutEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ComponentType,
  type ReactNode,
} from 'react';
import { useSettings } from '../settings/store';

/**
 * Small, game-agnostic UI primitives for the frontend pages (Tailwind-styled).
 * Legacy pages keep their own class names; new surfaces build from these.
 */

export const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl';

type Variant = 'primary' | 'soft' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export function buttonClass(variant: Variant = 'soft', size: Size = 'md', className?: string) {
  return clsx(
    'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-40 [&_svg]:shrink-0',
    size === 'sm' && 'h-8 px-3 text-xs [&_svg]:size-3.5',
    size === 'md' && 'h-10 px-4 text-sm [&_svg]:size-4',
    size === 'lg' && 'h-12 px-6 text-[15px] [&_svg]:size-5',
    variant === 'primary' &&
      'bg-accent text-[#04121f] shadow-[0_10px_34px_-10px_var(--accent)] hover:shadow-[0_14px_44px_-8px_var(--accent)] hover:brightness-110',
    variant === 'soft' && 'bg-white/6 text-fg ring-1 ring-inset ring-white/10 hover:bg-white/11',
    variant === 'ghost' && 'text-dim hover:bg-white/6 hover:text-fg',
    variant === 'danger' && 'bg-bad/10 text-bad ring-1 ring-inset ring-bad/30 hover:bg-bad/20',
    className,
  );
}

export function Button({
  variant,
  size,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={buttonClass(variant, size, className)} {...rest} />;
}

export function iconButtonClass(active?: boolean, className?: string) {
  return clsx(
    'grid size-9 shrink-0 place-items-center rounded-xl ring-1 ring-inset transition duration-150 [&_svg]:size-[18px]',
    active
      ? 'bg-accent/15 text-accent ring-accent/45'
      : 'bg-white/4 text-dim ring-white/10 hover:bg-white/10 hover:text-fg',
    className,
  );
}

export function IconButton({
  label,
  active,
  noFocus,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
  /** Keep focus off the button so Space/Enter stay with the game after a click. */
  noFocus?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onMouseDown={noFocus ? (e) => e.preventDefault() : undefined}
      className={iconButtonClass(active, className)}
      {...rest}
    />
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function PageHeader({
  kicker,
  title,
  actions,
  children,
}: {
  kicker: string;
  title: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
      <div className="min-w-0">
        <p className="text-glow font-pixel text-[10px] uppercase tracking-[0.2em] text-accent">{kicker}</p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-fg sm:text-5xl">{title}</h1>
        {children && <div className="mt-3 max-w-2xl text-[15px] leading-relaxed text-dim">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({
  title,
  icon,
  aside,
  className,
  children,
}: {
  title?: string;
  icon?: ReactNode;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={clsx('glass rounded-2xl p-5 sm:p-6', className)}>
      {title && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-sans text-xs font-semibold uppercase tracking-[0.16em] text-dim [&_svg]:size-4 [&_svg]:text-accent">
            {icon}
            {title}
          </h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function SettingRow({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-white/6 py-4 first:pt-0 last:border-0 last:pb-0">
      <div className="min-w-0 max-w-md">
        <div className="font-medium text-fg">{label}</div>
        {help && <div className="mt-0.5 text-[13px] leading-snug text-faint">{help}</div>}
      </div>
      {children}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors',
        checked ? 'justify-end bg-accent' : 'justify-start bg-white/15',
      )}
    >
      <motion.span layout transition={{ type: 'spring', stiffness: 700, damping: 40 }} className="size-5 rounded-full bg-white shadow" />
    </button>
  );
}

export function Segmented<T extends string>({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (next: T) => void;
}) {
  return (
    <div role="radiogroup" className="inline-flex max-w-full overflow-x-auto rounded-xl bg-white/5 p-1 ring-1 ring-inset ring-white/10">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={clsx(
              'relative shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
              on ? 'text-fg' : 'text-faint hover:text-dim',
            )}
          >
            {on && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                className="absolute inset-0 rounded-lg bg-white/10 ring-1 ring-inset ring-white/15"
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {o.label}
              {o.count != null && <span className="font-mono text-[10px] text-faint">{o.count}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function prefersReduced(pref: string): boolean {
  if (pref === 'reduced') return true;
  if (pref === 'full') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

const plain = (n: number) => Math.round(n).toLocaleString();

/** Counts up to `value`. Writes text imperatively, so React never owns the node's text. */
export function CountUp({ value, format = plain }: { value: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const last = useRef(0);
  const formatRef = useRef(format);
  formatRef.current = format;
  const { motion: pref } = useSettings();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReduced(pref) || last.current === value) {
      last.current = value;
      el.textContent = formatRef.current(value);
      return;
    }
    const controls = animate(last.current, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        last.current = v;
        el.textContent = formatRef.current(v);
      },
    });
    return () => controls.stop();
  }, [value, pref]);

  return <span ref={ref} />;
}

export function StatTile({
  icon: Icon,
  label,
  value,
  format,
  suffix,
  href,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
  format?: (n: number) => string;
  suffix?: string;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">
        <Icon className="size-4 text-accent" />
        {label}
      </div>
      <div className="mt-2 font-display text-3xl font-bold tabular-nums text-fg sm:text-[34px]">
        <CountUp value={value} format={format} />
        {suffix && <span className="ml-1 text-base font-medium text-faint">{suffix}</span>}
      </div>
    </>
  );
  const cls = 'glass block rounded-2xl p-4 sm:p-5';
  return href ? (
    <a href={href} className={clsx(cls, 'transition hover:bg-white/6')}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="text-xs text-faint">—</span>;
  const w = 100;
  const h = 28;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / span) * (h - 6)] as const);
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-[100px] overflow-visible" aria-hidden>
      <polyline
        points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lx} cy={ly} r="2.75" fill="var(--accent)" />
    </svg>
  );
}

export function EmptyState({
  icon,
  title,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="glass flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-accent/10 text-accent [&_svg]:size-6">{icon}</span>
      <h3 className="font-display text-lg font-bold text-fg">{title}</h3>
      <p className="max-w-sm text-sm text-dim">{children}</p>
      {action}
    </div>
  );
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(filename: string, text: string, type = 'application/json') {
  downloadBlob(filename, new Blob([text], { type }));
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
