-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Sistema de Equipes — GESTOR + gestor_id
-- Rodar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Adiciona coluna gestor_id na tabela perfis
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS gestor_id UUID REFERENCES perfis(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_perfis_gestor ON perfis(gestor_id);

-- 2. Remove constraint antiga de role e adiciona nova com GESTOR
-- (a constraint pode ter nomes diferentes; tenta dropar todas as possíveis)
DO $$ BEGIN
  -- Tenta remover constraint que limita role a ADMIN/ENGENHEIRO
  ALTER TABLE perfis DROP CONSTRAINT IF EXISTS perfis_role_check;
  ALTER TABLE perfis DROP CONSTRAINT IF EXISTS check_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Adiciona nova constraint que inclui GESTOR
ALTER TABLE perfis ADD CONSTRAINT perfis_role_check
  CHECK (role IN ('ADMIN', 'GESTOR', 'ENGENHEIRO'));

-- 3. Função helper: verifica se um user_id pertence à mesma equipe do auth.uid()
-- Equipe = o gestor + todos os engenheiros com gestor_id = gestor
CREATE OR REPLACE FUNCTION is_team_visible(owner_id UUID)
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM perfis me
    WHERE me.id = auth.uid() AND me.ativo = TRUE
    AND (
      -- Sou admin → vejo tudo
      me.role = 'ADMIN'
      -- É meu próprio contrato
      OR me.id = owner_id
      -- Sou GESTOR e o dono está na minha equipe
      OR (me.role = 'GESTOR' AND EXISTS (
        SELECT 1 FROM perfis membro WHERE membro.id = owner_id AND membro.gestor_id = me.id
      ))
      -- Sou ENGENHEIRO com gestor, e o dono é meu gestor
      OR (me.gestor_id IS NOT NULL AND owner_id = me.gestor_id)
      -- Sou ENGENHEIRO com gestor, e o dono tem o mesmo gestor
      OR (me.gestor_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM perfis colega WHERE colega.id = owner_id AND colega.gestor_id = me.gestor_id
      ))
    )
  );
$$;

-- 4. Recria TODAS as policies de contratos
DROP POLICY IF EXISTS "contratos_select" ON contratos;
DROP POLICY IF EXISTS "contratos_insert" ON contratos;
DROP POLICY IF EXISTS "contratos_update" ON contratos;
DROP POLICY IF EXISTS "contratos_delete" ON contratos;

CREATE POLICY "contratos_select" ON contratos FOR SELECT
  USING (is_team_visible(user_id));
CREATE POLICY "contratos_insert" ON contratos FOR INSERT
  WITH CHECK (is_team_visible(auth.uid()));
CREATE POLICY "contratos_update" ON contratos FOR UPDATE
  USING (is_team_visible(user_id));
CREATE POLICY "contratos_delete" ON contratos FOR DELETE
  USING (is_admin() OR auth.uid() = user_id);

-- 5. Recria TODAS as policies de obras
DROP POLICY IF EXISTS "obras_select" ON obras;
DROP POLICY IF EXISTS "obras_insert" ON obras;
DROP POLICY IF EXISTS "obras_update" ON obras;
DROP POLICY IF EXISTS "obras_delete" ON obras;

CREATE POLICY "obras_select" ON obras FOR SELECT
  USING (is_team_visible(user_id));
CREATE POLICY "obras_insert" ON obras FOR INSERT
  WITH CHECK (is_team_visible(auth.uid()));
CREATE POLICY "obras_update" ON obras FOR UPDATE
  USING (is_team_visible(user_id));
CREATE POLICY "obras_delete" ON obras FOR DELETE
  USING (is_admin() OR auth.uid() = user_id);

-- 6. Recria policies de servicos (depende de obras)
DROP POLICY IF EXISTS "servicos_select" ON servicos;
DROP POLICY IF EXISTS "servicos_insert" ON servicos;
DROP POLICY IF EXISTS "servicos_update" ON servicos;
DROP POLICY IF EXISTS "servicos_delete" ON servicos;

CREATE POLICY "servicos_select" ON servicos FOR SELECT
  USING (is_admin() OR EXISTS (
    SELECT 1 FROM obras o WHERE o.id = obra_id AND is_team_visible(o.user_id)
  ));
CREATE POLICY "servicos_insert" ON servicos FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM obras o WHERE o.id = obra_id AND is_team_visible(o.user_id)
  ));
