import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Popover } from "@base-ui/react/popover";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";

/**
 * Date field backed by a real calendar (react-day-picker) in a popover —
 * replaces native <input type="date">. Value is an ISO yyyy-MM-dd string so it
 * drops into the existing query params / URL state unchanged.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : undefined;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        render={
          <Button
            variant="outline"
            aria-label={ariaLabel}
            className={cn("h-10 justify-start gap-2 font-normal", !selected && "text-muted-foreground", className)}
          >
            <CalendarIcon className="size-4 opacity-70" />
            {selected ? format(selected, "dd MMM yyyy") : placeholder}
          </Button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="start">
          <Popover.Popup
            className="bg-card z-50 rounded-xl border p-1"
            style={{ boxShadow: "var(--sh-card)" }}
          >
            <Calendar
              mode="single"
              selected={selected}
              defaultMonth={selected}
              onSelect={(d) => {
                if (d) {
                  onChange(format(d, "yyyy-MM-dd"));
                  setOpen(false);
                }
              }}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
