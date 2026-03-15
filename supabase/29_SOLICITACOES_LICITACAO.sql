-- ============================================================================
-- 29_SOLICITACOES_LICITACAO.sql
-- Sistema de solicitações entre Licitante e Engenheiro com ciclo de revisão
-- ============================================================================

-- Tabela principal de solicitações
CREATE TABLE IF NOT EXISTS licitacao_solicitacoes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  licitacao_id    UUID NOT NULL REFERENCES licitacoes(id) ON DELETE CASCADE,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,

  -- Quem solicitou (Licitante) e quem recebeu (Engenheiro)
  solicitante_id  UUID NOT NULL REFERENCES auth.users(id),
  engenheiro_id   UUID NOT NULL REFERENCES auth.users(id),

  -- Tipo da solicitação
  tipo            TEXT NOT NULL DEFAULT 'READEQUACAO_PLANILHA'
    CHECK (tipo IN ('READEQUACAO_PLANILHA', 'PROPOSTA_TECNICA', 'MEMORIA_CALCULO', 'OUTRO')),

  -- Status com ciclo de revisão
  status          TEXT NOT NULL DEFAULT 'ABERTA'
    CHECK (status IN ('ABERTA', 'EM_ANDAMENTO', 'ENTREGUE', 'EM_REVISAO', 'APROVADA', 'CANCELADA')),

  -- Descrição inicial do que precisa ser feito
  descricao       TEXT NOT NULL,

  -- Prazo sugerido
  prazo           DATE,

  -- Prioridade
  prioridade      TEXT NOT NULL DEFAULT 'NORMAL'
    CHECK (prioridade IN ('BAIXA', 'NORMAL', 'ALTA', 'URGENTE')),

  -- Contador de revisões (incrementa a cada ciclo)
  revisoes        INTEGER NOT NULL DEFAULT 0
);

CREATE TRIGGER trg_licitacao_solicitacoes_updated
  BEFORE UPDATE ON licitacao_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_solic_licitacao ON licitacao_solicitacoes(licitacao_id);
CREATE INDEX IF NOT EXISTS idx_solic_engenheiro ON licitacao_solicitacoes(engenheiro_id);
CREATE INDEX IF NOT EXISTS idx_solic_solicitante ON licitacao_solicitacoes(solicitante_id);
CREATE INDEX IF NOT EXISTS idx_solic_status ON licitacao_solicitacoes(status);

-- Tabela de interações (timeline de cada ida e volta)
CREATE TABLE IF NOT EXISTS licitacao_solicitacao_interacoes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  solicitacao_id  UUID NOT NULL REFERENCES licitacao_solicitacoes(id) ON DELETE CASCADE,

  -- Quem fez a ação
  autor_id        UUID NOT NULL REFERENCES auth.users(id),

  -- Tipo da interação
  acao            TEXT NOT NULL
    CHECK (acao IN (
      'CRIADA',           -- Licitante criou a solicitação
      'ASSUMIDA',         -- Engenheiro assumiu (ABERTA → EM_ANDAMENTO)
      'ENTREGUE',         -- Engenheiro entregou (EM_ANDAMENTO → ENTREGUE)
      'APROVADA',         -- Licitante aprovou (ENTREGUE → APROVADA)
      'REVISAO',          -- Licitante pediu revisão (ENTREGUE → EM_REVISAO)
      'RETOMADA',         -- Engenheiro retomou após revisão (EM_REVISAO → EM_ANDAMENTO)
      'COMENTARIO',       -- Comentário livre de qualquer parte
      'CANCELADA'         -- Solicitação cancelada
    )),

  -- Mensagem/comentário da interação
  mensagem        TEXT,

  -- Arquivo anexado nesta interação (path no storage)
  arquivo_nome    TEXT,
  arquivo_path    TEXT,
  arquivo_size    INTEGER DEFAULT 0,

  -- Número da revisão (0 = primeira ida, 1 = primeira revisão, etc.)
  numero_revisao  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_interacao_solicitacao ON licitacao_solicitacao_interacoes(solicitacao_id);
CREATE INDEX IF NOT EXISTS idx_interacao_autor ON licitacao_solicitacao_interacoes(autor_id);

-- RLS
ALTER TABLE licitacao_solicitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitacao_solicitacao_interacoes ENABLE ROW LEVEL SECURITY;

-- SuperAdmin vê tudo
CREATE POLICY "solic_superadmin_select" ON licitacao_solicitacoes FOR SELECT
  USING (is_superadmin());
CREATE POLICY "solic_superadmin_all" ON licitacao_solicitacoes FOR ALL
  USING (is_superadmin());

CREATE POLICY "interacao_superadmin_select" ON licitacao_solicitacao_interacoes FOR SELECT
  USING (is_superadmin());
CREATE POLICY "interacao_superadmin_all" ON licitacao_solicitacao_interacoes FOR ALL
  USING (is_superadmin());

-- Usuários da mesma empresa veem as solicitações
CREATE POLICY "solic_empresa_select" ON licitacao_solicitacoes FOR SELECT
  USING (empresa_id = get_my_empresa_id());
CREATE POLICY "solic_empresa_insert" ON licitacao_solicitacoes FOR INSERT
  WITH CHECK (empresa_id = get_my_empresa_id());
CREATE POLICY "solic_empresa_update" ON licitacao_solicitacoes FOR UPDATE
  USING (empresa_id = get_my_empresa_id());

-- Interações: visível para quem vê a solicitação (mesma empresa)
CREATE POLICY "interacao_empresa_select" ON licitacao_solicitacao_interacoes FOR SELECT
  USING (
    solicitacao_id IN (
      SELECT id FROM licitacao_solicitacoes WHERE empresa_id = get_my_empresa_id()
    )
  );
CREATE POLICY "interacao_empresa_insert" ON licitacao_solicitacao_interacoes FOR INSERT
  WITH CHECK (
    solicitacao_id IN (
      SELECT id FROM licitacao_solicitacoes WHERE empresa_id = get_my_empresa_id()
    )
  );

-- Storage bucket para anexos de solicitações (caso não exista)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('solicitacoes', 'solicitacoes', true)
-- ON CONFLICT DO NOTHING;
