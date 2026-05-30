import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { guardianRelationshipSchema, type Guardian } from "@tuition/shared";

import { useAddGuardian, useUpdateGuardian } from "@/hooks/use-students";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const REL_LABELS: Record<z.infer<typeof guardianRelationshipSchema>, string> = {
  mother: "Mother",
  father: "Father",
  guardian: "Guardian",
  sibling: "Sibling",
  other: "Other",
};

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  phone: z.string().trim().min(1, "Phone is required").max(20),
  email: z.union([z.literal(""), z.string().email("Enter a valid email")]),
  relationship: guardianRelationshipSchema,
  is_primary: z.boolean(),
});
type FormValues = z.infer<typeof formSchema>;

export function GuardianDialog({
  studentId,
  open,
  onOpenChange,
  guardian,
}: {
  studentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guardian?: Guardian | null;
}) {
  const isEdit = !!guardian;
  const add = useAddGuardian(studentId);
  const update = useUpdateGuardian(studentId);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: {
      name: guardian?.name ?? "",
      phone: guardian?.phone ?? "",
      email: guardian?.email ?? "",
      relationship: guardian?.relationship ?? "guardian",
      is_primary: guardian?.is_primary ?? false,
    },
  });

  async function onSubmit(v: FormValues) {
    const input = {
      name: v.name,
      phone: v.phone,
      email: v.email.trim() === "" ? null : v.email.trim(),
      relationship: v.relationship,
      is_primary: v.is_primary,
    };
    try {
      if (isEdit && guardian) {
        await update.mutateAsync({ gid: guardian.id, input });
        toast.success("Guardian updated");
      } else {
        await add.mutateAsync(input);
        toast.success("Guardian added");
      }
      onOpenChange(false);
    } catch {
      toast.error("Could not save the guardian.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit guardian" : "Add guardian"}</DialogTitle>
          <DialogDescription>Parent or guardian contact details.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input inputMode="tel" placeholder="07X XXX XXXX" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="relationship"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Relationship</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {guardianRelationshipSchema.options.map((r) => (
                          <SelectItem key={r} value={r}>
                            {REL_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="Optional" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="is_primary"
              render={({ field }) => (
                <FormItem className="flex-row items-center justify-between rounded-[var(--radius-md)] border p-3">
                  <div>
                    <FormLabel>Primary contact</FormLabel>
                    <p className="text-muted-foreground text-xs">Used first for reminders and alerts.</p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Add guardian"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
