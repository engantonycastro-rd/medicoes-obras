-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 37 — ENGENHEIRO RESPONSÁVEL POR OBRA
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE obras ADD COLUMN IF NOT EXISTS engenheiro_responsavel_id UUID REFERENCES perfis(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_obras_engenheiro ON obras(engenheiro_responsavel_id);

SELECT 'OK! Coluna engenheiro_responsavel_id adicionada.' AS status;
