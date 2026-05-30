import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { classBandSchema, classStatusSchema, type Class } from "@tuition/shared";

import { useCreateClass, useUpdateClass } from "@/hooks/use-classes";
import { useLecturers } from "@/hooks/use-lecturers";
import { toMinor, formatAmount } from "@/lib/money";
import { BandDot, BAND_OPTIONS } from "@/components/classes/band";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NONE = "__none__";

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  subject: z.string().trim().min(1, "Subject is required").max(80),
  code: z.string().trim().min(1, "Short code is required").max(12),
  band: classBandSchema,
  fee: z.string(),
  capacity: z.string(),
  room: z.string(),
  lecturer_id: z.string(),
  status: classStatusSchema,
});
type FormValues = z.infer<typeof formSchema>;

export function ClassDialog({
  open,
  onOpenChange,
  cls,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cls?: Class | null;
}) {
  const isEdit = !!cls;
  const createClass = useCreateClass();
  const updateClass = useUpdateClass(cls?.id ?? "");
  const { data: lecturers } = useLecturers();

  const bandItems = BAND_OPTIONS.map((b) => ({ value: b, label: b[0]!.toUpperCase() + b.slice(1) }));
  const lecturerItems = [
    { value: NONE, label: "Unassigned" },
    ...(lecturers ?? []).map((l) => ({ value: l.id, label: l.name })),
  ];
  const statusItems = [
    { value: "active", label: "Active" },
    { value: "archived", label: "Archived" },
  ];

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: {
      name: cls?.name ?? "",
      subject: cls?.subject ?? "",
      code: cls?.code ?? "",
      band: cls?.band ?? "teal",
      fee: cls ? formatAmount(cls.fee_minor) : "",
      capacity: cls?.capacity != null ? String(cls.capacity) : "",
      room: cls?.room ?? "",
      lecturer_id: cls?.lecturer_id ?? NONE,
      status: cls?.status ?? "active",
    },
  });

  async function onSubmit(v: FormValues) {
    const capacity = v.capacity.trim() === "" ? null : Math.max(1, Number.parseInt(v.capacity, 10) || 0);
    const base = {
      name: v.name,
      subject: v.subject,
      code: v.code,
      band: v.band,
      fee_minor: toMinor(v.fee || "0"),
      capacity,
      room: v.room.trim() === "" ? null : v.room.trim(),
      lecturer_id: v.lecturer_id === NONE ? null : v.lecturer_id,
    };
    try {
      if (isEdit) {
        await updateClass.mutateAsync({ ...base, status: v.status });
        toast.success("Class updated");
      } else {
        await createClass.mutateAsync(base);
        toast.success(`${v.name} created`);
      }
      onOpenChange(false);
    } catch {
      toast.error("Could not save the class.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit class" : "New class"}</DialogTitle>
          <DialogDescription>Subject, fee and schedule colour for this batch.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Class name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. A/L Physics 2026 — Sunday 8 AM" autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subject</FormLabel>
                    <FormControl>
                      <Input placeholder="A/L Physics" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Short code</FormLabel>
                    <FormControl>
                      <Input placeholder="Phys" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="band"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Colour band</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange} items={bandItems}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {BAND_OPTIONS.map((b) => (
                          <SelectItem key={b} value={b}>
                            <span className="flex items-center gap-2">
                              <BandDot band={b} /> <span className="capitalize">{b}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fee"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monthly fee (LKR)</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="5000.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="capacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Capacity</FormLabel>
                    <FormControl>
                      <Input inputMode="numeric" placeholder="Unlimited" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="room"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Room</FormLabel>
                    <FormControl>
                      <Input placeholder="Optional" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="lecturer_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lecturer</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} items={lecturerItems}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {lecturerItems.map((it) => (
                        <SelectItem key={it.value} value={it.value}>
                          {it.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                    <Select value={field.value} onValueChange={field.onChange} items={statusItems}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {statusItems.map((it) => (
                          <SelectItem key={it.value} value={it.value}>{it.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create class"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
