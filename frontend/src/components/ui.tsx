import type { ButtonHTMLAttributes, ComponentType, ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, CircleDashed, Clock, Coins, FlaskConical, Hourglass, Inbox, Loader2, RotateCcw, Vote, XCircle } from "lucide-react";
import { MILESTONE_LABEL, PHASE_LABEL, type CampaignPhase, type MilestoneView } from "../utils/status";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-strong font-medium",
  secondary: "bg-raised text-text border border-line-strong hover:bg-hover",
  ghost: "text-text-2 hover:text-text hover:bg-hover",
  danger: "bg-danger-wash text-danger border border-danger/30 hover:bg-danger/20",
};

function buttonClasses(variant: Variant, size: "sm" | "md" | "lg", className = "") {
  const sizes = { sm: "h-8 px-3 text-[13px]", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-[15px]" };
  return `inline-flex items-center justify-center gap-2 rounded-[9px] whitespace-nowrap transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${sizes[size]} ${VARIANTS[variant]} ${className}`;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean }) {
  return (
    <button type="button" {...props} disabled={props.disabled || loading} className={buttonClasses(variant, size, className)}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function LinkButton({
  to,
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  to: string;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={buttonClasses(variant, size, className)}>
      {children}
    </Link>
  );
}

type Tone = "accent" | "warn" | "danger" | "info" | "neutral";

const TONES: Record<Tone, string> = {
  accent: "bg-accent-wash text-accent",
  warn: "bg-warn-wash text-warn",
  danger: "bg-danger-wash text-danger",
  info: "bg-info-wash text-info",
  neutral: "bg-hover text-text-2",
};

export function Badge({ tone = "neutral", icon: Icon, children }: { tone?: Tone; icon?: ComponentType<{ className?: string }>; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}>
      {Icon && <Icon className="size-3.5" />}
      {children}
    </span>
  );
}

const PHASE_BADGE: Record<CampaignPhase, { tone: Tone; icon: ComponentType<{ className?: string }> }> = {
  fundraising: { tone: "info", icon: Coins },
  "awaiting-finalization": { tone: "warn", icon: Hourglass },
  milestones: { tone: "accent", icon: Vote },
  failed: { tone: "danger", icon: RotateCcw },
  cancelled: { tone: "danger", icon: XCircle },
  completed: { tone: "accent", icon: CheckCircle2 },
};

export function PhaseBadge({ phase }: { phase: CampaignPhase }) {
  const { tone, icon } = PHASE_BADGE[phase];
  return (
    <Badge tone={tone} icon={icon}>
      {PHASE_LABEL[phase]}
    </Badge>
  );
}

const MILESTONE_BADGE: Record<MilestoneView, { tone: Tone; icon: ComponentType<{ className?: string }> }> = {
  upcoming: { tone: "neutral", icon: CircleDashed },
  pending: { tone: "warn", icon: Clock },
  voting: { tone: "info", icon: Vote },
  "awaiting-resolution": { tone: "warn", icon: Hourglass },
  "approved-claimable": { tone: "accent", icon: Coins },
  released: { tone: "accent", icon: CheckCircle2 },
  rejected: { tone: "danger", icon: XCircle },
  expired: { tone: "danger", icon: Clock },
  "never-reached": { tone: "neutral", icon: CircleDashed },
};

export function MilestoneBadge({ view }: { view: MilestoneView }) {
  const { tone, icon } = MILESTONE_BADGE[view];
  return (
    <Badge tone={tone} icon={icon}>
      {MILESTONE_LABEL[view]}
    </Badge>
  );
}

export function DemoBadge() {
  return (
    <Badge tone="neutral" icon={FlaskConical}>
      Local demo data
    </Badge>
  );
}

export function StatCard({ label, value, hint, icon: Icon }: { label: string; value: ReactNode; hint?: string; icon?: ComponentType<{ className?: string }> }) {
  return (
    <div className="card p-4 sm:p-5 min-w-0">
      <div className="flex items-center justify-between gap-2 text-text-3 text-[13px]">
        <span>{label}</span>
        {Icon && <Icon className="size-4 shrink-0" />}
      </div>
      <div className="mt-2 text-2xl font-medium num break-words">{value}</div>
      {hint && <div className="mt-1 text-xs text-text-3">{hint}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, children, action }: { icon?: ComponentType<{ className?: string }>; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card border-dashed px-6 py-12 text-center">
      <Icon className="size-7 mx-auto text-text-3" />
      <h3 className="mt-3 text-lg">{title}</h3>
      {children && <p className="mt-1.5 text-text-2 max-w-md mx-auto text-sm">{children}</p>}
      {action && <div className="mt-5 flex justify-center gap-3 flex-wrap">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = "Reading from the chain…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2.5 py-16 text-text-2 text-sm">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorMessage({ title = "Something went wrong", children }: { title?: string; children: ReactNode }) {
  return (
    <div role="alert" className="flex gap-3 rounded-[10px] border border-danger/30 bg-danger-wash p-3.5 text-sm">
      <AlertTriangle className="size-4 mt-0.5 text-danger shrink-0" aria-hidden />
      <div>
        <div className="font-medium text-danger">{title}</div>
        <div className="text-text-2 mt-0.5">{children}</div>
      </div>
    </div>
  );
}

export function Notice({ icon: Icon = AlertTriangle, tone = "neutral", children }: { icon?: ComponentType<{ className?: string }>; tone?: "neutral" | "warn"; children: ReactNode }) {
  return (
    <div className={`flex gap-2.5 rounded-[10px] border p-3 text-[13px] text-text-2 ${tone === "warn" ? "border-warn/30 bg-warn-wash" : "border-line bg-raised"}`}>
      <Icon className={`size-4 mt-0.5 shrink-0 ${tone === "warn" ? "text-warn" : "text-text-3"}`} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function SectionHeading({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div>
      {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
      <h2 className="display text-3xl sm:text-4xl">{title}</h2>
      {children && <p className="mt-3 text-text-2 max-w-2xl">{children}</p>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, children, action }: { eyebrow?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pt-10 pb-8">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="display text-4xl sm:text-5xl">{title}</h1>
        {children && <p className="mt-3 text-text-2 max-w-2xl">{children}</p>}
      </div>
      {action}
    </header>
  );
}

/** Pill filter row. Selected state is exposed to assistive tech with aria-pressed. */
export function FilterChips<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (value: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-full border px-3 py-1 text-[13px] transition-colors ${
            value === option.value ? "border-accent/50 bg-accent-wash text-accent" : "border-line text-text-2 hover:border-line-strong hover:text-text"
          }`}
        >
          {option.label}
          {option.count !== undefined && <span className="ml-1.5 num opacity-70">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}
