"use client";

import { BellRing, BookOpenText, Building2, Coffee, LayoutDashboard, Lightbulb, LogOut, Menu, Plus, Settings, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/app/login/actions";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

type Mode = "supabase" | "local" | "demo";

const NAV = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/app/contacts", label: "Contacts", icon: Users },
  { href: "/app/companies", label: "Companies", icon: Building2 },
  { href: "/app/follow-ups", label: "Follow-ups", icon: BellRing, badge: true },
  { href: "/app/knowledge", label: "Knowledge base", icon: Lightbulb },
  { href: "/app/playbook", label: "Playbook", icon: BookOpenText },
  { href: "/app/settings", label: "Profile & timeline", icon: Settings },
];

export function AppShell({
  mode,
  displayName,
  attention,
  children,
}: {
  mode: Mode;
  displayName: string;
  attention: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Full-screen live meeting view hides the chrome.
  if (pathname.endsWith("/live")) return <>{children}</>;

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-3" aria-label="Main">
      <Link href="/app" className="mb-3 flex items-center gap-2 px-2 py-1.5" onClick={() => setOpen(false)}>
        <span className="grid size-7 place-items-center rounded-lg bg-brand text-brand-foreground">
          <Coffee className="size-4" />
        </span>
        <span className="text-sm font-semibold tracking-tight">CoffeeChat AI</span>
      </Link>
      <Link
        href="/app/prepare"
        onClick={() => setOpen(false)}
        className={cn(buttonVariants({ size: "lg" }), "mb-3 justify-start gap-2")}
      >
        <Plus /> Prepare coffee chat
      </Link>
      {NAV.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
              active && "bg-sidebar-accent font-medium text-sidebar-foreground",
            )}
          >
            <Icon className="size-4" />
            <span className="flex-1">{item.label}</span>
            {item.badge && attention > 0 ? (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[0.6875rem] font-semibold text-brand-foreground">
                {attention}
              </span>
            ) : null}
          </Link>
        );
      })}
      <div className="mt-auto space-y-3 border-t border-sidebar-border pt-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{displayName || "Your workspace"}</p>
            <p className="text-xs text-muted-foreground">
              {mode === "demo" ? "Demo · fictional data" : mode === "local" ? "Local · on this computer" : "Private · signed in"}
            </p>
          </div>
          <ThemeToggle />
        </div>
        {mode !== "demo" ? (
          <form action={signOut}>
            <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
              <LogOut className="size-4" /> Sign out
            </button>
          </form>
        ) : null}
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col">
      {mode === "demo" ? <DemoBanner /> : null}
      <div className="flex flex-1">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
          {sidebar}
        </aside>
        {open ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-64 border-r border-sidebar-border bg-sidebar">{sidebar}</aside>
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-2 border-b border-border px-4 py-2 lg:hidden">
            <button onClick={() => setOpen(true)} aria-label="Open menu" className={buttonVariants({ variant: "ghost", size: "icon" })}>
              {open ? <X /> : <Menu />}
            </button>
            <span className="text-sm font-semibold">CoffeeChat AI</span>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}

function DemoBanner() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-brand/20 bg-brand-soft px-4 py-2 text-center text-xs text-foreground">
      <span>
        <strong className="font-semibold">Demo mode.</strong> Every person, company, and conversation here is fictional. Changes
        are temporary.
      </span>
      <span className="flex gap-3">
        <form action="/demo/reset" method="post">
          <button className="font-medium text-brand underline-offset-4 hover:underline">Reset demo</button>
        </form>
        <form action="/demo/exit" method="post">
          <button className="font-medium text-brand underline-offset-4 hover:underline">Exit demo</button>
        </form>
      </span>
    </div>
  );
}
