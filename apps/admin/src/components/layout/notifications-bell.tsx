import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { Popover } from "@base-ui/react/popover";

import { useNotifications } from "@/hooks/use-notifications";
import { timeAgo } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

const STATUS_DOT: Record<string, string> = {
  queued: "var(--warn)",
  sent: "var(--ok)",
  failed: "var(--bad)",
};

/** Topbar bell — a popover of recent notifications with a "view all" link. */
export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const t = useT();
  const { data } = useNotifications();
  const items = data ?? [];
  const recent = items.slice(0, 6);
  const pending = items.filter((n) => n.status === "queued").length;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        render={
          <Button variant="outline" size="icon" className="relative size-9" aria-label={t("shell.notifications")}>
            <Bell className="size-4.5" />
            {pending > 0 ? (
              <span
                className="absolute top-2 right-2.5 size-1.5 rounded-full"
                style={{ background: "var(--bad)" }}
                aria-hidden
              />
            ) : null}
          </Button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end">
          <Popover.Popup
            className="bg-card z-50 w-80 overflow-hidden rounded-xl border"
            style={{ boxShadow: "var(--sh-card)" }}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="font-display text-sm font-semibold">Notifications</span>
              {pending > 0 ? (
                <span className="text-warn-ink text-xs font-medium">{pending} scheduled</span>
              ) : null}
            </div>
            {recent.length === 0 ? (
              <div className="text-muted-foreground flex flex-col items-center gap-2 px-4 py-10 text-center text-sm">
                <Bell className="size-5 opacity-50" />
                No notifications yet.
              </div>
            ) : (
              <ul className="max-h-80 divide-y overflow-y-auto">
                {recent.map((n) => (
                  <li key={n.id} className="flex gap-2.5 px-4 py-3">
                    <span
                      className="mt-1.5 size-2 shrink-0 rounded-full"
                      style={{ background: STATUS_DOT[n.status] ?? "var(--neutral)" }}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{n.title}</div>
                      <div className="text-muted-foreground line-clamp-2 text-xs">{n.body}</div>
                      <div className="text-muted-foreground mt-0.5 text-[11px]">
                        {timeAgo(n.created_at)} · {n.recipient_count} recipients
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t p-2">
              <Button
                variant="ghost"
                className="w-full justify-center text-sm"
                onClick={() => {
                  setOpen(false);
                  void navigate({ to: "/notifications" });
                }}
              >
                View all notifications
              </Button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
