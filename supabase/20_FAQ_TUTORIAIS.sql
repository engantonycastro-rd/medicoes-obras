-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: FAQ / Tutoriais do Sistema
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS faq_tutoriais (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por      UUID REFERENCES perfis(id),

  titulo          TEXT NOT NULL,
  categoria       TEXT NOT NULL DEFAULT 'Geral',
  conteudo        TEXT NOT NULL,                     -- Markdown/HTML
  midias          JSONB DEFAULT '[]'::jsonb,         -- [{tipo:'imagem'|'video', url, nome, path}]
  ordem           INTEGER DEFAULT 0,
  ativo           BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_faq_ordem ON faq_tutoriais(ordem, created_at);

DROP TRIGGER IF EXISTS set_updated_faq ON faq_tutoriais;
CREATE TRIGGER set_updated_faq BEFORE UPDATE ON faq_tutoriais
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE faq_tutoriais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "faq_select" ON faq_tutoriais FOR SELECT USING (is_ativo());
CREATE POLICY "faq_insert" ON faq_tutoriais FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "faq_update" ON faq_tutoriais FOR UPDATE USING (is_admin());
CREATE POLICY "faq_delete" ON faq_tutoriais FOR DELETE USING (is_admin());

-- Storage bucket para mídias do FAQ
INSERT INTO storage.buckets (id, name, public) VALUES ('faq', 'faq', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "faq_storage_upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'faq' AND auth.role() = 'authenticated');
CREATE POLICY "faq_storage_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'faq');
CREATE POLICY "faq_storage_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'faq' AND is_admin());

SELECT 'OK!' AS status;
