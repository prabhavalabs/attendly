/**
 * Default roles seeded on first boot (SRS §2.2, §7.1, FR-1.4).
 *
 * `owner` implicitly holds every permission via the `*` wildcard. The other
 * roles list explicit permission keys. These are the *defaults*; once seeded,
 * roles and their permissions are editable through the Users & Roles module.
 */

import { ALL_PERMISSIONS } from "./permissions";

export type DefaultRoleKey = "owner" | "admin" | "manager" | "teacher" | "front_desk";

export interface RoleDef {
  key: DefaultRoleKey;
  label: string;
  description: string;
  /** Permission keys; `["*"]` means all permissions. */
  permissions: string[];
  /** System roles cannot be deleted (but their permissions may be edited). */
  system: true;
}

export const DEFAULT_ROLES: Record<DefaultRoleKey, RoleDef> = {
  owner: {
    key: "owner",
    label: "Owner",
    description: "The class proprietor. Full, unrestricted access to everything.",
    permissions: [ALL_PERMISSIONS],
    system: true,
  },
  admin: {
    key: "admin",
    label: "Admin",
    description: "Senior staff. Everything except destructive user & role management.",
    permissions: [
      "student.read", "student.create", "student.update", "student.delete",
      "card.issue", "card.revoke",
      "attendance.record",
      "class.read", "class.manage",
      "lecturer.read", "lecturer.manage",
      "timetable.read", "timetable.manage",
      "session.read", "session.manage",
      "invoice.read", "invoice.manage",
      "payment.read", "payment.record",
      "notification.send",
      "report.read", "report.export",
      "integration.manage",
      "settings.read", "settings.manage",
      "audit.read",
      "user.read",
    ],
    system: true,
  },
  manager: {
    key: "manager",
    label: "Manager",
    description: "Operations: students, sessions, attendance, billing and reports.",
    permissions: [
      "student.read", "student.create", "student.update",
      "card.issue", "card.revoke",
      "attendance.record",
      "class.read", "class.manage",
      "lecturer.read",
      "timetable.read", "timetable.manage",
      "session.read", "session.manage",
      "invoice.read", "invoice.manage",
      "payment.read", "payment.record",
      "notification.send",
      "report.read", "report.export",
      "settings.read",
    ],
    system: true,
  },
  teacher: {
    key: "teacher",
    label: "Teacher / Lecturer",
    description: "Instructor: view students, manage own sessions, record attendance.",
    permissions: [
      "student.read",
      "attendance.record",
      "class.read",
      "timetable.read",
      "session.read", "session.manage",
      "report.read",
    ],
    system: true,
  },
  front_desk: {
    key: "front_desk",
    label: "Front desk",
    description: "Reception: register students, issue cards, check-in, record payments.",
    permissions: [
      "student.read", "student.create", "student.update",
      "card.issue", "card.revoke",
      "attendance.record",
      "class.read",
      "session.read",
      "invoice.read",
      "payment.read", "payment.record",
    ],
    system: true,
  },
};

export const DEFAULT_ROLE_LIST: RoleDef[] = Object.values(DEFAULT_ROLES);
