-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX: RLS para contratos e obras com contrato_gestores
-- Rodar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- Remove TODAS as policies de SELECT existentes (independente do nome)
DO $$ 
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'contratos' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON contratos', pol.policyname);
  END LOOP;
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'obras' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON obras', pol.policyname);
  END LOOP;
END $$;

-- Recria policy de contratos: visível se admin, dono, equipe, OU gestor atribuído
CREATE POLICY "contratos_select" ON contratos FOR SELECT
  USING (
    is_team_visible(user_id)
    OR EXISTS (
      SELECT 1 FROM contrato_gestores cg
      WHERE cg.contrato_id = id
      AND (
        cg.gestor_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM perfis p 
          WHERE p.id = auth.uid() 
          AND p.gestor_id = cg.gestor_id 
          AND p.ativo = TRUE
        )
      )
    )
  );

-- Recria policy de obras: visível se admin, dono, equipe, OU gestor do contrato atribuído
CREATE POLICY "obras_select" ON obras FOR SELECT
  USING (
    is_team_visible(user_id)
    OR EXISTS (
      SELECT 1 FROM contrato_gestores cg
      WHERE cg.contrato_id = contrato_id
      AND (
        cg.gestor_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM perfis p 
          WHERE p.id = auth.uid() 
          AND p.gestor_id = cg.gestor_id 
          AND p.ativo = TRUE
        )
      )
    )
  );

-- Verifica que foram criadas
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE tablename IN ('contratos', 'obras') AND cmd = 'SELECT';

-- Também corrige servicos, medicoes e linhas_memoria para gestores atribuídos
DO $$ 
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'servicos' AND cmd = 'SELECT'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON servicos', pol.policyname); END LOOP;
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'medicoes' AND cmd = 'SELECT'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON medicoes', pol.policyname); END LOOP;
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'linhas_memoria' AND cmd = 'SELECT'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON linhas_memoria', pol.policyname); END LOOP;
END $$;

CREATE POLICY "servicos_select" ON servicos FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM obras o WHERE o.id = obra_id AND is_team_visible(o.user_id))
    OR EXISTS (
      SELECT 1 FROM contrato_gestores cg
      WHERE cg.contrato_id = contrato_id
      AND (cg.gestor_id = auth.uid() OR EXISTS (SELECT 1 FROM perfis p WHERE p.id = auth.uid() AND p.gestor_id = cg.gestor_id AND p.ativo))
    )
  );

CREATE POLICY "medicoes_select" ON medicoes FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM obras o WHERE o.id = obra_id AND is_team_visible(o.user_id))
    OR EXISTS (
      SELECT 1 FROM contrato_gestores cg
      WHERE cg.contrato_id = contrato_id
      AND (cg.gestor_id = auth.uid() OR EXISTS (SELECT 1 FROM perfis p WHERE p.id = auth.uid() AND p.gestor_id = cg.gestor_id AND p.ativo))
    )
  );

CREATE POLICY "linhas_select" ON linhas_memoria FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM medicoes m
      JOIN obras o ON o.id = m.obra_id
      WHERE m.id = medicao_id
      AND (
        is_team_visible(o.user_id)
        OR EXISTS (
          SELECT 1 FROM contrato_gestores cg
          WHERE cg.contrato_id = m.contrato_id
          AND (cg.gestor_id = auth.uid() OR EXISTS (SELECT 1 FROM perfis p WHERE p.id = auth.uid() AND p.gestor_id = cg.gestor_id AND p.ativo))
        )
      )
    )
  );

-- Verifica todas
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE tablename IN ('contratos','obras','servicos','medicoes','linhas_memoria') AND cmd = 'SELECT'
ORDER BY tablename;
