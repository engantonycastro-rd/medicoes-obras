-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Setor de Orçamentos — Revisão de Orçamentos
-- Rodar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- Tabela principal
CREATE TABLE IF NOT EXISTS orcamentos_revisao (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Solicitação
  solicitante_id        UUID NOT NULL REFERENCES perfis(id),
  obra_id               UUID REFERENCES obras(id),
  contrato_id           UUID REFERENCES contratos(id),
  titulo                TEXT NOT NULL,
  descricao             TEXT,
  prazo_retorno         DATE NOT NULL,
  urgencia              TEXT NOT NULL DEFAULT 'NORMAL' CHECK (urgencia IN ('BAIXA','NORMAL','ALTA','URGENTE')),

  -- Arquivo original (enviado pelo gestor/engenheiro)
  arquivo_original_url  TEXT,
  arquivo_original_nome TEXT,
  arquivo_original_size INTEGER,

  -- Status e fila
  status                TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE','EM_REVISAO','CONCLUIDO','CANCELADO')),
  ordem_atendimento     SERIAL,

  -- Revisão (preenchido pelo admin)
  revisor_id            UUID REFERENCES perfis(id),
  data_inicio_revisao   TIMESTAMPTZ,
  data_conclusao        TIMESTAMPTZ,

  -- Entrega
  arquivo_revisado_url  TEXT,
  arquivo_revisado_nome TEXT,
  arquivo_revisado_size INTEGER,
  observacoes_revisor   TEXT,
  comparativo_resumo    JSONB DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_orc_status ON orcamentos_revisao(status);
CREATE INDEX IF NOT EXISTS idx_orc_solicitante ON orcamentos_revisao(solicitante_id);
CREATE INDEX IF NOT EXISTS idx_orc_revisor ON orcamentos_revisao(revisor_id);
CREATE INDEX IF NOT EXISTS idx_orc_ordem ON orcamentos_revisao(ordem_atendimento);

-- Trigger updated_at
DROP TRIGGER IF EXISTS set_updated_orc ON orcamentos_revisao;
CREATE TRIGGER set_updated_orc BEFORE UPDATE ON orcamentos_revisao
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE orcamentos_revisao ENABLE ROW LEVEL SECURITY;

-- Admin vê tudo
CREATE POLICY "orc_admin_all" ON orcamentos_revisao FOR ALL USING (is_admin());

-- Solicitante vê e cria os seus
CREATE POLICY "orc_solicitante_select" ON orcamentos_revisao FOR SELECT
  USING (solicitante_id = auth.uid());
CREATE POLICY "orc_solicitante_insert" ON orcamentos_revisao FOR INSERT
  WITH CHECK (solicitante_id = auth.uid());
CREATE POLICY "orc_solicitante_update" ON orcamentos_revisao FOR UPDATE
  USING (solicitante_id = auth.uid() AND status = 'PENDENTE');

-- ═══ STORAGE BUCKET ═══
-- Criar manualmente no Supabase Dashboard > Storage > New Bucket:
-- Nome: orcamentos
-- Public: false (privado)
-- Depois adicione estas policies no SQL:

INSERT INTO storage.buckets (id, name, public) VALUES ('orcamentos', 'orcamentos', false)
ON CONFLICT (id) DO NOTHING;

-- Policies de storage
CREATE POLICY "orc_storage_upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'orcamentos' AND auth.role() = 'authenticated');

CREATE POLICY "orc_storage_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'orcamentos' AND auth.role() = 'authenticated');

CREATE POLICY "orc_storage_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'orcamentos' AND is_admin());

-- Verifica
SELECT 'Migration OK!' AS status,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='orcamentos_revisao') AS tabela_ok,
  EXISTS(SELECT 1 FROM storage.buckets WHERE id='orcamentos') AS bucket_ok;
