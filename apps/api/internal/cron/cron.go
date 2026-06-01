// Package cron runs the scheduled jobs in-process (the Worker's cron triggers):
// monthly invoice generation, daily overdue marking, and notification dispatch.
package cron

import (
	"context"
	"database/sql"
	"log/slog"
	"time"

	"github.com/robfig/cron/v3"

	"attendly/api/internal/billing"
	"attendly/api/internal/cryptox"
)

// Scheduler owns the cron runner.
type Scheduler struct {
	db *sql.DB
	c  *cron.Cron
}

// New constructs a Scheduler.
func New(db *sql.DB) *Scheduler {
	return &Scheduler{db: db, c: cron.New()}
}

// Start registers and launches the jobs. Specs match the Worker's crons.
func (s *Scheduler) Start() error {
	if _, err := s.c.AddFunc("0 2 1 * *", s.monthlyInvoices); err != nil { // 02:00 on the 1st
		return err
	}
	if _, err := s.c.AddFunc("0 3 * * *", s.markOverdue); err != nil { // 03:00 daily
		return err
	}
	if _, err := s.c.AddFunc("*/30 * * * *", s.dispatchNotifications); err != nil { // every 30 min
		return err
	}
	s.c.Start()
	slog.Info("cron started", "jobs", 3)
	return nil
}

// Stop halts the scheduler, waiting for running jobs (bounded by ctx).
func (s *Scheduler) Stop(ctx context.Context) {
	done := s.c.Stop() // returns a context that completes when jobs finish
	select {
	case <-done.Done():
	case <-ctx.Done():
	}
}

func jobCtx() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 2*time.Minute)
}

func (s *Scheduler) monthlyInvoices() {
	ctx, cancel := jobCtx()
	defer cancel()
	period := time.Now().UTC().Format("2006-01")
	n, err := billing.GenerateInvoices(ctx, s.db, billing.GenerateOpts{Period: period})
	if err != nil {
		slog.Error("cron monthly invoices", "err", err)
		return
	}
	slog.Info("cron monthly invoices", "period", period, "created", n)
}

func (s *Scheduler) markOverdue() {
	ctx, cancel := jobCtx()
	defer cancel()
	n, err := billing.MarkOverdue(ctx, s.db)
	if err != nil {
		slog.Error("cron mark overdue", "err", err)
		return
	}
	slog.Info("cron mark overdue", "updated", n)
}

func (s *Scheduler) dispatchNotifications() {
	ctx, cancel := jobCtx()
	defer cancel()
	now := cryptox.NowISO()
	res, err := s.db.ExecContext(ctx,
		`UPDATE notifications SET status = 'sent', sent_at = ?, updated_at = ?
		   WHERE status = 'queued' AND scheduled_at IS NOT NULL AND scheduled_at <= ?`,
		now, now, now)
	if err != nil {
		slog.Error("cron dispatch notifications", "err", err)
		return
	}
	n, _ := res.RowsAffected()
	slog.Info("cron dispatch notifications", "sent", n)
}
