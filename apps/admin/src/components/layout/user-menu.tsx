import { useNavigate } from "@tanstack/react-router";
import { LogOut, Settings } from "lucide-react";

import { useAuthStore } from "@/lib/auth-store";
import { UserAvatar } from "@/components/common/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  if (!user) return null;

  const primaryRole = user.roles?.[0]?.label ?? "Member";

  async function handleLogout() {
    await logout();
    navigate({ to: "/login" });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="focus-visible:ring-ring/50 flex items-center gap-2 rounded-full outline-none focus-visible:ring-3">
        <UserAvatar name={user.name} seed={user.id} size={34} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {/* GroupLabel must live inside a Group (base-ui requirement). */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-3 py-2">
            <UserAvatar name={user.name} seed={user.id} size={36} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{user.name}</div>
              <div className="text-muted-foreground truncate text-xs">{user.email}</div>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <div className="px-2 pb-1.5">
          <span className="bg-accent text-accent-foreground inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase">
            {primaryRole}
          </span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
          <Settings className="size-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
