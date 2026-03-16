-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Valores de orçamento original vs revisado + métricas
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE orcamentos_revisao ADD COLUMN IF NOT EXISTS valor_original NUMERIC(14,2) DEFAULT 0;
ALTER TABLE orcamentos_revisao ADD COLUMN IF NOT EXISTS valor_revisado NUMERIC(14,2) DEFAULT 0;
ALTER TABLE orcamentos_revisao ADD COLUMN IF NOT EXISTS diferenca_valor NUMERIC(14,2) DEFAULT 0;
ALTER TABLE orcamentos_revisao ADD COLUMN IF NOT EXISTS diferenca_percentual NUMERIC(8,4) DEFAULT 0;
ALTER TABLE orcamentos_revisao ADD COLUMN IF NOT EXISTS qtd_alteracoes INTEGER DEFAULT 0;

SELECT 'OK' AS status;
