import { Link, useRouterState } from "@tanstack/react-router";
import { hasPermission } from "@tuition/shared";

import { useAuthStore } from "@/lib/auth-store";
import { useT } from "@/lib/i18n";
import { NAV_GROUPS } from "./nav-config";
import { BrandGlyph, Wordmark } from "@/components/brand";
import { UserAvatar } from "@/components/common/user-avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

function isActive(current: string, to: string): boolean {
  return to === "/" ? current === "/" : current === to || current.startsWith(`${to}/`);
}

export function AppSidebar() {
  const permissions = useAuthStore((s) => s.permissions);
  const user = useAuthStore((s) => s.user);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const t = useT();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-1.5 py-1.5">
          <BrandGlyph size={34} />
          <Wordmark className="group-data-[collapsible=icon]:hidden" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((i) => !i.perm || hasPermission(permissions, i.perm));
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{t(group.key)}</SidebarGroupLabel>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      render={<Link to={item.to} />}
                      isActive={isActive(pathname, item.to)}
                      tooltip={t(item.key)}
                    >
                      <item.icon />
                      <span>{t(item.key)}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        {user ? (
          <div className="flex items-center gap-2.5 rounded-[var(--radius-md)] p-1.5">
            <UserAvatar name={user.name} seed={user.id} size={34} />
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <div className="text-foreground truncate text-sm font-bold">{user.name}</div>
              <div className="text-muted-foreground truncate text-xs">
                {user.roles?.[0]?.label ?? "Member"}
              </div>
            </div>
          </div>
        ) : null}
      </SidebarFooter>
    </Sidebar>
  );
}
