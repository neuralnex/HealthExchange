import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Building2,
  ClipboardList,
  FileSearch,
  LogOut,
  Menu,
  Shield,
  Stethoscope,
  Users,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState, useEffect } from "react";
import { useSession } from "@/lib/hie/session";
import type { Role } from "@/lib/hie/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV: Array<{ to: string; label: string; icon: typeof FileSearch; roles: Role[] }> = [
  {
    to: "/portal",
    label: "Overview",
    icon: Activity,
    roles: ["clinician", "registrar", "auditor", "state_admin", "patient"],
  },
  {
    to: "/portal/search",
    label: "Find patient",
    icon: FileSearch,
    roles: ["clinician", "registrar", "state_admin"],
  },
  {
    to: "/portal/records",
    label: "This hospital",
    icon: Stethoscope,
    roles: ["clinician"],
  },
  {
    to: "/portal/queue",
    label: "Match queue",
    icon: Users,
    roles: ["registrar", "state_admin", "clinician"],
  },
  {
    to: "/portal/audit",
    label: "Audit",
    icon: ClipboardList,
    roles: ["auditor", "state_admin", "clinician"],
  },
  {
    to: "/portal/facilities",
    label: "Facilities",
    icon: Building2,
    roles: ["state_admin", "auditor", "registrar"],
  },
  {
    to: "/portal/consent",
    label: "My consent",
    icon: Shield,
    roles: ["patient"],
  },
];

export function PortalShell({ children }: { children: ReactNode }) {
  const { user, signOut, ready } = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (ready && !user) {
      void navigate({ to: "/" });
    }
  }, [ready, user, navigate]);

  if (!ready || !user) {
    return <div className="min-h-screen bg-bg" />;
  }

  const items = NAV.filter((n) => n.roles.includes(user.role));
  const org = user.facilityName ?? "FUTO Health Exchange";

  function NavList({ onPick }: { onPick?: () => void }) {
    return (
      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const active =
            item.to === "/portal" ? pathname === "/portal" : pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onPick}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-150",
                active ? "bg-ink-2 text-paper" : "text-sand/80 hover:bg-ink-2 hover:text-paper",
              )}
            >
              <Icon className="size-4 shrink-0" strokeWidth={1.75} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-fg">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-cabinet px-4 py-5 text-paper md:flex">
        <Link to="/portal" className="px-2 pb-6">
          <p className="font-display text-2xl leading-none tracking-tight">U-HRES</p>
          <p className="mt-1 text-[11px] tracking-[0.18em] text-sand/60 uppercase">
            FUTO Health Exchange
          </p>
        </Link>
        <NavList />
        <div className="mt-auto rounded-lg bg-ink-2 p-3">
          <p className="text-sm font-medium">
            {user.title} {user.name}
          </p>
          <p className="mt-0.5 text-xs text-sand/60">{user.specialty ?? user.role}</p>
          <p className="mt-1 text-[11px] text-sand/50">{org}</p>
          <button
            type="button"
            onClick={() => {
              signOut();
              void navigate({ to: "/" });
            }}
            className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-sm text-xs text-sand/70 hover:text-paper"
          >
            <LogOut className="size-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="md:pl-64">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur md:px-8">
          <button
            type="button"
            className="flex size-11 items-center justify-center rounded-md md:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-xs tracking-[0.16em] text-fg-subtle uppercase">
              Synthetic network · no real PHI
            </p>
            <p className="truncate text-sm text-fg-muted">{org}</p>
          </div>
          <span className="hidden rounded-full bg-accent-soft px-3 py-1 text-[11px] font-medium text-accent sm:inline">
            Purpose: treatment
          </span>
        </header>

        <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>

      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink/50"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(18rem,88vw)] flex-col bg-cabinet px-4 py-5 text-paper">
            <div className="mb-4 flex items-center justify-between px-2">
              <p className="font-display text-xl">U-HRES</p>
              <button
                type="button"
                className="flex size-11 items-center justify-center"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>
            <NavList onPick={() => setOpen(false)} />
            <Button
              variant="ghost"
              className="mt-6 text-sand"
              onClick={() => {
                signOut();
                setOpen(false);
                void navigate({ to: "/" });
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
