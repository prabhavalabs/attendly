// Package rbac holds the permission catalog, the default system roles, and the
// authoritative permission check. It mirrors @tuition/shared so the server
// stays the single source of truth (the admin UI gating is cosmetic).
package rbac

// AllPermissions is the wildcard implying every permission (held by owner).
const AllPermissions = "*"

// Permission is one concrete capability in resource.action form.
type Permission struct {
	Key      string
	Resource string
	Action   string
	Label    string
}

// Role is a default system role and the permission keys it grants.
type Role struct {
	Key         string
	Label       string
	Description string
	Permissions []string // ["*"] means all
}

// Permissions is the full catalog, in display order.
var Permissions = []Permission{
	{"student.read", "student", "read", "View students"},
	{"student.create", "student", "create", "Create students"},
	{"student.update", "student", "update", "Edit students"},
	{"student.delete", "student", "delete", "Delete students"},
	{"card.issue", "card", "issue", "Issue cards"},
	{"card.revoke", "card", "revoke", "Revoke cards"},
	{"attendance.record", "attendance", "record", "Record check-ins"},
	{"class.read", "class", "read", "View classes"},
	{"class.manage", "class", "manage", "Manage classes & enrollments"},
	{"lecturer.read", "lecturer", "read", "View lecturers"},
	{"lecturer.manage", "lecturer", "manage", "Manage lecturers"},
	{"timetable.read", "timetable", "read", "View timetable"},
	{"timetable.manage", "timetable", "manage", "Manage timetable"},
	{"session.read", "session", "read", "View sessions & rosters"},
	{"session.manage", "session", "manage", "Generate & manage sessions"},
	{"invoice.read", "invoice", "read", "View invoices"},
	{"invoice.manage", "invoice", "manage", "Generate, waive & adjust invoices"},
	{"payment.read", "payment", "read", "View payments & receipts"},
	{"payment.record", "payment", "record", "Record payments"},
	{"notification.send", "notification", "send", "Send notifications"},
	{"report.read", "report", "read", "View reports"},
	{"report.export", "report", "export", "Export reports (CSV/PDF)"},
	{"integration.manage", "integration", "manage", "Manage integrations (Google Calendar)"},
	{"settings.read", "settings", "read", "View settings"},
	{"settings.manage", "settings", "manage", "Manage settings"},
	{"audit.read", "audit", "read", "View audit log"},
	{"user.read", "user", "read", "View users & roles"},
	{"user.manage", "user", "manage", "Manage users, roles & permissions"},
}

// DefaultRoles are seeded on first boot; editable thereafter.
var DefaultRoles = []Role{
	{
		Key: "owner", Label: "Owner",
		Description: "The class proprietor. Full, unrestricted access to everything.",
		Permissions: []string{AllPermissions},
	},
	{
		Key: "admin", Label: "Admin",
		Description: "Senior staff. Everything except destructive user & role management.",
		Permissions: []string{
			"student.read", "student.create", "student.update", "student.delete",
			"card.issue", "card.revoke", "attendance.record",
			"class.read", "class.manage", "lecturer.read", "lecturer.manage",
			"timetable.read", "timetable.manage", "session.read", "session.manage",
			"invoice.read", "invoice.manage", "payment.read", "payment.record",
			"notification.send", "report.read", "report.export", "integration.manage",
			"settings.read", "settings.manage", "audit.read", "user.read",
		},
	},
	{
		Key: "manager", Label: "Manager",
		Description: "Operations: students, sessions, attendance, billing and reports.",
		Permissions: []string{
			"student.read", "student.create", "student.update",
			"card.issue", "card.revoke", "attendance.record",
			"class.read", "class.manage", "lecturer.read",
			"timetable.read", "timetable.manage", "session.read", "session.manage",
			"invoice.read", "invoice.manage", "payment.read", "payment.record",
			"notification.send", "report.read", "report.export", "settings.read",
		},
	},
	{
		Key: "teacher", Label: "Teacher / Lecturer",
		Description: "Instructor: view students, manage own sessions, record attendance.",
		Permissions: []string{
			"student.read", "attendance.record", "class.read",
			"timetable.read", "session.read", "session.manage", "report.read",
		},
	},
	{
		Key: "front_desk", Label: "Front desk",
		Description: "Reception: register students, issue cards, check-in, record payments.",
		Permissions: []string{
			"student.read", "student.create", "student.update",
			"card.issue", "card.revoke", "attendance.record",
			"class.read", "session.read", "invoice.read",
			"payment.read", "payment.record",
		},
	},
}

// HasPermission reports whether the granted set satisfies required, honoring
// the "*" (all) and "<resource>.*" (all actions on a resource) wildcards.
func HasPermission(granted map[string]struct{}, required string) bool {
	if _, ok := granted[AllPermissions]; ok {
		return true
	}
	if _, ok := granted[required]; ok {
		return true
	}
	for i := 0; i < len(required); i++ {
		if required[i] == '.' {
			if _, ok := granted[required[:i]+".*"]; ok {
				return true
			}
			break
		}
	}
	return false
}
