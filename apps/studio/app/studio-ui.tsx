"use client";

import { usePathname, useRouter } from "next/navigation";
import { type RefObject, useEffect, useRef, useState } from "react";
import { MotionRegion } from "@/components/workoutpal/motion-region";
import { SurfaceCommandPalette } from "@/components/workoutpal/surface-command";
import { WorkoutPalAssistant } from "./agent-assistant";

export type IconName =
  | "activity"
  | "archive"
  | "arrow-left"
  | "arrow-right"
  | "calendar"
  | "check"
  | "chevron-down"
  | "clock"
  | "close"
  | "document"
  | "flag"
  | "grid"
  | "history"
  | "home"
  | "menu"
  | "play"
  | "plus"
  | "search"
  | "settings"
  | "spark"
  | "target"
  | "users"
  | "warning"
  | "wave";

const iconPaths: Record<IconName, React.ReactNode> = {
  activity: <path d="M3 12h3l2.2-6 3.6 12 2.2-6H21" />,
  archive: (
    <>
      <path d="M4 7h16" />
      <path d="M6 7v11h12V7" />
      <path d="M5 4h14l1 3H4l1-3Z" />
      <path d="M9 11h6" />
    </>
  ),
  "arrow-left": <path d="m15 18-6-6 6-6M9 12h12" />,
  "arrow-right": <path d="M9 18l6-6-6-6M15 12H3" />,
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M8 2v4M16 2v4M3 9h18" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  document: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v5h5M9 12h6M9 16h6" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4" />
      <path d="M5 5c3-2 5 2 8 0 2-1 3-1 6 0v8c-3-1-4-1-6 0-3 2-5-2-8 0" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </>
  ),
  history: (
    <>
      <path d="M4 12a8 8 0 1 0 2.3-5.7" />
      <path d="M4 4v5h5M12 8v4l3 2" />
    </>
  ),
  home: (
    <>
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Z" />
      <path d="M9 21v-6h6v6" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  play: <path d="m8 5 11 7-11 7V5Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.8" />
      <path d="m16 16 5 5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-2.6V20a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1A1.7 1.7 0 0 0 8 15a1.7 1.7 0 0 0-1.6-1H6v-2.6h.4A1.7 1.7 0 0 0 8 10a1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2H15V5a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v2.6H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4L12 3Z" />
      <path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v3M21 12h-3M12 21v-3M3 12h3" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5.5a3 3 0 0 1 0 5.8M18 14a5 5 0 0 1 3 4.6V20" />
    </>
  ),
  warning: (
    <>
      <path d="m12 3 9 16H3L12 3Z" />
      <path d="M12 9v4M12 16h.01" />
    </>
  ),
  wave: <path d="M3 12c2.4-6 4.7-6 7 0s4.6 6 7 0 3.6-5 4-3" />,
};

export function Icon({
  name,
  size = 18,
  strokeWidth = 1.7,
}: {
  readonly name: IconName;
  readonly size?: number;
  readonly strokeWidth?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
    >
      {iconPaths[name]}
    </svg>
  );
}

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  readonly children: React.ReactNode;
  readonly tone?: StatusTone;
}) {
  return <span className={`wp-badge wp-badge-${tone}`}>{children}</span>;
}

