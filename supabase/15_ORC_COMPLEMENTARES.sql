-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Arquivos complementares nos orçamentos
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE orcamentos_revisao ADD COLUMN IF NOT EXISTS arquivos_complementares JSONB DEFAULT '[]'::jsonb;

-- Verifica
SELECT 'OK' AS status,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='orcamentos_revisao' AND column_name='arquivos_complementares') AS col_ok;
