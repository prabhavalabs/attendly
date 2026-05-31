import { useEffect, useState } from "react";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { Bell, Search } from "lucide-react";

import { NAV_GROUPS } from "./nav-config";
import { AppSidebar } from "./app-sidebar";
import { UserMenu } from "./user-menu";
import { LangToggle } from "./lang-toggle";
import { CommandPalette } from "@/components/common/command-palette";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

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
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-svh overflow-hidden">
        <header className="bg-card flex h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-6" />
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>

          <div className="ml-auto flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="bg-background text-muted-foreground hover:text-foreground hidden h-9 w-64 items-center gap-2 rounded-[var(--radius-sm)] border px-3 text-sm lg:flex"
            >
              <Search className="size-4" />
              <span className="flex-1 text-left">Search students, pages…</span>
              <kbd className="bg-card rounded border px-1.5 text-[11px] font-semibold">⌘K</kbd>
            </button>
            <LangToggle />
            <Button
              variant="outline"
              size="icon"
              className="relative size-9"
              aria-label="Notifications"
            >
              <Bell className="size-4.5" />
              <span
                className="absolute top-2 right-2.5 size-1.5 rounded-full"
                style={{ background: "var(--bad)" }}
                aria-hidden
              />
            </Button>
            <UserMenu />
          </div>
        </header>

        <ScrollArea className="min-h-0 flex-1">
          <Outlet />
        </ScrollArea>
      </SidebarInset>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </SidebarProvider>
  );
}
