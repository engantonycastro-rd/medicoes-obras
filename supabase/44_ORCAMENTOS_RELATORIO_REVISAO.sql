-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 44: Relatório PDF na devolução de revisão de orçamento
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE orcamentos_revisao ADD COLUMN IF NOT EXISTS relatorio_revisao_url TEXT;
ALTER TABLE orcamentos_revisao ADD COLUMN IF NOT EXISTS relatorio_revisao_nome TEXT;
