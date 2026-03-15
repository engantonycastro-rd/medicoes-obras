-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Valor do Contrato e Data de Validade
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE contratos ADD COLUMN IF NOT EXISTS valor_contrato NUMERIC(14,2) DEFAULT 0;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS data_validade DATE;

SELECT 'OK!' AS status;
