-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 32 — SETOR DE LICITAÇÃO
-- Módulo completo: cadastro, proposta, lance, resultado, conversão em contrato
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. TABELA PRINCIPAL: LICITAÇÕES ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS licitacoes (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  empresa_id              UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  -- Dados do edital
  numero_edital           TEXT NOT NULL,
  modalidade              TEXT NOT NULL CHECK (modalidade IN ('PREGAO','CONCORRENCIA','TOMADA_PRECO','CONVITE','RDC','DISPENSA','INEXIGIBILIDADE')) DEFAULT 'PREGAO',
  orgao                   TEXT NOT NULL,
  uf                      TEXT NOT NULL DEFAULT 'RN',
  cidade                  TEXT NOT NULL,
  objeto                  TEXT NOT NULL,
  -- Datas
  data_publicacao         DATE,
  data_abertura           DATE,
  data_resultado          DATE,
  -- Valores
  valor_estimado          NUMERIC(14,2) DEFAULT 0,
  desconto_tipo           TEXT CHECK (desconto_tipo IN ('PERCENTUAL','VALOR')) DEFAULT 'PERCENTUAL',
  desconto_percentual     NUMERIC(8,4) DEFAULT 0,
  desconto_valor          NUMERIC(14,2) DEFAULT 0,
  valor_proposta_final    NUMERIC(14,2) DEFAULT 0,
  -- Responsáveis
  responsavel_id          UUID REFERENCES perfis(id) ON DELETE SET NULL,
  engenheiro_designado_id UUID REFERENCES perfis(id) ON DELETE SET NULL,
  -- Status
  status                  TEXT NOT NULL CHECK (status IN (
    'CADASTRADA','EM_ANALISE','PROPOSTA_PENDENTE','PROPOSTA_ENVIADA',
    'LANCE_REALIZADO','AGUARDANDO_RESULTADO','VENCEDORA',
    'NAO_CLASSIFICADA','DESISTENCIA','INABILITADA','REVOGADA'
  )) DEFAULT 'CADASTRADA',
  -- Observações
  observacoes             TEXT,
  -- Vínculo com contrato (quando vencedora e convertida)
  contrato_gerado_id      UUID REFERENCES contratos(id) ON DELETE SET NULL
);

CREATE TRIGGER trg_licitacoes_updated BEFORE UPDATE ON licitacoes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_licitacoes_empresa ON licitacoes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_licitacoes_status ON licitacoes(status);
CREATE INDEX IF NOT EXISTS idx_licitacoes_responsavel ON licitacoes(responsavel_id);

-- ─── 2. DOCUMENTOS DA LICITAÇÃO ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS licitacao_documentos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  licitacao_id    UUID NOT NULL REFERENCES licitacoes(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL CHECK (tipo IN (
    'EDITAL','PLANILHA_ORIGINAL','PLANILHA_READEQUADA',
    'PROPOSTA','CERTIDAO','ATESTADO','OUTRO'
  )) DEFAULT 'OUTRO',
  nome            TEXT NOT NULL,
  path            TEXT NOT NULL,
  size            INTEGER DEFAULT 0,
  uploaded_by     UUID REFERENCES perfis(id),
  data_validade   DATE  -- para certidões
);

CREATE INDEX IF NOT EXISTS idx_lic_docs_licitacao ON licitacao_documentos(licitacao_id);

-- ─── 3. HISTÓRICO DE AÇÕES ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS licitacao_historico (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  licitacao_id    UUID NOT NULL REFERENCES licitacoes(id) ON DELETE CASCADE,
  acao            TEXT NOT NULL,
  descricao       TEXT,
  user_id         UUID REFERENCES perfis(id)
);

CREATE INDEX IF NOT EXISTS idx_lic_hist_licitacao ON licitacao_historico(licitacao_id);

-- ─── 4. STORAGE BUCKET ──────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public) 
VALUES ('licitacoes', 'licitacoes', false) 
ON CONFLICT (id) DO NOTHING;

-- ─── 5. CARGO LICITANTE ─────────────────────────────────────────────────────

ALTER TABLE perfis DROP CONSTRAINT IF EXISTS perfis_role_check;
ALTER TABLE perfis ADD CONSTRAINT perfis_role_check 
  CHECK (role IN ('ADMIN','GESTOR','ENGENHEIRO','APONTADOR','ORCAMENTISTA','DIRETOR','SUPERADMIN','LICITANTE'));

-- ─── 6. COLUNA licitacao_id NO CONTRATO (vínculo de origem) ─────────────────

ALTER TABLE contratos ADD COLUMN IF NOT EXISTS licitacao_id UUID REFERENCES licitacoes(id) ON DELETE SET NULL;

-- ─── 7. RLS ─────────────────────────────────────────────────────────────────

ALTER TABLE licitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitacao_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitacao_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "t_licitacoes" ON licitacoes FOR ALL
  USING (empresa_id = (SELECT p.empresa_id FROM perfis p WHERE p.id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT p.empresa_id FROM perfis p WHERE p.id = auth.uid()));

CREATE POLICY "t_lic_docs" ON licitacao_documentos FOR ALL
  USING (
    licitacao_id IN (SELECT l.id FROM licitacoes l WHERE l.empresa_id = (SELECT p.empresa_id FROM perfis p WHERE p.id = auth.uid()))
  )
  WITH CHECK (TRUE);

CREATE POLICY "t_lic_hist" ON licitacao_historico FOR ALL
  USING (
    licitacao_id IN (SELECT l.id FROM licitacoes l WHERE l.empresa_id = (SELECT p.empresa_id FROM perfis p WHERE p.id = auth.uid()))
  )
  WITH CHECK (TRUE);

-- ─── 8. STORAGE POLICIES ────────────────────────────────────────────────────

CREATE POLICY "lic_storage_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'licitacoes' AND auth.role() = 'authenticated');
CREATE POLICY "lic_storage_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'licitacoes' AND auth.role() = 'authenticated');
CREATE POLICY "lic_storage_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'licitacoes' AND auth.role() = 'authenticated');

-- ─── VERIFICAÇÃO ─────────────────────────────────────────────────────────────

SELECT 'OK! Setor de Licitação criado.' AS status;
SELECT tablename, COUNT(*) as policies FROM pg_policies 
WHERE tablename IN ('licitacoes','licitacao_documentos','licitacao_historico') 
GROUP BY tablename;
