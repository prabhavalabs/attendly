import { useState } from "react";
import { MoreHorizontal, Plus, ShieldCheck, Lock } from "lucide-react";
import { toast } from "sonner";
import type { Role } from "@tuition/shared";

import { ApiError } from "@/lib/api";
import { useRoles, useDeleteRole } from "@/hooks/use-roles";
import { Can } from "@/components/auth/can";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { RoleDialog } from "./role-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function permLabel(role: Role): string {
  if (role.permissions.includes("*")) return "All permissions";
  const n = role.permissions.length;
  return `${n} ${n === 1 ? "permission" : "permissions"}`;
}

export function RolesTab() {
  const { data: roles, isLoading, isError } = useRoles();
  const deleteRole = useDeleteRole();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await deleteRole.mutateAsync(deleting.id);
      toast.success(`Role "${deleting.label}" deleted`);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "request_failed";
      toast.error(
        code === "role_in_use"
          ? "This role is assigned to users. Reassign them first."
          : "Could not delete role.",
      );
      throw err;
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {roles ? `${roles.length} roles` : "Permission bundles"}
        </p>
        <Can perm="user.manage">
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            New role
          </Button>
        </Can>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="text-muted-foreground py-10 text-center text-sm">Couldn't load roles.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(roles ?? []).map((role) => (
            <div
              key={role.id}
              className="bg-card flex flex-col rounded-2xl border p-5"
              style={{ boxShadow: "var(--sh-flat)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="bg-accent text-primary grid size-9 place-items-center rounded-[var(--radius-md)]">
                    <ShieldCheck className="size-4.5" />
                  </div>
                  <div>
                    <div className="font-display font-bold">{role.label}</div>
                    <div className="text-muted-foreground font-mono text-xs">{role.key}</div>
                  </div>
                </div>
                <Can perm="user.manage">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="icon-sm" aria-label="Actions">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditing(role)}>
                        {role.key === "owner" ? "View" : "Edit"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={role.system}
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleting(role)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Can>
              </div>

              <p className="text-muted-foreground mt-3 line-clamp-2 grow text-sm">
                {role.description || "No description."}
              </p>

              <div className="text-muted-foreground mt-4 flex items-center gap-3 text-xs font-semibold">
                <span className="tnum">{permLabel(role)}</span>
                <span aria-hidden>·</span>
                <span className="tnum">
                  {role.user_count ?? 0} {role.user_count === 1 ? "user" : "users"}
                </span>
                {role.system ? (
                  <span className="text-muted-foreground ml-auto inline-flex items-center gap-1">
                    <Lock className="size-3" />
                    System
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <RoleDialog open={createOpen} onOpenChange={setCreateOpen} />
      <RoleDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} role={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.label ?? "role"}?`}
        description="This permanently removes the role. Users assigned to it must be reassigned first."
        confirmLabel="Delete role"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}
