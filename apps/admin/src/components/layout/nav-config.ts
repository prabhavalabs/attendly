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
import type { I18nKey } from "@/lib/i18n";

export interface NavItem {
  /** English label (fallback / aria); the UI renders the translated key. */
  label: string;
  key: I18nKey;
  to: string;
  icon: LucideIcon;
  /** Required permission to see this item; undefined = any authenticated user. */
  perm?: string;
}

export interface NavGroup {
  label: string;
  key: I18nKey;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operations",
    key: "group.operations",
    items: [
      { label: "Dashboard", key: "nav.dashboard", to: "/", icon: LayoutDashboard },
      { label: "Students", key: "nav.students", to: "/students", icon: Users, perm: "student.read" },
      { label: "Classes", key: "nav.classes", to: "/classes", icon: BookOpen, perm: "class.read" },
      { label: "Timetable", key: "nav.timetable", to: "/timetable", icon: CalendarDays, perm: "timetable.read" },
      { label: "Sessions", key: "nav.sessions", to: "/sessions", icon: CalendarCheck, perm: "session.read" },
      { label: "Attendance", key: "nav.attendance", to: "/attendance", icon: ClipboardCheck, perm: "attendance.record" },
      { label: "Billing", key: "nav.billing", to: "/billing", icon: Receipt, perm: "invoice.read" },
      { label: "Reports", key: "nav.reports", to: "/reports", icon: BarChart3, perm: "report.read" },
      { label: "Notifications", key: "nav.notifications", to: "/notifications", icon: Bell, perm: "notification.send" },
    ],
  },
  {
    label: "Administration",
    key: "group.administration",
    items: [
      { label: "Users & Roles", key: "nav.users", to: "/users", icon: ShieldCheck, perm: "user.read" },
      { label: "Settings", key: "nav.settings", to: "/settings", icon: Settings, perm: "settings.read" },
    ],
  },
];
