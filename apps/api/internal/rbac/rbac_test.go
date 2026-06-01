package rbac

import "testing"

func set(keys ...string) map[string]struct{} {
	m := make(map[string]struct{}, len(keys))
	for _, k := range keys {
		m[k] = struct{}{}
	}
	return m
}

func TestHasPermission(t *testing.T) {
	tests := []struct {
		name     string
		granted  map[string]struct{}
		required string
		want     bool
	}{
		{"exact match", set("student.read"), "student.read", true},
		{"missing", set("student.read"), "student.delete", false},
		{"wildcard all (owner)", set("*"), "anything.here", true},
		{"resource wildcard", set("student.*"), "student.delete", true},
		{"resource wildcard miss", set("student.*"), "class.read", false},
		{"empty grants", set(), "student.read", false},
		{"no dot required", set("student.*"), "noaction", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := HasPermission(tt.granted, tt.required); got != tt.want {
				t.Errorf("HasPermission(%v, %q) = %v, want %v", tt.granted, tt.required, got, tt.want)
			}
		})
	}
}

func TestCatalogIntegrity(t *testing.T) {
	keys := make(map[string]struct{}, len(Permissions))
	for _, p := range Permissions {
		if _, dup := keys[p.Key]; dup {
			t.Errorf("duplicate permission key %q", p.Key)
		}
		keys[p.Key] = struct{}{}
	}
	// Every non-wildcard permission referenced by a default role must exist.
	for _, role := range DefaultRoles {
		for _, pk := range role.Permissions {
			if pk == AllPermissions {
				continue
			}
			if _, ok := keys[pk]; !ok {
				t.Errorf("role %q grants unknown permission %q", role.Key, pk)
			}
		}
	}
}
