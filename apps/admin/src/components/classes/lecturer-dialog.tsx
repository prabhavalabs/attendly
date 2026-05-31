import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import type { Lecturer } from "@tuition/shared";

import { useCreateLecturer, useUpdateLecturer } from "@/hooks/use-lecturers";
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  phone: z.string().trim().max(20),
  email: z.union([z.literal(""), z.string().email("Enter a valid email")]),
});
type FormValues = z.infer<typeof formSchema>;

export function LecturerDialog({
  open,
  onOpenChange,
  lecturer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lecturer?: Lecturer | null;
}) {
  const isEdit = !!lecturer;
  const create = useCreateLecturer();
  const update = useUpdateLecturer(lecturer?.id ?? "");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: {
      name: lecturer?.name ?? "",
      phone: lecturer?.phone ?? "",
      email: lecturer?.email ?? "",
    },
  });

  async function onSubmit(v: FormValues) {
    const input = {
      name: v.name,
      phone: v.phone.trim() === "" ? null : v.phone.trim(),
      email: v.email.trim() === "" ? null : v.email.trim(),
    };
    try {
      if (isEdit) {
        await update.mutateAsync(input);
        toast.success("Lecturer updated");
      } else {
        await create.mutateAsync(input);
        toast.success(`${v.name} added`);
      }
      onOpenChange(false);
    } catch {
      toast.error("Could not save the lecturer.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit lecturer" : "Add lecturer"}</DialogTitle>
          <DialogDescription>Instructor contact details.</DialogDescription>
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
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Add lecturer"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
