import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { createRoleSchema, type CreateRoleInput, type Role } from "@tuition/shared";

import { ApiError } from "@/lib/api";
import { usePermissionCatalog, useCreateRole, useUpdateRole } from "@/hooks/use-roles";
import { PermissionMatrix } from "./permission-matrix";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const API_ERRORS: Record<string, string> = {
  role_key_taken: "That role key is already taken.",
  owner_permissions_locked: "The owner role always has every permission.",
};
function errMessage(err: unknown): string {
  const code = err instanceof ApiError ? err.code : "request_failed";
  return API_ERRORS[code] ?? "Something went wrong. Please try again.";
}

function CreateRoleForm({ onDone }: { onDone: () => void }) {
  const catalog = usePermissionCatalog();
  const createRole = useCreateRole();
  const form = useForm<CreateRoleInput>({
    resolver: zodResolver(createRoleSchema),
    defaultValues: { key: "", label: "", description: "", permissions: [] },
  });

  async function onSubmit(values: CreateRoleInput) {
    try {
      await createRole.mutateAsync(values);
      toast.success(`Role "${values.label}" created`);
      onDone();
    } catch (err) {
      toast.error(errMessage(err));
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="label"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Accountant" autoFocus {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="key"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Key</FormLabel>
                <FormControl>
                  <Input placeholder="accountant" {...field} />
                </FormControl>
                <FormDescription>Lowercase, used in code. Can't change later.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input placeholder="What this role is for" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="permissions"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Permissions</FormLabel>
              <PermissionMatrix
                groups={catalog.data ?? []}
                value={field.value}
                onChange={field.onChange}
              />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Creating…" : "Create role"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

const editSchema = z.object({
  label: z.string().trim().min(1, "Name is required").max(60),
  description: z.string().trim().max(240),
  permissions: z.array(z.string()),
});
type EditValues = z.infer<typeof editSchema>;

function EditRoleForm({ role, onDone }: { role: Role; onDone: () => void }) {
  const catalog = usePermissionCatalog();
  const updateRole = useUpdateRole(role.id);
  const isOwner = role.key === "owner";
  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      label: role.label,
      description: role.description,
      permissions: role.permissions,
    },
  });

  async function onSubmit(values: EditValues) {
    try {
      // Owner keeps the * wildcard — never send its permissions.
      const payload = isOwner
        ? { label: values.label, description: values.description }
        : values;
      await updateRole.mutateAsync(payload);
      toast.success(`Role "${values.label}" updated`);
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
          name="label"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="permissions"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Permissions</FormLabel>
              {isOwner ? (
                <FormDescription>
                  The owner role always holds every permission and can't be edited.
                </FormDescription>
              ) : null}
              <PermissionMatrix
                groups={catalog.data ?? []}
                value={isOwner ? [] : field.value}
                onChange={field.onChange}
                disabled={isOwner}
              />
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

export function RoleDialog({
  open,
  onOpenChange,
  role,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: Role | null;
}) {
  const isEdit = !!role;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${role?.label}` : "New role"}</DialogTitle>
          <DialogDescription>
            Choose exactly what this role can do. Changes apply to everyone assigned to it.
          </DialogDescription>
        </DialogHeader>
        {isEdit && role ? (
          <EditRoleForm role={role} onDone={() => onOpenChange(false)} />
        ) : (
          <CreateRoleForm onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
