import { Outlet, useRouterState } from "@tanstack/react-router";
import { Bell, Search } from "lucide-react";

import { NAV_GROUPS } from "./nav-config";
import { AppSidebar } from "./app-sidebar";
import { UserMenu } from "./user-menu";
import { LangToggle } from "./lang-toggle";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      <SidebarInset className="h-svh overflow-hidden">
        <header className="bg-card flex h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-6" />
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>

          <div className="ml-auto flex items-center gap-2.5">
            <div className="relative hidden lg:block">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                type="search"
                placeholder="Search students, classes…"
                aria-label="Search"
                className="h-9 w-64 pl-9 pr-12"
              />
              <kbd className="bg-card text-muted-foreground absolute top-1/2 right-2.5 -translate-y-1/2 rounded border px-1.5 text-[11px] font-semibold">
                ⌘K
              </kbd>
            </div>
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
    </SidebarProvider>
  );
}
