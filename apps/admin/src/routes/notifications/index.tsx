import { useState } from "react";
import { Plus, Bell } from "lucide-react";
import type { NotificationStatus } from "@tuition/shared";

import { useNotifications } from "@/hooks/use-notifications";
import { timeAgo, formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/common/page-header";
import { Can } from "@/components/auth/can";
import { StatusBadge, type StatusTone } from "@/components/common/status-badge";
import { ComposeDialog } from "@/components/notifications/compose-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS: Record<NotificationStatus, { tone: StatusTone; label: string }> = {
  queued: { tone: "warn", label: "Scheduled" },
  sent: { tone: "ok", label: "Sent" },
  failed: { tone: "bad", label: "Failed" },
};

const AUDIENCE_LABEL: Record<string, string> = {
  all_students: "All students",
  all_guardians: "All guardians",
  class: "Class",
  student: "Student",
};

export default function NotificationsPage() {
  const { data: notifications, isLoading } = useNotifications();
  const [composeOpen, setComposeOpen] = useState(false);

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Notifications"
        description="Send announcements and reminders to students and guardians."
        actions={
          <Can perm="notification.send">
            <Button onClick={() => setComposeOpen(true)}><Plus className="size-4" /> New notification</Button>
          </Can>
        }
      />

      {isLoading ? (
        <div className="grid gap-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : (notifications ?? []).length === 0 ? (
        <div className="bg-card flex flex-col items-center gap-3 rounded-2xl border py-16 text-center" style={{ boxShadow: "var(--sh-flat)" }}>
          <div className="bg-accent text-primary grid size-12 place-items-center rounded-2xl"><Bell className="size-6" /></div>
          <div>
            <div className="font-display font-semibold">No notifications yet</div>
            <div className="text-muted-foreground text-sm">Compose your first announcement or reminder.</div>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {notifications!.map((n) => {
            const st = STATUS[n.status];
            return (
              <div key={n.id} className="bg-card rounded-2xl border p-4" style={{ boxShadow: "var(--sh-flat)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-semibold">{n.title}</span>
                      <span className="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5 text-xs font-semibold capitalize">{n.type}</span>
                    </div>
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">{n.body}</p>
                    <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span>{AUDIENCE_LABEL[n.audience] ?? n.audience}</span>
                      <span>· {n.recipient_count} recipient{n.recipient_count === 1 ? "" : "s"}</span>
                      <span>· {n.channel}</span>
                      <span>· {n.status === "queued" && n.scheduled_at ? `scheduled ${formatDateTime(n.scheduled_at)}` : `sent ${timeAgo(n.sent_at)}`}</span>
                    </div>
                  </div>
                  <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ComposeDialog open={composeOpen} onOpenChange={setComposeOpen} />
    </div>
  );
}
