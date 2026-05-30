/**
 * Permission catalog — the single source of truth for RBAC.
 *
 * Every API route is guarded by `requirePermission('<resource>.<action>')`
 * (SRS §6.1). Permissions are grouped by resource so the admin portal can
 * render a permission matrix. The wildcard `*` (held by the owner role) implies
 * every permission; a `<resource>.*` grant implies every action on that resource.
 */

export interface PermissionDef {
  /** Stable key in `resource.action` form — used in code and stored in the DB. */
  key: string;
  resource: string;
  action: string;
  /** Human label for the permission matrix UI. */
  label: string;
}

export interface PermissionGroup {
  resource: string;
  label: string;
  permissions: PermissionDef[];
}

/** Wildcard permission implying all others. Held by the owner role. */
export const ALL_PERMISSIONS = "*" as const;

/**
 * Resource groups, in display order for the permission matrix.
 * Keep aligned with the API spec (SRS §6).
 */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    resource: "student",
    label: "Students",
    permissions: [
      { key: "student.read", resource: "student", action: "read", label: "View students" },
      { key: "student.create", resource: "student", action: "create", label: "Create students" },
      { key: "student.update", resource: "student", action: "update", label: "Edit students" },
      { key: "student.delete", resource: "student", action: "delete", label: "Delete students" },
    ],
  },
  {
    resource: "card",
    label: "ID cards",
    permissions: [
      { key: "card.issue", resource: "card", action: "issue", label: "Issue cards" },
      { key: "card.revoke", resource: "card", action: "revoke", label: "Revoke cards" },
    ],
  },
  {
    resource: "attendance",
    label: "Attendance",
    permissions: [
      { key: "attendance.record", resource: "attendance", action: "record", label: "Record check-ins" },
    ],
  },
  {
    resource: "class",
    label: "Classes",
    permissions: [
      { key: "class.read", resource: "class", action: "read", label: "View classes" },
      { key: "class.manage", resource: "class", action: "manage", label: "Manage classes & enrollments" },
    ],
  },
  {
    resource: "lecturer",
    label: "Lecturers",
    permissions: [
      { key: "lecturer.read", resource: "lecturer", action: "read", label: "View lecturers" },
      { key: "lecturer.manage", resource: "lecturer", action: "manage", label: "Manage lecturers" },
    ],
  },
  {
    resource: "timetable",
    label: "Timetable",
    permissions: [
      { key: "timetable.read", resource: "timetable", action: "read", label: "View timetable" },
      { key: "timetable.manage", resource: "timetable", action: "manage", label: "Manage timetable" },
    ],
  },
  {
    resource: "session",
    label: "Sessions",
    permissions: [
      { key: "session.read", resource: "session", action: "read", label: "View sessions & rosters" },
      { key: "session.manage", resource: "session", action: "manage", label: "Generate & manage sessions" },
    ],
  },
  {
    resource: "invoice",
    label: "Invoices",
    permissions: [
      { key: "invoice.read", resource: "invoice", action: "read", label: "View invoices" },
      { key: "invoice.manage", resource: "invoice", action: "manage", label: "Generate, waive & adjust invoices" },
    ],
  },
  {
    resource: "payment",
    label: "Payments",
    permissions: [
      { key: "payment.read", resource: "payment", action: "read", label: "View payments & receipts" },
      { key: "payment.record", resource: "payment", action: "record", label: "Record payments" },
    ],
  },
  {
    resource: "notification",
    label: "Notifications",
    permissions: [
      { key: "notification.send", resource: "notification", action: "send", label: "Send notifications" },
    ],
  },
  {
    resource: "report",
    label: "Reports",
    permissions: [
      { key: "report.read", resource: "report", action: "read", label: "View reports" },
      { key: "report.export", resource: "report", action: "export", label: "Export reports (CSV/PDF)" },
    ],
  },
  {
    resource: "integration",
    label: "Integrations",
    permissions: [
      { key: "integration.manage", resource: "integration", action: "manage", label: "Manage integrations (Google Calendar)" },
    ],
  },
  {
    resource: "settings",
    label: "Settings",
    permissions: [
      { key: "settings.read", resource: "settings", action: "read", label: "View settings" },
      { key: "settings.manage", resource: "settings", action: "manage", label: "Manage settings" },
    ],
  },
  {
    resource: "audit",
    label: "Audit log",
    permissions: [
      { key: "audit.read", resource: "audit", action: "read", label: "View audit log" },
    ],
  },
  {
    resource: "user",
    label: "Users & roles",
    permissions: [
      { key: "user.read", resource: "user", action: "read", label: "View users & roles" },
      { key: "user.manage", resource: "user", action: "manage", label: "Manage users, roles & permissions" },
    ],
  },
];

/** Flat list of every concrete permission definition. */
export const PERMISSIONS: PermissionDef[] = PERMISSION_GROUPS.flatMap((g) => g.permissions);

/** Flat list of every permission key (`resource.action`). */
export const PERMISSION_KEYS: string[] = PERMISSIONS.map((p) => p.key);

/** Union type of all valid permission keys. */
export type PermissionKey = (typeof PERMISSION_KEYS)[number];
