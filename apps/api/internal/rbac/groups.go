package rbac

// PermissionGroup is a resource's permissions for the matrix UI.
type PermissionGroup struct {
	Resource    string       `json:"resource"`
	Label       string       `json:"label"`
	Permissions []Permission `json:"permissions"`
}

var groupOrder = []struct{ resource, label string }{
	{"student", "Students"}, {"card", "ID cards"}, {"attendance", "Attendance"},
	{"class", "Classes"}, {"lecturer", "Lecturers"}, {"timetable", "Timetable"},
	{"session", "Sessions"}, {"invoice", "Invoices"}, {"payment", "Payments"},
	{"notification", "Notifications"}, {"report", "Reports"}, {"integration", "Integrations"},
	{"settings", "Settings"}, {"audit", "Audit log"}, {"user", "Users & roles"},
}

// PermissionGroups returns the catalog grouped by resource, in display order.
func PermissionGroups() []PermissionGroup {
	byResource := map[string][]Permission{}
	for _, p := range Permissions {
		byResource[p.Resource] = append(byResource[p.Resource], p)
	}
	out := make([]PermissionGroup, 0, len(groupOrder))
	for _, g := range groupOrder {
		out = append(out, PermissionGroup{Resource: g.resource, Label: g.label, Permissions: byResource[g.resource]})
	}
	return out
}

// IsValidPermissionKey reports whether key is a known concrete permission.
func IsValidPermissionKey(key string) bool {
	for _, p := range Permissions {
		if p.Key == key {
			return true
		}
	}
	return false
}
