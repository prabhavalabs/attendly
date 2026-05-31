import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { studentStatusSchema, type StudentDetail } from "@tuition/shared";

import { ApiError } from "@/lib/api";
import { useCreateStudent, useUpdateStudent } from "@/hooks/use-students";
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

const formSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required").max(120),
  phone: z.string().trim().max(20),
  email: z.union([z.literal(""), z.string().email("Enter a valid email")]),
  date_of_birth: z.string(),
  address: z.string().max(300),
  notes: z.string().max(1000),
  status: studentStatusSchema,
});
type FormValues = z.infer<typeof formSchema>;

const STATUS_LABELS: Record<FormValues["status"], string> = {
  active: "Active",
  inactive: "Inactive",
  graduated: "Graduated",
  withdrawn: "Withdrawn",
};

function blankToNull(s: string): string | null {
  return s.trim() === "" ? null : s.trim();
}

export function StudentDialog({
  open,
  onOpenChange,
  student,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student?: StudentDetail | null;
}) {
  const isEdit = !!student;
  const createStudent = useCreateStudent();
  const updateStudent = useUpdateStudent(student?.id ?? "");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: {
      full_name: student?.full_name ?? "",
      phone: student?.phone ?? "",
      email: student?.email ?? "",
      date_of_birth: student?.date_of_birth ?? "",
      address: student?.address ?? "",
      notes: student?.notes ?? "",
      status: student?.status ?? "active",
    },
  });

  async function onSubmit(v: FormValues) {
    const payload = {
      full_name: v.full_name,
      phone: blankToNull(v.phone),
      email: blankToNull(v.email),
      date_of_birth: blankToNull(v.date_of_birth),
      address: blankToNull(v.address),
      notes: blankToNull(v.notes),
      status: v.status,
    };
    try {
      if (isEdit) {
        await updateStudent.mutateAsync(payload);
        toast.success("Student updated");
      } else {
        const created = await createStudent.mutateAsync({ ...payload, guardians: [] });
        toast.success(`${created.full_name} registered · ${created.reg_no}`);
      }
      onOpenChange(false);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "request_failed";
      toast.error(code === "validation_error" ? "Please check the form." : "Could not save the student.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit student" : "Register student"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the student's profile details."
              : "A registration number and ID card token are generated automatically."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
            <FormField
              control={form.control}
              name="full_name"
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
                name="date_of_birth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date of birth</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
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
                    <Input type="email" placeholder="name@example.lk" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input placeholder="Optional" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isEdit ? (
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      items={studentStatusSchema.options.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {studentStatusSchema.options.map((s) => (
                          <SelectItem key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Register student"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
