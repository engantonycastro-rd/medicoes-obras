-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Upgrade Contratos — Estado/Cidade, Gestores, Mover Obras
-- Rodar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Estado e cidade no contrato
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS estado TEXT;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS cidade TEXT;
CREATE INDEX IF NOT EXISTS idx_contratos_estado ON contratos(estado);

-- 2. Tabela N:N — contrato ↔ gestores
CREATE TABLE IF NOT EXISTS contrato_gestores (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contrato_id UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  gestor_id   UUID NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contrato_id, gestor_id)
);

CREATE INDEX IF NOT EXISTS idx_cg_contrato ON contrato_gestores(contrato_id);
CREATE INDEX IF NOT EXISTS idx_cg_gestor ON contrato_gestores(gestor_id);

-- RLS
ALTER TABLE contrato_gestores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cg_select" ON contrato_gestores FOR SELECT USING (is_ativo());
CREATE POLICY "cg_insert" ON contrato_gestores FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "cg_delete" ON contrato_gestores FOR DELETE USING (is_admin());

-- 3. Ordem das obras dentro do contrato
ALTER TABLE obras ADD COLUMN IF NOT EXISTS ordem INTEGER DEFAULT 0;

-- 4. Atualiza RLS de contratos para incluir gestores atribuídos
-- Drop e recria as policies de SELECT
DROP POLICY IF EXISTS "contratos_select" ON contratos;
CREATE POLICY "contratos_select" ON contratos FOR SELECT
  USING (
    is_admin()
    OR is_team_visible(user_id)
    OR EXISTS (
      SELECT 1 FROM contrato_gestores cg
      WHERE cg.contrato_id = id
      AND (
        cg.gestor_id = auth.uid()
        OR EXISTS (SELECT 1 FROM perfis p WHERE p.id = auth.uid() AND p.gestor_id = cg.gestor_id AND p.ativo = TRUE)
      )
    )
  );

-- Mesma coisa para obras
DROP POLICY IF EXISTS "obras_select" ON obras;
CREATE POLICY "obras_select" ON obras FOR SELECT
  USING (
    is_admin()
    OR is_team_visible(user_id)
    OR EXISTS (
      SELECT 1 FROM contrato_gestores cg
      WHERE cg.contrato_id = contrato_id
      AND (
        cg.gestor_id = auth.uid()
        OR EXISTS (SELECT 1 FROM perfis p WHERE p.id = auth.uid() AND p.gestor_id = cg.gestor_id AND p.ativo = TRUE)
      )
    )
  );

-- Verifica
SELECT 'Migration OK!' AS status,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='contratos' AND column_name='estado') AS contratos_estado,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='contrato_gestores') AS contrato_gestores,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='obras' AND column_name='ordem') AS obras_ordem;
