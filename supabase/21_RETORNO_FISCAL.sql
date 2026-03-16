-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Retorno Fiscal — versão aprovada pelo fiscal com glosas
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE orcamentos_revisao ADD COLUMN IF NOT EXISTS arquivo_fiscal_url TEXT;
ALTER TABLE orcamentos_revisao ADD COLUMN IF NOT EXISTS arquivo_fiscal_nome TEXT;
ALTER TABLE orcamentos_revisao ADD COLUMN IF NOT EXISTS arquivo_fiscal_size INTEGER;
ALTER TABLE orcamentos_revisao ADD COLUMN IF NOT EXISTS data_retorno_fiscal TIMESTAMPTZ;
ALTER TABLE orcamentos_revisao ADD COLUMN IF NOT EXISTS valor_aprovado_fiscal NUMERIC(14,2) DEFAULT 0;
ALTER TABLE orcamentos_revisao ADD COLUMN IF NOT EXISTS valor_glosado NUMERIC(14,2) DEFAULT 0;
ALTER TABLE orcamentos_revisao ADD COLUMN IF NOT EXISTS glosas_resumo JSONB DEFAULT '[]'::jsonb;
ALTER TABLE orcamentos_revisao ADD COLUMN IF NOT EXISTS obs_fiscal TEXT;

-- Novo status para indicar que tem retorno fiscal
ALTER TABLE orcamentos_revisao DROP CONSTRAINT IF EXISTS orcamentos_revisao_status_check;
ALTER TABLE orcamentos_revisao ADD CONSTRAINT orcamentos_revisao_status_check
  CHECK (status IN ('PENDENTE','EM_REVISAO','CONCLUIDO','CANCELADO','RETORNO_FISCAL'));

SELECT 'OK!' AS status;