CREATE POLICY "servicos_update" ON servicos FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM obras o WHERE o.id = obra_id AND is_team_visible(o.user_id)
  ));
CREATE POLICY "servicos_delete" ON servicos FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM obras o WHERE o.id = obra_id AND is_team_visible(o.user_id)
  ));

-- 7. Recria policies de medicoes
DROP POLICY IF EXISTS "medicoes_select" ON medicoes;
DROP POLICY IF EXISTS "medicoes_insert" ON medicoes;
DROP POLICY IF EXISTS "medicoes_update" ON medicoes;
DROP POLICY IF EXISTS "medicoes_delete" ON medicoes;

CREATE POLICY "medicoes_select" ON medicoes FOR SELECT
  USING (is_admin() OR EXISTS (
    SELECT 1 FROM obras o WHERE o.id = obra_id AND is_team_visible(o.user_id)
  ));
CREATE POLICY "medicoes_insert" ON medicoes FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM obras o WHERE o.id = obra_id AND is_team_visible(o.user_id)
  ));
CREATE POLICY "medicoes_update" ON medicoes FOR UPDATE
  USING (is_admin() OR EXISTS (
    SELECT 1 FROM obras o WHERE o.id = obra_id AND is_team_visible(o.user_id)
  ));
CREATE POLICY "medicoes_delete" ON medicoes FOR DELETE
  USING (is_admin() OR EXISTS (
    SELECT 1 FROM obras o WHERE o.id = obra_id AND is_team_visible(o.user_id)
  ));

-- 8. Recria policies de linhas_memoria
DROP POLICY IF EXISTS "linhas_select" ON linhas_memoria;
DROP POLICY IF EXISTS "linhas_insert" ON linhas_memoria;
DROP POLICY IF EXISTS "linhas_update" ON linhas_memoria;
DROP POLICY IF EXISTS "linhas_delete" ON linhas_memoria;

CREATE POLICY "linhas_select" ON linhas_memoria FOR SELECT
  USING (is_admin() OR EXISTS (
    SELECT 1 FROM medicoes m JOIN obras o ON o.id = m.obra_id
    WHERE m.id = medicao_id AND is_team_visible(o.user_id)
  ));
CREATE POLICY "linhas_insert" ON linhas_memoria FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM medicoes m JOIN obras o ON o.id = m.obra_id
    WHERE m.id = medicao_id AND is_team_visible(o.user_id)
  ));
CREATE POLICY "linhas_update" ON linhas_memoria FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM medicoes m JOIN obras o ON o.id = m.obra_id
    WHERE m.id = medicao_id AND is_team_visible(o.user_id)
  ));
CREATE POLICY "linhas_delete" ON linhas_memoria FOR DELETE
  USING (is_admin() OR EXISTS (
    SELECT 1 FROM medicoes m JOIN obras o ON o.id = m.obra_id
    WHERE m.id = medicao_id AND is_team_visible(o.user_id)
  ));

-- 9. Recria policies de fotos_medicao
DROP POLICY IF EXISTS "fotos_select" ON fotos_medicao;
DROP POLICY IF EXISTS "fotos_insert" ON fotos_medicao;
DROP POLICY IF EXISTS "fotos_update" ON fotos_medicao;
DROP POLICY IF EXISTS "fotos_delete" ON fotos_medicao;

CREATE POLICY "fotos_select" ON fotos_medicao FOR SELECT
  USING (is_admin() OR EXISTS (
    SELECT 1 FROM medicoes m JOIN obras o ON o.id = m.obra_id
    WHERE m.id = medicao_id AND is_team_visible(o.user_id)
  ));
CREATE POLICY "fotos_insert" ON fotos_medicao FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM medicoes m JOIN obras o ON o.id = m.obra_id
    WHERE m.id = medicao_id AND is_team_visible(o.user_id)
  ));
CREATE POLICY "fotos_update" ON fotos_medicao FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM medicoes m JOIN obras o ON o.id = m.obra_id
    WHERE m.id = medicao_id AND is_team_visible(o.user_id)
  ));
CREATE POLICY "fotos_delete" ON fotos_medicao FOR DELETE
  USING (is_admin() OR EXISTS (
    SELECT 1 FROM medicoes m JOIN obras o ON o.id = m.obra_id
    WHERE m.id = medicao_id AND is_team_visible(o.user_id)
  ));
