-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Cargo Orçamentista
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Atualiza constraint de role
ALTER TABLE perfis DROP CONSTRAINT IF EXISTS perfis_role_check;
ALTER TABLE perfis ADD CONSTRAINT perfis_role_check
  CHECK (role IN ('ADMIN','GESTOR','ENGENHEIRO','APONTADOR','ORCAMENTISTA'));

-- 2. Função helper para verificar se é orçamentista
CREATE OR REPLACE FUNCTION is_orcamentista()
RETURNS BOOLEAN
LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM perfis WHERE id = auth.uid() AND role = 'ORCAMENTISTA' AND ativo = TRUE);
$$;

-- 3. Orçamentista pode ver/gerenciar orcamentos_revisao (mesmo nível do admin no setor)
CREATE POLICY "orc_revisao_orcamentista_select" ON orcamentos_revisao FOR SELECT
  USING (is_orcamentista());
CREATE POLICY "orc_revisao_orcamentista_update" ON orcamentos_revisao FOR UPDATE
  USING (is_orcamentista());

-- 4. Orçamentista pode ler contratos e obras (para contexto)
-- Já tem policies de is_ativo() ou is_team_visible, mas precisamos garantir
CREATE POLICY "contratos_orcamentista_select" ON contratos FOR SELECT
  USING (is_orcamentista());
CREATE POLICY "obras_orcamentista_select" ON obras FOR SELECT
  USING (is_orcamentista());

-- 5. Orçamentista pode ler serviços (para planilhas)
CREATE POLICY "servicos_orcamentista_select" ON servicos FOR SELECT
  USING (is_orcamentista());

-- 6. Orçamentista pode ler medições (para contexto de revisão)
CREATE POLICY "medicoes_orcamentista_select" ON medicoes FOR SELECT
  USING (is_orcamentista());

-- 7. Storage: orçamentista pode upload/download no bucket orcamentos
CREATE POLICY "orc_storage_orcamentista_upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'orcamentos' AND is_orcamentista());
CREATE POLICY "orc_storage_orcamentista_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'orcamentos' AND is_orcamentista());

SELECT 'OK! Cargo ORCAMENTISTA criado.' AS status;
