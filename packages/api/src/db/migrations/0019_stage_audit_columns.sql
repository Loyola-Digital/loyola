-- Migration: Move audit tracking from funnels to funnel_stages
-- Story: audit-per-stage (fix do modelo da Story 21.4)
--
-- Razão: auditoria deve ser POR STAGE, não por funil. Cada stage tem
-- sua própria planilha e seus dados próprios a auditar.

-- 1. Adiciona colunas em funnel_stages
ALTER TABLE funnel_stages
ADD COLUMN last_audit_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN last_audit_by UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN audit_status VARCHAR(20) NOT NULL DEFAULT 'pending';

-- 2. Backfill: aplica audit existente do funil em TODAS as stages dele
--    (conservador — preserva visibilidade até o user re-auditar por stage)
UPDATE funnel_stages fs
SET
  last_audit_at = f.last_audit_at,
  last_audit_by = f.last_audit_by,
  audit_status = f.audit_status
FROM funnels f
WHERE fs.funnel_id = f.id
  AND f.audit_status = 'audited';

-- 3. NÃO removemos as colunas de funnels ainda — deixamos pra uma migration
--    posterior depois que o frontend estiver 100% migrado e validado em prod.
