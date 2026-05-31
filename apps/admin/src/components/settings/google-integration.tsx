import { useState } from "react";
import { Calendar, ExternalLink, Loader2, Unplug } from "lucide-react";
import { toast } from "sonner";

import {
  useGoogleStatus,
  useGoogleCalendars,
  useSetCalendar,
  useDisconnectGoogle,
  connectGoogle,
} from "@/hooks/use-integrations";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Google Calendar integration panel (SRS §6.7).
 * Connect/disconnect the class's Google account and pick the target calendar.
 * Sessions sync to the chosen calendar on update (best-effort, server-side).
 */
export function GoogleIntegration() {
  const { data: status, isLoading } = useGoogleStatus();
  const connected = !!status?.connected;
  const calendars = useGoogleCalendars(connected);
  const setCalendar = useSetCalendar();
  const disconnect = useDisconnectGoogle();
  const [connecting, setConnecting] = useState(false);

  async function onConnect() {
    setConnecting(true);
    try {
      await connectGoogle();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      toast.error(code === "google_not_configured" ? "Google OAuth is not configured on the server." : "Could not start Google sign-in.");
    } finally {
      setConnecting(false);
    }
  }

  async function onSelectCalendar(id: string) {
    try {
      await setCalendar.mutateAsync(id);
      toast.success("Calendar updated. New session changes will sync here.");
    } catch {
      toast.error("Could not set the calendar.");
    }
  }

  async function onDisconnect() {
    try {
      await disconnect.mutateAsync();
      toast.success("Google Calendar disconnected.");
    } catch {
      toast.error("Could not disconnect.");
    }
  }

  const calItems = (calendars.data ?? []).map((cal) => ({
    value: cal.id,
    label: cal.primary ? `${cal.summary} (primary)` : cal.summary,
  }));

  return (
    <div className="bg-card max-w-xl rounded-2xl border p-6" style={{ boxShadow: "var(--sh-flat)" }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="bg-muted text-foreground grid size-10 place-items-center rounded-xl">
            <Calendar className="size-5" />
          </span>
          <div>
            <h3 className="text-base font-semibold">Google Calendar</h3>
            <p className="text-muted-foreground text-sm">
              Sync class sessions to a Google Calendar automatically.
            </p>
          </div>
        </div>
        {!isLoading && (
          <Badge variant={connected ? "default" : "outline"}>{connected ? "Connected" : "Not connected"}</Badge>
        )}
      </div>

      <div className="mt-6">
        {isLoading ? (
          <Skeleton className="h-9 w-48" />
        ) : connected ? (
          <div className="grid gap-4">
            <div className="text-sm">
              <span className="text-muted-foreground">Connected account: </span>
              <span className="font-medium">{status?.account_email ?? "—"}</span>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Target calendar</label>
              {calendars.isLoading ? (
                <Skeleton className="h-9 w-full max-w-sm" />
              ) : calendars.isError ? (
                <p className="text-muted-foreground text-sm">Could not load calendars. Try reconnecting.</p>
              ) : (
                <Select
                  value={status?.calendar_id ?? undefined}
                  onValueChange={(v) => v && onSelectCalendar(v)}
                  items={calItems}
                  disabled={setCalendar.isPending}
                >
                  <SelectTrigger className="w-full max-w-sm">
                    <SelectValue placeholder="Choose a calendar…" />
                  </SelectTrigger>
                  <SelectContent>
                    {calItems.map((it) => (
                      <SelectItem key={it.value} value={it.value}>{it.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-muted-foreground text-xs">
                Session edits (topic, schedule, cancellation) push to this calendar.
              </p>
            </div>

            <div>
              <Button variant="outline" onClick={onDisconnect} disabled={disconnect.isPending}>
                {disconnect.isPending ? <Loader2 className="size-4 animate-spin" /> : <Unplug className="size-4" />}
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={onConnect} disabled={connecting}>
            {connecting ? <Loader2 className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
            Connect Google Calendar
          </Button>
        )}
      </div>
    </div>
  );
}
