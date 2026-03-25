-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 43: Repositório de documentos das obras
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS obra_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  pasta TEXT NOT NULL DEFAULT 'fotos', -- 'fotos', 'projetos', 'administrativos'
  nome_arquivo TEXT NOT NULL,
  url TEXT NOT NULL,
  tamanho_bytes BIGINT DEFAULT 0,
  tipo_mime TEXT,
  origem TEXT DEFAULT 'upload', -- 'upload', 'apontamento'
  apontamento_id UUID, -- se veio de apontamento
  observacao TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_obra_docs_obra ON obra_documentos(obra_id);
CREATE INDEX IF NOT EXISTS idx_obra_docs_pasta ON obra_documentos(obra_id, pasta);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('obra-documentos', 'obra-documentos', false)
ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE obra_documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "obra_docs_all" ON obra_documentos FOR ALL USING (true) WITH CHECK (true);

-- Storage policies
CREATE POLICY "obra_docs_upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'obra-documentos');
CREATE POLICY "obra_docs_read" ON storage.objects FOR SELECT USING (bucket_id = 'obra-documentos');
CREATE POLICY "obra_docs_delete" ON storage.objects FOR DELETE USING (bucket_id = 'obra-documentos');
