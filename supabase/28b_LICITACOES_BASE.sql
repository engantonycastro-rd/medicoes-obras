-- ============================================================================
-- 28b_LICITACOES_BASE.sql
-- Tabelas base do Setor de Licitação
-- RODAR ANTES do 29_SOLICITACOES_LICITACAO.sql
-- ============================================================================

-- Tabela principal de licitações
CREATE TABLE IF NOT EXISTS licitacoes (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  empresa_id              UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,

  numero_edital           TEXT NOT NULL,
  modalidade              TEXT NOT NULL DEFAULT 'PREGAO'
    CHECK (modalidade IN ('PREGAO','CONCORRENCIA','TOMADA_PRECO','CONVITE','RDC','DISPENSA','INEXIGIBILIDADE')),
  orgao                   TEXT NOT NULL,
  uf                      TEXT NOT NULL DEFAULT 'RN',
  cidade                  TEXT NOT NULL DEFAULT '',
  objeto                  TEXT NOT NULL,

  data_publicacao         DATE,
  data_abertura           DATE,
  data_resultado          DATE,

  valor_estimado          NUMERIC(16,2) NOT NULL DEFAULT 0,
  desconto_tipo           TEXT NOT NULL DEFAULT 'PERCENTUAL' CHECK (desconto_tipo IN ('PERCENTUAL','VALOR')),
  desconto_percentual     NUMERIC(8,4) NOT NULL DEFAULT 0,
  desconto_valor          NUMERIC(16,2) NOT NULL DEFAULT 0,
  valor_proposta_final    NUMERIC(16,2) NOT NULL DEFAULT 0,

  responsavel_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  engenheiro_designado_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  status                  TEXT NOT NULL DEFAULT 'CADASTRADA'
    CHECK (status IN ('CADASTRADA','EM_ANALISE','PROPOSTA_PENDENTE','PROPOSTA_ENVIADA','LANCE_REALIZADO','AGUARDANDO_RESULTADO','VENCEDORA','NAO_CLASSIFICADA','DESISTENCIA','INABILITADA','REVOGADA')),

  observacoes             TEXT,
  contrato_gerado_id      UUID REFERENCES contratos(id) ON DELETE SET NULL
);

CREATE TRIGGER trg_licitacoes_updated
  BEFORE UPDATE ON licitacoes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_licitacoes_empresa ON licitacoes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_licitacoes_status ON licitacoes(status);
CREATE INDEX IF NOT EXISTS idx_licitacoes_responsavel ON licitacoes(responsavel_id);

-- Documentos da licitação
CREATE TABLE IF NOT EXISTS licitacao_documentos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  licitacao_id    UUID NOT NULL REFERENCES licitacoes(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL DEFAULT 'OUTRO'
    CHECK (tipo IN ('EDITAL','PLANILHA_ORIGINAL','PLANILHA_READEQUADA','PROPOSTA','CERTIDAO','ATESTADO','OUTRO')),
  nome            TEXT NOT NULL,
  path            TEXT NOT NULL,
  size            INTEGER NOT NULL DEFAULT 0,
  uploaded_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  data_validade   DATE
);

CREATE INDEX IF NOT EXISTS idx_licitacao_docs_lic ON licitacao_documentos(licitacao_id);

-- Histórico de ações da licitação
CREATE TABLE IF NOT EXISTS licitacao_historico (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  licitacao_id    UUID NOT NULL REFERENCES licitacoes(id) ON DELETE CASCADE,
  acao            TEXT NOT NULL,
  descricao       TEXT,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_licitacao_hist_lic ON licitacao_historico(licitacao_id);

-- Adicionar licitacao_id na tabela contratos (para vincular contrato gerado a partir de licitação)
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS licitacao_id UUID REFERENCES licitacoes(id) ON DELETE SET NULL;

-- Storage bucket para documentos de licitação
INSERT INTO storage.buckets (id, name, public) VALUES ('licitacoes', 'licitacoes', true)
ON CONFLICT DO NOTHING;

-- Storage policy: qualquer autenticado pode fazer upload/download
CREATE POLICY "licitacoes_storage_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'licitacoes');
CREATE POLICY "licitacoes_storage_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'licitacoes' AND auth.role() = 'authenticated');

-- ═══ RLS ═══════════════════════════════════════════════════════════════════

ALTER TABLE licitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitacao_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitacao_historico ENABLE ROW LEVEL SECURITY;

-- SuperAdmin vê tudo
CREATE POLICY "lic_superadmin" ON licitacoes FOR ALL USING (is_superadmin());
CREATE POLICY "lic_docs_superadmin" ON licitacao_documentos FOR ALL USING (is_superadmin());
CREATE POLICY "lic_hist_superadmin" ON licitacao_historico FOR ALL USING (is_superadmin());

-- Usuários da mesma empresa
CREATE POLICY "lic_empresa_select" ON licitacoes FOR SELECT
  USING (empresa_id = get_my_empresa_id());
CREATE POLICY "lic_empresa_insert" ON licitacoes FOR INSERT
  WITH CHECK (empresa_id = get_my_empresa_id());
CREATE POLICY "lic_empresa_update" ON licitacoes FOR UPDATE
  USING (empresa_id = get_my_empresa_id());
CREATE POLICY "lic_empresa_delete" ON licitacoes FOR DELETE
  USING (empresa_id = get_my_empresa_id());

CREATE POLICY "lic_docs_empresa_select" ON licitacao_documentos FOR SELECT
  USING (licitacao_id IN (SELECT id FROM licitacoes WHERE empresa_id = get_my_empresa_id()));
CREATE POLICY "lic_docs_empresa_insert" ON licitacao_documentos FOR INSERT
  WITH CHECK (licitacao_id IN (SELECT id FROM licitacoes WHERE empresa_id = get_my_empresa_id()));

CREATE POLICY "lic_hist_empresa_select" ON licitacao_historico FOR SELECT
  USING (licitacao_id IN (SELECT id FROM licitacoes WHERE empresa_id = get_my_empresa_id()));
CREATE POLICY "lic_hist_empresa_insert" ON licitacao_historico FOR INSERT
  WITH CHECK (licitacao_id IN (SELECT id FROM licitacoes WHERE empresa_id = get_my_empresa_id()));
