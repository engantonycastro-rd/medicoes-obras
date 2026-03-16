-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 35 — PREÇO TOTAL FIXO PARA IMPORTAÇÃO COM BDI
-- Quando preenchido, sistema usa este valor em vez de calcular QTD × PU
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE servicos ADD COLUMN IF NOT EXISTS preco_total_fixo NUMERIC(14,2) DEFAULT NULL;

COMMENT ON COLUMN servicos.preco_total_fixo IS 'Preço total importado direto da planilha COM BDI. Quando preenchido, substitui qualquer cálculo.';

SELECT 'OK! Coluna preco_total_fixo adicionada.' AS status;
