import { useState } from "react";
import { MoreHorizontal, Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { User } from "@tuition/shared";

import { ApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { useUsers, useDeleteUser } from "@/hooks/use-users";
import { formatDate, timeAgo } from "@/lib/format";
import { Can } from "@/components/auth/can";
import { UserAvatar } from "@/components/common/user-avatar";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { UserDialog } from "./user-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function RoleChips({ roles }: { roles: User["roles"] }) {
  if (roles.length === 0) return <span className="text-muted-foreground text-sm">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {roles.map((r) => (
        <span
          key={r.id}
          className="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5 text-xs font-semibold"
        >
          {r.label}
        </span>
      ))}
    </div>
  );
}

export function UsersTab() {
  const meId = useAuthStore((s) => s.user?.id);
  const { data: users, isLoading, isError } = useUsers();
  const deleteUser = useDeleteUser();

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await deleteUser.mutateAsync(deleting.id);
      toast.success(`${deleting.name} removed`);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "request_failed";
      toast.error(code === "last_owner" ? "You can't remove the last owner." : "Could not remove user.");
      throw err;
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {users ? `${users.length} ${users.length === 1 ? "user" : "users"}` : "Staff accounts"}
        </p>
        <Can perm="user.manage">
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
            Add user
          </Button>
        </Can>
      </div>

      <div className="bg-card overflow-hidden rounded-2xl border" style={{ boxShadow: "var(--sh-flat)" }}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last sign-in</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-9 rounded-full" />
                      <div className="grid gap-1.5">
                        <Skeleton className="h-3.5 w-32" />
                        <Skeleton className="h-3 w-40" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell />
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-10 text-center text-sm">
                  Couldn't load users.
                </TableCell>
              </TableRow>
            ) : users && users.length > 0 ? (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <UserAvatar name={user.name} seed={user.id} size={36} />
                      <div className="min-w-0">
                        <div className="font-semibold">
                          {user.name}
                          {user.id === meId ? (
                            <span className="text-muted-foreground ml-1.5 text-xs font-normal">(you)</span>
                          ) : null}
                        </div>
                        <div className="text-muted-foreground truncate text-xs">{user.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><RoleChips roles={user.roles} /></TableCell>
                  <TableCell>
                    {user.status === "active" ? (
                      <StatusBadge tone="ok">Active</StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral">Suspended</StatusBadge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground tnum text-sm" title={formatDate(user.last_login_at)}>
                    {timeAgo(user.last_login_at)}
                  </TableCell>
                  <TableCell>
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
                          <DropdownMenuItem onClick={() => setEditing(user)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={user.id === meId}
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleting(user)}
                          >
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </Can>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5}>
                  <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <div className="bg-accent text-primary grid size-12 place-items-center rounded-2xl">
                      <UserPlus className="size-6" />
                    </div>
                    <div>
                      <div className="font-display font-semibold">No users yet</div>
                      <div className="text-muted-foreground text-sm">Add your first staff account.</div>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <UserDialog open={addOpen} onOpenChange={setAddOpen} />
      <UserDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} user={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Remove ${deleting?.name ?? "user"}?`}
        description="They will lose access immediately. Their attendance and payment history is preserved."
        confirmLabel="Remove user"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}
