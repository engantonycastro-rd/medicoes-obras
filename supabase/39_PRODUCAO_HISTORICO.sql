-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 39: Histórico de Produção + MARIO PAPIS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS producao_historico (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  mes_referencia        TEXT NOT NULL,  -- '2026-03' (Março 2026)
  engenheiro_id         UUID NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,

  -- Produção base
  qtd_obras_ativas      INT NOT NULL DEFAULT 0,
  valor_por_obra        NUMERIC(10,2) NOT NULL DEFAULT 120,
  producao_obras        NUMERIC(14,2) NOT NULL DEFAULT 0,
  producao_servicos     NUMERIC(14,2) NOT NULL DEFAULT 0,
  producao_base         NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- MARIO PAPIS
  mario_papis_posicao   INT,
  mario_papis_margem    NUMERIC(8,4) DEFAULT 0,
  bonus_percentual      NUMERIC(5,2) NOT NULL DEFAULT 0,  -- 10, 5 ou 0
  bonus_valor           NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Final
  producao_final        NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Quem efetivou
  efetivado_por         UUID REFERENCES perfis(id),
  efetivado_em          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Período do ciclo
  periodo_inicio        DATE NOT NULL,
  periodo_fim           DATE NOT NULL,

  UNIQUE(mes_referencia, engenheiro_id)
);

CREATE INDEX IF NOT EXISTS idx_prod_hist_eng ON producao_historico(engenheiro_id);
CREATE INDEX IF NOT EXISTS idx_prod_hist_mes ON producao_historico(mes_referencia);

ALTER TABLE producao_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prod_hist_admin" ON producao_historico FOR ALL USING (is_admin());
CREATE POLICY "prod_hist_own_select" ON producao_historico FOR SELECT
  USING (engenheiro_id = auth.uid());