export function Button({
  children,
  variant = "secondary",
  type = "button",
  disabled = false,
  onClick,
  className = "",
}: {
  readonly children: React.ReactNode;
  readonly variant?: "primary" | "secondary" | "quiet" | "danger";
  readonly type?: "button" | "submit" | "reset";
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  readonly className?: string;
}) {
  return (
    <button
      className={`wp-button wp-button-${variant} ${className}`}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

export function IconButton({
  buttonRef,
  label,
  icon,
  onClick,
  pressed,
  type = "button",
}: {
  readonly buttonRef?: RefObject<HTMLButtonElement | null>;
  readonly label: string;
  readonly icon: IconName;
  readonly onClick?: () => void;
  readonly pressed?: boolean;
  readonly type?: "button" | "submit" | "reset";
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={pressed}
      className={`wp-icon-button ${pressed ? "is-pressed" : ""}`}
      onClick={onClick}
      ref={buttonRef}
      title={label}
      type={type}
    >
      <Icon name={icon} />
    </button>
  );
}

export function Surface({
  children,
  className = "",
  as: Element = "section",
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly as?: "section" | "div" | "article" | "aside";
}) {
  return <Element className={`wp-surface ${className}`}>{children}</Element>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  badges = [],
  actions,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description?: string;
  readonly badges?: readonly React.ReactNode[];
  readonly actions?: React.ReactNode;
}) {
  return (
    <header className="wp-page-header">
      <div className="wp-page-header-copy">
        <div className="wp-eyebrow-row">
          <span className="wp-eyebrow">{eyebrow}</span>
          {badges.map((badge, index) => (
            <span key={`page-badge-${index.toString()}`}>{badge}</span>
          ))}
        </div>
        <h1>{title}</h1>
        {description === undefined ? null : <p>{description}</p>}
      </div>
      {actions === undefined ? null : (
        <div className="wp-page-actions">{actions}</div>
      )}
    </header>
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  readonly title: string;
  readonly description?: string;
  readonly action?: React.ReactNode;
}) {
  return (
    <div className="wp-section-header">
      <div>
        <h2>{title}</h2>
        {description === undefined ? null : <p>{description}</p>}
      </div>
      {action === undefined ? null : <div>{action}</div>}
    </div>
  );
}

export function Metric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone?: StatusTone;
}) {
  return (
    <Surface className="wp-metric">
      <span className="wp-label">{label}</span>
      <strong className={`wp-metric-value wp-value-${tone}`}>{value}</strong>
      <span className="wp-meta">{detail}</span>
    </Surface>
  );
}

export function EmptyState({
  icon = "grid",
  title,
  description,
  action,
}: {
  readonly icon?: IconName;
  readonly title: string;
  readonly description: string;
  readonly action?: React.ReactNode;
}) {
  return (
    <div className="wp-state wp-state-empty">
      <span className="wp-state-icon">
        <Icon name={icon} size={22} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action === undefined ? null : (
        <div className="wp-state-action">{action}</div>
      )}
    </div>
  );
}

export function LoadingState({
  label = "Loading current workspace",
}: {
  readonly label?: string;
}) {
  return (
    <div aria-live="polite" className="wp-state wp-state-loading">
      <span className="wp-loading-line" />
      <span>{label}…</span>
    </div>
  );
}

export function ErrorState({
  title = "We could not load this surface",
  description,
  onRetry,
}: {
  readonly title?: string;
  readonly description: string;
  readonly onRetry?: () => void;
}) {
  return (
    <div className="wp-state wp-state-error" role="alert">
      <span className="wp-state-icon">
        <Icon name="warning" size={22} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {onRetry === undefined ? null : (
        <Button onClick={onRetry} variant="secondary">
          Try again
        </Button>
      )}
    </div>
  );
}

export function BackendGap({
  capability,
  description,
  science = false,
}: {
  readonly capability: string;
  readonly description: string;
  readonly science?: boolean;
}) {
  return (
    <div className="wp-gap" role="note">
      <div className="wp-gap-heading">
        <StatusBadge tone="warning">
          {science ? "SCIENCE CONTRACT REQUIRED" : "BACKEND GAP"}
        </StatusBadge>
        <span className="wp-meta">{capability}</span>
      </div>
      <p>{description}</p>
    </div>
  );
}

