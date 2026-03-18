-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 38: Produção do Engenheiro + Tipo de Orçamento
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Campo tipo na tabela de orçamentos (ORCAMENTO = R$50, PROJETO = R$100)
ALTER TABLE orcamentos_revisao ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'ORCAMENTO' CHECK (tipo IN ('ORCAMENTO','PROJETO'));
ALTER TABLE orcamentos_revisao ADD COLUMN IF NOT EXISTS arquivos_projeto JSONB DEFAULT NULL;

-- 2. Tabela de produção — custo/faturamento por obra/período
CREATE TABLE IF NOT EXISTS producao_engenheiro (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  engenheiro_id   UUID NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
  obra_id         UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  periodo_inicio  DATE NOT NULL,
  periodo_fim     DATE NOT NULL,

  custo_total     NUMERIC(14,2) NOT NULL DEFAULT 0,
  faturamento     NUMERIC(14,2) NOT NULL DEFAULT 0,

  UNIQUE(engenheiro_id, obra_id, periodo_inicio, periodo_fim)
);

CREATE INDEX IF NOT EXISTS idx_prod_eng ON producao_engenheiro(engenheiro_id, periodo_inicio, periodo_fim);
CREATE INDEX IF NOT EXISTS idx_prod_obra ON producao_engenheiro(obra_id);

-- Trigger de updated_at
DROP TRIGGER IF EXISTS set_updated_producao ON producao_engenheiro;
CREATE TRIGGER set_updated_producao BEFORE UPDATE ON producao_engenheiro
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE producao_engenheiro ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prod_eng_admin" ON producao_engenheiro FOR ALL USING (is_admin());

CREATE POLICY "prod_eng_own_select" ON producao_engenheiro FOR SELECT
  USING (engenheiro_id = auth.uid());

CREATE POLICY "prod_eng_own_insert" ON producao_engenheiro FOR INSERT
  WITH CHECK (engenheiro_id = auth.uid());

CREATE POLICY "prod_eng_own_update" ON producao_engenheiro FOR UPDATE
  USING (engenheiro_id = auth.uid());

CREATE POLICY "prod_eng_own_delete" ON producao_engenheiro FOR DELETE
  USING (engenheiro_id = auth.uid());
