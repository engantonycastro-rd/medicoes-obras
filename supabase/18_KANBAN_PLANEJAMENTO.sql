-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Kanban de Planejamento de Serviços por Quinzena
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS kanban_cards (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  obra_id         UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  criado_por      UUID NOT NULL REFERENCES perfis(id),

  -- Período
  ano             INTEGER NOT NULL,
  mes             INTEGER NOT NULL CHECK (mes >= 1 AND mes <= 12),
  quinzena        INTEGER NOT NULL CHECK (quinzena IN (1, 2)),  -- 1=dia 1-15, 2=dia 16-fim

  -- Status (coluna no Kanban)
  status          TEXT NOT NULL DEFAULT 'PLANEJADO' CHECK (status IN ('PLANEJADO','EM_EXECUCAO','CONFERENCIA','CONCLUIDO')),

  -- Observações gerais do card
  observacoes     TEXT,

  UNIQUE(obra_id, ano, mes, quinzena)
);

CREATE TABLE IF NOT EXISTS kanban_itens (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_id         UUID NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
  ordem           INTEGER NOT NULL DEFAULT 0,

  -- O serviço planejado
  descricao       TEXT NOT NULL,
  servico_id      UUID REFERENCES servicos(id),  -- opcional: vincular ao serviço do orçamento

  -- Conferência
  executado       BOOLEAN NOT NULL DEFAULT FALSE,
  obs_conferencia TEXT,

  UNIQUE(card_id, ordem)
);

CREATE INDEX IF NOT EXISTS idx_kanban_cards_obra ON kanban_cards(obra_id);
CREATE INDEX IF NOT EXISTS idx_kanban_itens_card ON kanban_itens(card_id);

-- Trigger updated_at
DROP TRIGGER IF EXISTS set_updated_kanban ON kanban_cards;
CREATE TRIGGER set_updated_kanban BEFORE UPDATE ON kanban_cards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE kanban_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_itens ENABLE ROW LEVEL SECURITY;

-- Cards: visível se vê a obra
CREATE POLICY "kanban_cards_select" ON kanban_cards FOR SELECT
  USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM obras o WHERE o.id = obra_id AND is_team_visible(o.user_id))
    OR EXISTS (SELECT 1 FROM obras o WHERE o.id = obra_id AND is_contrato_gestor(o.contrato_id))
  );
CREATE POLICY "kanban_cards_insert" ON kanban_cards FOR INSERT WITH CHECK (is_ativo());
CREATE POLICY "kanban_cards_update" ON kanban_cards FOR UPDATE USING (is_ativo());
CREATE POLICY "kanban_cards_delete" ON kanban_cards FOR DELETE USING (is_admin() OR criado_por = auth.uid());

-- Itens: visível se vê o card
CREATE POLICY "kanban_itens_select" ON kanban_itens FOR SELECT
  USING (EXISTS (SELECT 1 FROM kanban_cards c WHERE c.id = card_id));
CREATE POLICY "kanban_itens_insert" ON kanban_itens FOR INSERT WITH CHECK (is_ativo());
CREATE POLICY "kanban_itens_update" ON kanban_itens FOR UPDATE USING (is_ativo());
CREATE POLICY "kanban_itens_delete" ON kanban_itens FOR DELETE USING (is_ativo());

SELECT 'OK!' AS status;
