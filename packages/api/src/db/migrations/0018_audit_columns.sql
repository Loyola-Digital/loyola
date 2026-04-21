-- Migration: Add audit tracking columns to funnels table
-- Story 21.4: Auditoria do Dashboard Meta Ads

ALTER TABLE funnels
ADD COLUMN last_audit_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN last_audit_by UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN audit_status VARCHAR(20) NOT NULL DEFAULT 'pending';
