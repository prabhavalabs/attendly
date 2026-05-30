import { Outlet, useRouterState } from "@tanstack/react-router";
import { Bell, Search } from "lucide-react";

import { NAV_GROUPS } from "./nav-config";
import { AppSidebar } from "./app-sidebar";
import { UserMenu } from "./user-menu";
import { LangToggle } from "./lang-toggle";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

function titleFor(pathname: string): string {
  const match = ALL_ITEMS.filter((i) => i.to !== "/")
    .sort((a, b) => b.to.length - a.to.length)
    .find((i) => pathname === i.to || pathname.startsWith(`${i.to}/`));
  if (match) return match.label;
  if (pathname === "/") return "Dashboard";
  return "attendly";
}

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const title = titleFor(pathname);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="bg-card sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-6" />
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>

          <div className="ml-auto flex items-center gap-2.5">
            <div className="bg-background text-muted-foreground hidden items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-2 lg:flex">
              <Search className="size-4" />
              <input
                className="text-foreground w-52 bg-transparent text-sm outline-none placeholder:text-[var(--ink-400)]"
                placeholder="Search students, classes…"
                aria-label="Search"
              />
              <kbd className="bg-card text-muted-foreground rounded border px-1.5 text-[11px] font-semibold">
                ⌘K
              </kbd>
            </div>
            <LangToggle />
            <button
              type="button"
              className="text-muted-foreground hover:bg-muted hover:text-foreground relative grid size-9 place-items-center rounded-[var(--radius-sm)] border"
              aria-label="Notifications"
            >
              <Bell className="size-4.5" />
              <span
                className="absolute top-2 right-2.5 size-1.5 rounded-full"
                style={{ background: "var(--bad)" }}
              />
            </button>
            <UserMenu />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
