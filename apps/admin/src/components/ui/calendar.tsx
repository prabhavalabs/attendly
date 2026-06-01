import "react-day-picker/style.css";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";

/**
 * Thin wrapper over react-day-picker with the app's brand accent. The base
 * stylesheet handles layout; CSS variables below theme it to match the design
 * tokens (brand selection colour, rounded today marker, muted weekday header).
 */
export function Calendar({ className, ...props }: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      className={cn("attendly-rdp p-2", className)}
      style={
        {
          "--rdp-accent-color": "var(--brand-600)",
          "--rdp-accent-background-color": "var(--accent)",
          "--rdp-today-color": "var(--brand-600)",
          "--rdp-day-width": "2.25rem",
          "--rdp-day-height": "2.25rem",
          "--rdp-day_button-width": "2.25rem",
          "--rdp-day_button-height": "2.25rem",
          fontSize: "13px",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}
