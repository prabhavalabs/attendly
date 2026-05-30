/**
 * Admin navigation. Each item carries the permission that gates its visibility
 * (cosmetic — routes are also guarded server-side and via router beforeLoad).
 */
import {
  LayoutDashboard,
  Users,
  BookOpen,
  CalendarDays,
  CalendarCheck,
  ClipboardCheck,
  Receipt,
  BarChart3,
  Bell,
  ShieldCheck,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Required permission to see this item; undefined = any authenticated user. */
  perm?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operations",
    items: [
      { label: "Dashboard", to: "/", icon: LayoutDashboard },
      { label: "Students", to: "/students", icon: Users, perm: "student.read" },
      { label: "Classes", to: "/classes", icon: BookOpen, perm: "class.read" },
      { label: "Timetable", to: "/timetable", icon: CalendarDays, perm: "timetable.read" },
      { label: "Sessions", to: "/sessions", icon: CalendarCheck, perm: "session.read" },
      { label: "Attendance", to: "/attendance", icon: ClipboardCheck, perm: "attendance.record" },
      { label: "Billing", to: "/billing", icon: Receipt, perm: "invoice.read" },
      { label: "Reports", to: "/reports", icon: BarChart3, perm: "report.read" },
      { label: "Notifications", to: "/notifications", icon: Bell, perm: "notification.send" },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Users & Roles", to: "/users", icon: ShieldCheck, perm: "user.read" },
      { label: "Settings", to: "/settings", icon: Settings, perm: "settings.read" },
    ],
  },
];
