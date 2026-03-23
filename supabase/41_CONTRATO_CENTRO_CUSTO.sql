-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 41: Centro de Custo Mãe no Contrato
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE contratos ADD COLUMN IF NOT EXISTS centro_custo TEXT;
