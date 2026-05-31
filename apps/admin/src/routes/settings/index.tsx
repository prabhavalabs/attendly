import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import { usePermission } from "@/lib/auth-store";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const formSchema = z.object({
  org_name: z.string().trim().min(1, "Required").max(120),
  currency: z.string().trim().min(1, "Required").max(8),
  timezone: z.string().trim().min(1, "Required").max(60),
});
type FormValues = z.infer<typeof formSchema>;

export default function SettingsPage() {
  const { data, isLoading } = useSettings();
  const update = useUpdateSettings();
  const canManage = usePermission("settings.manage");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: { org_name: data?.org_name ?? "", currency: data?.currency ?? "", timezone: data?.timezone ?? "" },
  });

  async function onSubmit(v: FormValues) {
    try {
      await update.mutateAsync(v);
      toast.success("Settings saved");
    } catch {
      toast.error("Could not save settings.");
    }
  }

  return (
    <div className="p-6 md:p-8">
      <PageHeader title="Settings" description="Your organization profile and defaults." />
      <div className="bg-card max-w-xl rounded-2xl border p-6" style={{ boxShadow: "var(--sh-flat)" }}>
        {isLoading ? (
          <div className="grid gap-4">
            <Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" />
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
              <FormField
                control={form.control}
                name="org_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organization name</FormLabel>
                    <FormControl><Input disabled={!canManage} {...field} /></FormControl>
                    <FormDescription>Shown on printed cards and receipts.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency</FormLabel>
                      <FormControl><Input disabled={!canManage} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="timezone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Timezone</FormLabel>
                      <FormControl><Input disabled={!canManage} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {canManage ? (
                <div>
                  <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">You don't have permission to change settings.</p>
              )}
            </form>
          </Form>
        )}
      </div>
    </div>
  );
}
