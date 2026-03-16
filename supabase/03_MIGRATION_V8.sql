-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION V8: Contrato > Obras > Medições + Logos + Fotos
-- Execute no SQL Editor do Supabase
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. NOVA TABELA: obras ────────────────────────────────────────────────────
-- Cada contrato pode ter múltiplas obras

CREATE TABLE IF NOT EXISTS obras (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  contrato_id         UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  user_id             UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  nome_obra           TEXT NOT NULL,
  local_obra          TEXT NOT NULL,
  numero_contrato     TEXT,          -- número específico da obra (pode diferir do contrato pai)
  orgao_subdivisao    TEXT,          -- ex: "SEEC / 3ª GRE"

  desconto_percentual NUMERIC(8,6) NOT NULL DEFAULT 0,
  bdi_percentual      NUMERIC(8,6) NOT NULL DEFAULT 0.25,
  data_base_planilha  TEXT,
  prazo_execucao_dias INTEGER DEFAULT 120,
  data_ordem_servico  DATE,

  status              TEXT NOT NULL CHECK (status IN ('ATIVA','CONCLUIDA','SUSPENSA')) DEFAULT 'ATIVA'
);

CREATE TRIGGER trg_obras_updated_at
  BEFORE UPDATE ON obras
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_obras_contrato ON obras(contrato_id);

-- ─── 2. NOVA TABELA: logos_sistema ───────────────────────────────────────────
-- Logos cadastradas pelo admin no Config

CREATE TABLE IF NOT EXISTS logos_sistema (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  nome        TEXT NOT NULL,         -- "Estado do RN", "SEEC", "FUNDASE"
  descricao   TEXT,
  base64      TEXT NOT NULL,         -- imagem em base64
  criado_por  UUID REFERENCES auth.users(id)
);

-- ─── 3. NOVA TABELA: fotos_medicao ───────────────────────────────────────────
-- Relatório fotográfico vinculado a uma medição