export function DataTable({
  caption,
  columns,
  rows,
  empty,
}: {
  readonly caption: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly React.ReactNode[])[];
  readonly empty: React.ReactNode;
}) {
  return (
    <div className="wp-table-wrap">
      <table className="wp-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="wp-table-empty" colSpan={columns.length}>
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex.toString()}`}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={`cell-${rowIndex.toString()}-${cellIndex.toString()}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Timeline({
  events,
}: {
  readonly events: readonly {
    readonly title: string;
    readonly detail: string;
    readonly time: string;
    readonly tone?: StatusTone;
  }[];
}) {
  return (
    <ol className="wp-timeline">
      {events.map((event) => (
        <li key={`${event.title}-${event.time}`}>
          <span
            className={`wp-timeline-dot wp-dot-${event.tone ?? "neutral"}`}
          />
          <div className="wp-timeline-copy">
            <strong>{event.title}</strong>
            <span>{event.detail}</span>
          </div>
          <time>{event.time}</time>
        </li>
      ))}
    </ol>
  );
}

interface NavItem {
  readonly label: string;
  readonly icon: IconName;
  readonly href: (workspaceId: string, athleteId: string | undefined) => string;
  readonly match: (pathname: string) => boolean;
}

interface ContextTab {
  readonly label: string;
  readonly href: string;
  readonly match: (pathname: string) => boolean;
}

const navItems: readonly NavItem[] = [
  {
    label: "Today",
    icon: "home",
    href: (workspaceId) => `/workspace/${workspaceId}`,
    match: (pathname) => /\/workspace\/[^/]+$/.test(pathname),
  },
  {
    label: "Athletes",
    icon: "users",
    href: (workspaceId) => `/workspace/${workspaceId}/athletes`,
    match: (pathname) => pathname.includes("/athletes"),
  },
  {
    label: "Calendar",
    icon: "calendar",
    href: (workspaceId, athleteId) =>
      athleteId === undefined
        ? `/workspace/${workspaceId}/athletes`
        : `/workspace/${workspaceId}/athletes/${athleteId}/calendar/week`,
    match: (pathname) => pathname.includes("/calendar"),
  },
  {
    label: "Training",
    icon: "target",
    href: (workspaceId, athleteId) =>
      athleteId === undefined
        ? `/workspace/${workspaceId}/athletes`
        : `/workspace/${workspaceId}/athletes/${athleteId}/training`,
    match: (pathname) =>
      pathname.includes("/training") || pathname.includes("/sessions"),
  },
  {
    label: "Assessments",
    icon: "activity",
    href: (workspaceId, athleteId) =>
      athleteId === undefined
        ? `/workspace/${workspaceId}/athletes`
        : `/workspace/${workspaceId}/athletes/${athleteId}/assessments`,
    match: (pathname) => pathname.includes("/assessments"),
  },
  {
    label: "Monitoring",
    icon: "wave",
    href: (workspaceId, athleteId) =>
      athleteId === undefined
        ? `/workspace/${workspaceId}/athletes`
        : `/workspace/${workspaceId}/athletes/${athleteId}/monitoring`,
    match: (pathname) => pathname.includes("/monitoring"),
  },
  {
    label: "Reports",
    icon: "document",
    href: (workspaceId) => `/workspace/${workspaceId}/reports`,
    match: (pathname) => pathname.includes("/reports"),
  },
  {
    label: "History",
    icon: "history",
    href: (workspaceId) => `/workspace/${workspaceId}/history`,
    match: (pathname) => pathname.includes("/history"),
  },
  {
    label: "Settings",
    icon: "settings",
    href: (workspaceId) => `/workspace/${workspaceId}/settings`,
    match: (pathname) => pathname.includes("/settings"),
  },
];

function contextTabs(
  workspaceId: string,
  athleteId: string | undefined,
): readonly ContextTab[] {
  if (athleteId !== undefined) {
    return [
      {
        label: "Overview",
        href: `/workspace/${workspaceId}/athletes/${athleteId}`,
        match: (pathname) =>
          /\/athletes\/[^/]+$/.test(pathname) ||
          pathname.includes("/profile") ||
          pathname.includes("/goals"),
      },
      {
        label: "Training design",
        href: `/workspace/${workspaceId}/athletes/${athleteId}/training`,
        match: (pathname) =>
          pathname.includes("/training") || pathname.includes("/sessions"),
      },
      {
        label: "Calendar",
        href: `/workspace/${workspaceId}/athletes/${athleteId}/calendar/week`,
        match: (pathname) => pathname.includes("/calendar"),
      },
      {
        label: "Execution",
        href: `/workspace/${workspaceId}/athletes/${athleteId}/execution`,
        match: (pathname) => pathname.includes("/execution"),
      },
      {
        label: "Monitoring",
        href: `/workspace/${workspaceId}/athletes/${athleteId}/monitoring`,
        match: (pathname) => pathname.includes("/monitoring"),
      },
      {
        label: "Assessments",
        href: `/workspace/${workspaceId}/athletes/${athleteId}/assessments`,
        match: (pathname) => pathname.includes("/assessments"),
      },
    ];
  }
  return [
    {
      label: "Today",
      href: `/workspace/${workspaceId}`,
      match: (pathname) => /\/workspace\/[^/]+$/.test(pathname),
    },
    {
      label: "Athletes",
      href: `/workspace/${workspaceId}/athletes`,
      match: (pathname) => pathname.includes("/athletes"),
    },
    {
      label: "Movement library",
      href: `/workspace/${workspaceId}/library/movements`,
      match: (pathname) => pathname.includes("/library"),
    },
    {
      label: "Reports",
      href: `/workspace/${workspaceId}/reports`,
      match: (pathname) => pathname.includes("/reports"),
    },
    {
      label: "History",
      href: `/workspace/${workspaceId}/history`,
      match: (pathname) => pathname.includes("/history"),
    },
    {
      label: "Settings",
      href: `/workspace/${workspaceId}/settings`,
      match: (pathname) => pathname.includes("/settings"),
    },
  ];
}

function pathContext(pathname: string) {
  const workspaceId = pathname.match(/\/workspace\/([^/]+)/)?.[1];
  const rawAthleteId = pathname.match(/\/athletes\/([^/]+)/)?.[1];
  const athleteId = rawAthleteId === "new" ? undefined : rawAthleteId;
  return { workspaceId, athleteId };
}

export function ProductAgentDock({
  workspaceId,
  athleteId,
  surfaceLabel = "Current workspace",
  open,
  launcherRef,
  onToggle,
}: {
  readonly workspaceId: string | undefined;
  readonly athleteId: string | undefined;
  readonly surfaceLabel: string | undefined;
  readonly open: boolean;
  readonly launcherRef?: RefObject<HTMLButtonElement | null>;
  readonly onToggle: () => void;
}) {
  if (workspaceId === undefined) return null;
  return (
    <aside
      aria-label="WorkoutPal Agent"
      className={`wp-agent-dock ${open ? "is-open" : ""}`}
    >
      {open ? (
        <MotionRegion className="wp-agent-panel-motion" open={open}>
          <div className="wp-agent-panel">
            <div className="wp-agent-panel-header">
              <div className="wp-agent-brand">
                <span className="wp-agent-mark">
                  <Icon name="spark" size={17} />
                </span>
                <div>
                  <strong>WorkoutPal Agent</strong>
                  <span>Contextual, read-grounded support</span>
                </div>
              </div>
              <IconButton
                label="Collapse WorkoutPal Agent"
                icon="close"
                onClick={onToggle}
              />
            </div>
            <div className="wp-agent-context">
              <StatusBadge tone="info">{surfaceLabel}</StatusBadge>
              <span>UI context is not authorization</span>
            </div>
            <WorkoutPalAssistant
              workspaceId={workspaceId}
              athleteId={athleteId}
            />
          </div>
        </MotionRegion>
      ) : (
        <button
          aria-label="Open WorkoutPal Agent"
          className="wp-agent-launcher"
          onClick={onToggle}
          ref={launcherRef}
          type="button"
        >
          <span className="wp-agent-mark">
            <Icon name="spark" size={19} />
          </span>
          <span className="wp-agent-launcher-copy">
            <strong>Agent</strong>
            <span>Ask WorkoutPal</span>
          </span>
        </button>
      )}
    </aside>
  );
}

export function AppShell({
  children,
  workspaceId: explicitWorkspaceId,
  athleteId: explicitAthleteId,
  workspaceLabel = "Workout workspace",
  athleteLabel,
  surfaceLabel,
}: {
  readonly children: React.ReactNode;
  readonly workspaceId?: string | undefined;
  readonly athleteId?: string | undefined;
  readonly workspaceLabel?: string | undefined;
  readonly athleteLabel?: string | undefined;
  readonly surfaceLabel?: string | undefined;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const context = pathContext(pathname);
  const workspaceId = explicitWorkspaceId ?? context.workspaceId;
  const rawAthleteId = explicitAthleteId ?? context.athleteId;
  const athleteId = rawAthleteId === "new" ? undefined : rawAthleteId;
  const [agentOpen, setAgentOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const agentLauncherRef = useRef<HTMLButtonElement>(null);
  const mobileNavTriggerRef = useRef<HTMLButtonElement>(null);
  const wasAgentOpen = useRef(false);
  const wasMobileNavOpen = useRef(false);
  const inWorkspace = workspaceId !== undefined;

  useEffect(() => {
    if (workspaceId === undefined) return;

    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === "Escape") {
        setAgentOpen(false);
        setCommandOpen(false);
        setMobileNavOpen(false);
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [workspaceId]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1100px)");
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);
    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    if (wasAgentOpen.current && !agentOpen) {
      agentLauncherRef.current?.focus();
    }
    wasAgentOpen.current = agentOpen;
  }, [agentOpen]);

  useEffect(() => {
    if (wasMobileNavOpen.current && !mobileNavOpen) {
      mobileNavTriggerRef.current?.focus();
    }
    wasMobileNavOpen.current = mobileNavOpen;
  }, [mobileNavOpen]);

  if (!inWorkspace) {
    return (
      <main className="wp-auth-shell">
        <div className="wp-auth-brand">
          <a href="/" className="wp-brand-lockup">
            <span className="wp-brand-mark">W</span>
            <span>
              <strong>WORKOUTPAL</strong>
              <small>Studio</small>
            </span>
          </a>
          <a className="wp-auth-link" href="/sign-in">
            Sign in
          </a>
        </div>
        {children}
      </main>
    );
  }

  const resolvedWorkspaceId = workspaceId as string;
  const railIsHidden = isMobileViewport && !mobileNavOpen;
  return (
    <div className={`wp-shell ${agentOpen ? "has-agent" : ""}`}>
      <aside
        aria-hidden={railIsHidden}
        aria-label="Workspace navigation"
        className={`wp-rail ${mobileNavOpen ? "is-mobile-open" : ""}`}
        inert={railIsHidden}
      >
        <div className="wp-rail-brand">
          <a
            href={`/workspace/${resolvedWorkspaceId}`}
            className="wp-brand-lockup"
          >
            <span className="wp-brand-mark">W</span>
            <span className="wp-brand-wordmark">
              <strong>WORKOUTPAL</strong>
              <small>Training OS</small>
            </span>
          </a>
          <IconButton
            label="Close navigation"
            icon="close"
            onClick={() => setMobileNavOpen(false)}
          />
        </div>
        <div className="wp-workspace-switcher">
          <span className="wp-label">Workspace</span>
          <button
            type="button"
            onClick={() => router.push(`/workspace/${resolvedWorkspaceId}`)}
          >
            <span className="wp-workspace-avatar">
              {workspaceLabel.slice(0, 1).toUpperCase()}
            </span>
            <span className="wp-workspace-name">{workspaceLabel}</span>
            <Icon name="chevron-down" size={15} />
          </button>
        </div>
        <nav aria-label="Primary" className="wp-primary-nav">
          <span className="wp-nav-label">Workspace</span>
          {navItems.map((item) => {
            const active = item.match(pathname);
            return (
              <a
                aria-current={active ? "page" : undefined}
                className={`wp-nav-item ${active ? "is-active" : ""}`}
                href={item.href(resolvedWorkspaceId, athleteId)}
                key={item.label}
                onClick={() => setMobileNavOpen(false)}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>
        <div className="wp-rail-footer">
          <div className="wp-system-status">
            <span className="wp-status-dot" />
            <span>
              <strong>System nominal</strong>
              <small>Workspace data connected</small>
            </span>
          </div>
          <a className="wp-rail-foot-link" href="/sign-in">
            <Icon name="arrow-left" size={15} />
            <span>Switch account</span>
          </a>
        </div>
      </aside>
      {mobileNavOpen ? (
        <button
          aria-label="Close navigation overlay"
          className="wp-nav-overlay"
          onClick={() => setMobileNavOpen(false)}
          type="button"
        />
      ) : null}
      <div className="wp-main">
        <header className="wp-topbar">
          <div className="wp-topbar-leading">
            <IconButton
              buttonRef={mobileNavTriggerRef}
              label="Open navigation"
              icon="menu"
              onClick={() => setMobileNavOpen(true)}
            />
            <div className="wp-context-line">
              <span>{workspaceLabel}</span>
              {athleteLabel === undefined ? null : (
                <>
                  <span className="wp-context-separator">/</span>
                  <strong>{athleteLabel}</strong>
                </>
              )}
            </div>
          </div>
          <div className="wp-topbar-actions">
            <button
              aria-label="Open workspace command palette"
              className="wp-topbar-search"
              onClick={() => setCommandOpen(true)}
              type="button"
            >
              <Icon name="search" size={16} />
              <span>Search</span>
              <kbd>⌘ K</kbd>
            </button>
            <a
              className="wp-attention-link"
              href={`/workspace/${resolvedWorkspaceId}/attention`}
            >
              <Icon name="flag" size={16} />
              <span>Attention</span>
              <StatusBadge tone="warning">3</StatusBadge>
            </a>
            <button
              aria-expanded={agentOpen}
              className="wp-topbar-agent"
              onClick={() => setAgentOpen((current) => !current)}
              type="button"
            >
              <Icon name="spark" size={16} />
              <span>Agent</span>
            </button>
            <span
              className="wp-user-avatar"
              role="img"
              aria-label="Signed in user"
            >
              AC
            </span>
          </div>
        </header>
        <nav aria-label="Current workspace surface" className="wp-context-tabs">
          <div className="wp-context-tabs-inner">
            <span className="wp-context-tabs-label">
              {athleteId === undefined ? "Workspace focus" : "Athlete focus"}
            </span>
            {contextTabs(resolvedWorkspaceId, athleteId).map((tab) => {
              const active = tab.match(pathname);
              return (
                <a
                  aria-current={active ? "page" : undefined}
                  className={`wp-context-tab ${active ? "is-active" : ""}`}
                  href={tab.href}
                  key={tab.label}
                >
                  {tab.label}
                </a>
              );
            })}
            <span className="wp-context-tabs-spacer" />
            <span className="wp-scope-chip">
              <span aria-hidden="true" className="wp-scope-chip-dot" />
              Server-scoped workspace
            </span>
          </div>
        </nav>
        <main className="wp-canvas">{children}</main>
      </div>
      <ProductAgentDock
        athleteId={athleteId}
        launcherRef={agentLauncherRef}
        onToggle={() => setAgentOpen((current) => !current)}
        open={agentOpen}
        surfaceLabel={surfaceLabel}
        workspaceId={resolvedWorkspaceId}
      />
      <SurfaceCommandPalette
        athleteId={athleteId}
        onOpenChange={setCommandOpen}
        open={commandOpen}
        workspaceId={resolvedWorkspaceId}
      />
    </div>
  );
}

export function PageFrame({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
