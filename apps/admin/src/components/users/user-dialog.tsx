import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { createUserSchema, type CreateUserInput, type Role, type User } from "@tuition/shared";

import { ApiError } from "@/lib/api";
import { useRoles } from "@/hooks/use-roles";
import { useCreateUser, useUpdateUser } from "@/hooks/use-users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const API_ERRORS: Record<string, string> = {
  email_taken: "That email is already in use.",
  last_owner: "You can't remove the last owner.",
  cannot_suspend_self: "You can't suspend your own account.",
};

function errMessage(err: unknown): string {
  const code = err instanceof ApiError ? err.code : "request_failed";
  return API_ERRORS[code] ?? "Something went wrong. Please try again.";
}

function RoleCheckboxes({
  roles,
  value,
  onChange,
}: {
  roles: Role[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(id: string, checked: boolean) {
    onChange(checked ? [...value, id] : value.filter((r) => r !== id));
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {roles.map((role) => (
        <label
          key={role.id}
          className="hover:bg-muted/60 flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-md)] border p-2.5"
        >
          <Checkbox
            checked={value.includes(role.id)}
            onCheckedChange={(c) => toggle(role.id, c === true)}
            className="mt-0.5"
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{role.label}</span>
            <span className="text-muted-foreground block truncate text-xs">{role.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function CreateUserForm({ onDone }: { onDone: () => void }) {
  const rolesQuery = useRoles();
  const createUser = useCreateUser();
  const form = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { email: "", name: "", password: "", role_ids: [] },
  });

  async function onSubmit(values: CreateUserInput) {
    try {
      await createUser.mutateAsync(values);
      toast.success(`${values.name} added`);
      onDone();
    } catch (err) {
      toast.error(errMessage(err));
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Nimasha Fernando" autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="name@institute.lk" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Temporary password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="At least 8 characters" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="role_ids"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Roles</FormLabel>
              <RoleCheckboxes
                roles={rolesQuery.data ?? []}
                value={field.value}
                onChange={field.onChange}
              />
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Adding…" : "Add user"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

const editSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  status: z.enum(["active", "suspended"]),
  role_ids: z.array(z.string()).min(1, "Assign at least one role"),
});
type EditValues = z.infer<typeof editSchema>;

function EditUserForm({ user, onDone }: { user: User; onDone: () => void }) {
  const rolesQuery = useRoles();
  const updateUser = useUpdateUser(user.id);
  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: user.name,
      status: user.status,
      role_ids: user.roles.map((r) => r.id),
    },
  });

  async function onSubmit(values: EditValues) {
    try {
      await updateUser.mutateAsync(values);
      toast.success(`${values.name} updated`);
      onDone();
    } catch (err) {
      toast.error(errMessage(err));
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <div className="grid gap-1">
          <Label className="text-muted-foreground text-xs">Email</Label>
          <div className="text-sm font-medium">{user.email}</div>
        </div>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem className="flex-row items-center justify-between rounded-[var(--radius-md)] border p-3">
              <div>
                <FormLabel>Active</FormLabel>
                <p className="text-muted-foreground text-xs">
                  Suspended users cannot sign in.
                </p>
              </div>
              <FormControl>
                <Switch
                  checked={field.value === "active"}
                  onCheckedChange={(c) => field.onChange(c ? "active" : "suspended")}
                />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="role_ids"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Roles</FormLabel>
              <RoleCheckboxes
                roles={rolesQuery.data ?? []}
                value={field.value}
                onChange={field.onChange}
              />
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export function UserDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: User | null;
}) {
  const isEdit = !!user;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit user" : "Add user"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the user's name, status and role assignment."
              : "Create a staff account and assign one or more roles."}
          </DialogDescription>
        </DialogHeader>
        {isEdit && user ? (
          <EditUserForm user={user} onDone={() => onOpenChange(false)} />
        ) : (
          <CreateUserForm onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
