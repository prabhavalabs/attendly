package auth

import (
	"context"
	"database/sql"
	"errors"

	"attendly/api/internal/cryptox"
	"attendly/api/internal/rbac"
	"attendly/api/internal/store"
)

// SetupInput is the first-boot bootstrap payload.
type SetupInput struct {
	Email      string `json:"email"`
	Name       string `json:"name"`
	Password   string `json:"password"`
	OrgName    string `json:"org_name"`
	SetupToken string `json:"setup_token"`
}

var (
	ErrSetupCompleted = errors.New("setup_already_completed")
	ErrEmailTaken     = errors.New("email_taken")
	ErrSeedFailed     = errors.New("seed_failed")
)

// Setup seeds RBAC + base settings and creates the first owner. Once a user
// exists it refuses unless a matching SETUP_TOKEN is supplied.
func (s *Service) Setup(ctx context.Context, in SetupInput) (string, error) {
	var count int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&count); err != nil {
		return "", err
	}
	if count > 0 && (s.setupToken == "" || in.SetupToken != s.setupToken) {
		return "", ErrSetupCompleted
	}

	roleIDs, err := rbac.Seed(ctx, s.db)
	if err != nil {
		return "", err
	}
	ownerRoleID := roleIDs["owner"]
	if ownerRoleID == "" {
		return "", ErrSeedFailed
	}

	var existing string
	err = s.db.QueryRowContext(ctx, `SELECT id FROM users WHERE email = ? AND deleted_at IS NULL`, in.Email).Scan(&existing)
	if err == nil {
		return "", ErrEmailTaken
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}

	hash, err := cryptox.HashPassword(in.Password)
	if err != nil {
		return "", err
	}
	userID := cryptox.NewID("usr")
	now := cryptox.NowISO()
	orgName := in.OrgName
	if orgName == "" {
		orgName = "attendly"
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx,
		`INSERT INTO users (id, email, name, password_hash, status, created_at, updated_at)
		 VALUES (?, ?, ?, ?, 'active', ?, ?)`,
		userID, in.Email, in.Name, hash, now, now,
	); err != nil {
		return "", err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`, userID, ownerRoleID); err != nil {
		return "", err
	}
	for _, kv := range [][2]string{{"org_name", orgName}, {"currency", "LKR"}, {"timezone", "Asia/Colombo"}} {
		if _, err := tx.ExecContext(ctx,
			`INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)`, kv[0], kv[1], now,
		); err != nil {
			return "", err
		}
	}
	if err := store.WriteAudit(ctx, tx, store.AuditEntry{ActorID: &userID, Action: "auth.setup", EntityType: strptr("user"), EntityID: &userID}); err != nil {
		return "", err
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return userID, nil
}
