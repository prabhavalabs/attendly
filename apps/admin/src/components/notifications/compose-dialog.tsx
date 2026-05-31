import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { useClasses } from "@/hooks/use-classes";
import { useSendNotification } from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TYPE_ITEMS = [
  { value: "announcement", label: "Announcement" },
  { value: "reminder", label: "Reminder" },
];
const AUDIENCE_ITEMS = [
  { value: "all_students", label: "All students" },
  { value: "all_guardians", label: "All guardians" },
  { value: "class", label: "A class" },
];
const CHANNEL_ITEMS = [
  { value: "in_app", label: "In-app" },
  { value: "push", label: "Push" },
  { value: "sms", label: "SMS" },
  { value: "email", label: "Email" },
];

const formSchema = z
  .object({
    type: z.enum(["announcement", "reminder"]),
    title: z.string().trim().min(1, "Title is required").max(120),
    body: z.string().trim().min(1, "Message is required").max(2000),
    audience: z.enum(["all_students", "all_guardians", "class"]),
    class_id: z.string(),
    channel: z.enum(["in_app", "push", "sms", "email"]),
    scheduled_at: z.string(),
  })
  .refine((v) => v.audience !== "class" || v.class_id !== "", { message: "Pick a class", path: ["class_id"] });
type FormValues = z.infer<typeof formSchema>;

export function ComposeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: classes } = useClasses();
  const send = useSendNotification();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { type: "announcement", title: "", body: "", audience: "all_students", class_id: "", channel: "in_app", scheduled_at: "" },
  });
  const audience = form.watch("audience");
  const classItems = (classes ?? []).map((c) => ({ value: c.id, label: c.name }));

  async function onSubmit(v: FormValues) {
    try {
      const res = await send.mutateAsync({
        type: v.type,
        title: v.title,
        body: v.body,
        channel: v.channel,
        audience: v.audience,
        class_id: v.audience === "class" ? v.class_id : null,
        scheduled_at: v.scheduled_at ? new Date(v.scheduled_at).toISOString() : undefined,
      });
      toast.success(res.status === "queued" ? "Scheduled" : `Sent to ${res.recipient_count} recipient(s)`);
      form.reset();
      onOpenChange(false);
    } catch {
      toast.error("Could not send the notification.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New notification</DialogTitle>
          <DialogDescription>Compose an announcement or reminder. Leave the schedule empty to send now.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} items={TYPE_ITEMS}>
                    <FormControl><SelectTrigger className="w-full"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>{TYPE_ITEMS.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="channel" render={({ field }) => (
                <FormItem>
                  <FormLabel>Channel</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} items={CHANNEL_ITEMS}>
                    <FormControl><SelectTrigger className="w-full"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>{CHANNEL_ITEMS.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem><FormLabel>Title</FormLabel><FormControl><Input autoFocus {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="body" render={({ field }) => (
              <FormItem><FormLabel>Message</FormLabel><FormControl><Textarea rows={4} {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="audience" render={({ field }) => (
                <FormItem>
                  <FormLabel>Audience</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} items={AUDIENCE_ITEMS}>
                    <FormControl><SelectTrigger className="w-full"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>{AUDIENCE_ITEMS.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
                  </Select>
                </FormItem>
              )} />
              {audience === "class" ? (
                <FormField control={form.control} name="class_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Class</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange} items={classItems}>
                      <FormControl><SelectTrigger className="w-full"><SelectValue placeholder="Select…" /></SelectTrigger></FormControl>
                      <SelectContent>{classItems.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              ) : null}
            </div>
            <FormField control={form.control} name="scheduled_at" render={({ field }) => (
              <FormItem>
                <FormLabel>Schedule</FormLabel>
                <FormControl><Input type="datetime-local" {...field} /></FormControl>
                <FormDescription>Optional — leave empty to send immediately.</FormDescription>
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Sending…" : "Send"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