CREATE TABLE IF NOT EXISTS fotos_medicao (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  medicao_id  UUID NOT NULL REFERENCES medicoes(id) ON DELETE CASCADE,
  servico_id  UUID REFERENCES servicos(id) ON DELETE SET NULL,
  base64      TEXT NOT NULL,
  legenda     TEXT NOT NULL DEFAULT '',
  ordem       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_fotos_medicao ON fotos_medicao(medicao_id);

-- ─── 4. MIGRAR contratos existentes → adicionar obra_id nas tabelas ──────────
-- Adiciona coluna obra_id em servicos e medicoes

ALTER TABLE servicos  ADD COLUMN IF NOT EXISTS obra_id UUID REFERENCES obras(id) ON DELETE CASCADE;
ALTER TABLE medicoes  ADD COLUMN IF NOT EXISTS obra_id UUID REFERENCES obras(id) ON DELETE CASCADE;

-- ─── 5. MIGRAR dados existentes ───────────────────────────────────────────────
-- Para cada contrato existente, cria uma obra padrão e migra os dados

DO $$
DECLARE
  c RECORD;
  nova_obra_id UUID;
BEGIN
  FOR c IN SELECT * FROM contratos LOOP
    -- Cria obra default para o contrato
    INSERT INTO obras (
      contrato_id, user_id, nome_obra, local_obra, numero_contrato,
      orgao_subdivisao, desconto_percentual, bdi_percentual,
      data_base_planilha, prazo_execucao_dias, data_ordem_servico, status
    ) VALUES (
      c.id, c.user_id, c.nome_obra, c.local_obra, c.numero_contrato,
      c.orgao_subdivisao, c.desconto_percentual, c.bdi_percentual,
      c.data_base_planilha, c.prazo_execucao_dias, c.data_ordem_servico,
      CASE c.status WHEN 'ATIVO' THEN 'ATIVA' WHEN 'CONCLUIDO' THEN 'CONCLUIDA' ELSE 'SUSPENSA' END
    )
    RETURNING id INTO nova_obra_id;

    -- Atualiza servicos e medicoes para apontar para essa obra
    UPDATE servicos SET obra_id = nova_obra_id WHERE contrato_id = c.id;
    UPDATE medicoes SET obra_id = nova_obra_id WHERE contrato_id = c.id;
  END LOOP;
END $$;

-- ─── 6. RLS para as novas tabelas ────────────────────────────────────────────

ALTER TABLE obras          ENABLE ROW LEVEL SECURITY;
ALTER TABLE logos_sistema  ENABLE ROW LEVEL SECURITY;
ALTER TABLE fotos_medicao  ENABLE ROW LEVEL SECURITY;

-- OBRAS
CREATE POLICY "obras_select_admin"   ON obras FOR SELECT USING (is_admin());
CREATE POLICY "obras_select_proprio" ON obras FOR SELECT USING (auth.uid() = user_id AND is_ativo());
CREATE POLICY "obras_insert"         ON obras FOR INSERT WITH CHECK ((auth.uid() = user_id OR is_admin()) AND is_ativo());
CREATE POLICY "obras_update_proprio" ON obras FOR UPDATE USING (auth.uid() = user_id AND is_ativo());
CREATE POLICY "obras_update_admin"   ON obras FOR UPDATE USING (is_admin());
CREATE POLICY "obras_delete_proprio" ON obras FOR DELETE USING (auth.uid() = user_id AND is_ativo());
CREATE POLICY "obras_delete_admin"   ON obras FOR DELETE USING (is_admin());

-- LOGOS (admin gerencia, todos ativos veem)
CREATE POLICY "logos_select" ON logos_sistema FOR SELECT USING (is_ativo() OR is_admin());
CREATE POLICY "logos_insert" ON logos_sistema FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "logos_update" ON logos_sistema FOR UPDATE USING (is_admin());
CREATE POLICY "logos_delete" ON logos_sistema FOR DELETE USING (is_admin());

-- FOTOS
CREATE POLICY "fotos_select" ON fotos_medicao FOR SELECT
  USING (is_admin() OR EXISTS (
    SELECT 1 FROM medicoes m JOIN obras o ON o.id = m.obra_id
    WHERE m.id = medicao_id AND (o.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));
CREATE POLICY "fotos_insert" ON fotos_medicao FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM medicoes m JOIN obras o ON o.id = m.obra_id
    WHERE m.id = medicao_id AND (o.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));
CREATE POLICY "fotos_update" ON fotos_medicao FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM medicoes m JOIN obras o ON o.id = m.obra_id
    WHERE m.id = medicao_id AND (o.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));
CREATE POLICY "fotos_delete" ON fotos_medicao FOR DELETE
  USING (is_admin() OR EXISTS (
    SELECT 1 FROM medicoes m JOIN obras o ON o.id = m.obra_id
    WHERE m.id = medicao_id AND (o.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));

-- Atualiza policies de servicos e medicoes para incluir obra_id
DROP POLICY IF EXISTS "servicos_select" ON servicos;
DROP POLICY IF EXISTS "servicos_insert" ON servicos;
DROP POLICY IF EXISTS "servicos_update" ON servicos;
DROP POLICY IF EXISTS "servicos_delete" ON servicos;

CREATE POLICY "servicos_select" ON servicos FOR SELECT
  USING (is_admin() OR EXISTS (
    SELECT 1 FROM obras o WHERE o.id = obra_id AND (o.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ) OR EXISTS (
    SELECT 1 FROM contratos c WHERE c.id = contrato_id AND (c.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));

CREATE POLICY "servicos_insert" ON servicos FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM contratos c WHERE c.id = contrato_id AND (c.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));

CREATE POLICY "servicos_update" ON servicos FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM contratos c WHERE c.id = contrato_id AND (c.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));

CREATE POLICY "servicos_delete" ON servicos FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM contratos c WHERE c.id = contrato_id AND (c.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));

-- Verificação final
SELECT 'obras' as tabela, count(*) FROM obras
UNION ALL SELECT 'logos_sistema', count(*) FROM logos_sistema
UNION ALL SELECT 'fotos_medicao', count(*) FROM fotos_medicao;
