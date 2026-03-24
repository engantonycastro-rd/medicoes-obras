-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 42: Campo preco_total_fixo nos serviços (importação COM BDI)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE servicos ADD COLUMN IF NOT EXISTS preco_total_fixo NUMERIC;
