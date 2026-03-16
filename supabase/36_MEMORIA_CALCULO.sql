-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 36 — MEMÓRIA DE CÁLCULO
-- Subitens importados da planilha de memória, vinculados aos serviços
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS memoria_calculo_itens (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  obra_id             UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  servico_id          UUID REFERENCES servicos(id) ON DELETE CASCADE,
  item_servico        TEXT NOT NULL,
  descricao           TEXT NOT NULL,
  formula             TEXT,
  variaveis           JSONB DEFAULT '{}',
  quantidade_prevista NUMERIC(14,4) DEFAULT 0,
  ordem               INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_mem_calc_obra ON memoria_calculo_itens(obra_id);
CREATE INDEX IF NOT EXISTS idx_mem_calc_servico ON memoria_calculo_itens(servico_id);

-- FK na linhas_memoria para vincular ao subitem da memória
ALTER TABLE linhas_memoria ADD COLUMN IF NOT EXISTS memoria_item_id UUID REFERENCES memoria_calculo_itens(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE memoria_calculo_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "t_mem_calc" ON memoria_calculo_itens FOR ALL
  USING (
    obra_id IN (
      SELECT o.id FROM obras o JOIN contratos c ON c.id = o.contrato_id
      WHERE c.empresa_id = (SELECT p.empresa_id FROM perfis p WHERE p.id = auth.uid())
    )
  )
  WITH CHECK (TRUE);

SELECT 'OK! Memória de cálculo criada.' AS status;
