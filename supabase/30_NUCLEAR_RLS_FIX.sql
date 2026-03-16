-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX NUCLEAR — Dropar TODAS as policies e recriar do zero
-- O problema: policies antigas e novas coexistindo causam conflito
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── PASSO 1: VER TODAS AS POLICIES ATIVAS ──────────────────────────────────
SELECT schemaname, tablename, policyname, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('contratos','obras','servicos','medicoes','perfis','logos_sistema','linhas_memoria','fotos_medicao')
ORDER BY tablename, policyname;

-- ─── PASSO 2: DROPAR TODAS AS POLICIES DAS TABELAS PRINCIPAIS ──────────────

DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT schemaname, tablename, policyname 
    FROM pg_policies 
    WHERE tablename IN (
      'contratos','obras','servicos','medicoes','perfis',
      'logos_sistema','linhas_memoria','fotos_medicao',
      'notificacoes','auditoria','orcamentos_revisao',
      'kanban_cards','kanban_itens','apontamentos',
      'apontamento_fotos','apontamento_mao_obra','apontamento_pqe',
      'apontador_obras','diario_obra','aditivos',
      'cronograma_marcos','checklist_preenchido','checklist_respostas',
      'subempreiteiros','subempreiteiro_obras','subempreiteiro_medicoes',
      'subempreiteiro_documentos','rdo','custos_erp',
      'contrato_gestores','zonas_acesso','usuario_zonas',
      'funcoes_mao_obra','checklist_itens_modelo','totvs_config',
      'import_erp_log','faq_tutoriais'
    )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
  RAISE NOTICE 'Todas as policies dropadas!';
END $$;

-- ─── PASSO 3: RECRIAR FUNÇÕES HELPER (garantir que existem) ─────────────────

CREATE OR REPLACE FUNCTION get_my_empresa_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT empresa_id FROM public.perfis WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'SUPERADMIN');
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role IN ('ADMIN','SUPERADMIN'));
$$;

CREATE OR REPLACE FUNCTION is_ativo()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND ativo = TRUE);
$$;

CREATE OR REPLACE FUNCTION is_apontador_obra(p_obra_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM public.apontador_obras WHERE user_id = auth.uid() AND obra_id = p_obra_id);
$$;

-- ─── PASSO 4: HELPER — mesmo empresa (SECURITY DEFINER, bypass RLS) ────────

CREATE OR REPLACE FUNCTION my_empresa_contratos()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM public.contratos WHERE empresa_id = (SELECT empresa_id FROM public.perfis WHERE id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION my_empresa_obras()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT o.id FROM public.obras o 
  JOIN public.contratos c ON c.id = o.contrato_id 
  WHERE c.empresa_id = (SELECT empresa_id FROM public.perfis WHERE id = auth.uid());
$$;

-- ─── PASSO 5: POLICIES NOVAS — SIMPLES E FUNCIONAIS ────────────────────────

-- PERFIS
CREATE POLICY "perfis_all" ON perfis FOR ALL
  USING (
    id = auth.uid()
    OR empresa_id = get_my_empresa_id()
    OR is_superadmin()
  )
  WITH CHECK (
    id = auth.uid()
    OR empresa_id = get_my_empresa_id()
    OR is_superadmin()
  );

-- CONTRATOS
CREATE POLICY "contratos_select" ON contratos FOR SELECT
  USING (empresa_id = get_my_empresa_id() OR is_superadmin());

CREATE POLICY "contratos_insert" ON contratos FOR INSERT
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_superadmin());

CREATE POLICY "contratos_update" ON contratos FOR UPDATE
  USING (empresa_id = get_my_empresa_id() OR is_superadmin());

CREATE POLICY "contratos_delete" ON contratos FOR DELETE
  USING (is_admin() OR is_superadmin());

-- OBRAS
CREATE POLICY "obras_select" ON obras FOR SELECT
  USING (contrato_id IN (SELECT my_empresa_contratos()) OR is_superadmin() OR is_apontador_obra(id));

CREATE POLICY "obras_insert" ON obras FOR INSERT
  WITH CHECK (contrato_id IN (SELECT my_empresa_contratos()) OR is_superadmin());

CREATE POLICY "obras_update" ON obras FOR UPDATE
  USING (contrato_id IN (SELECT my_empresa_contratos()) OR is_superadmin());

CREATE POLICY "obras_delete" ON obras FOR DELETE
  USING (is_admin() OR is_superadmin());

-- SERVICOS
CREATE POLICY "servicos_select" ON servicos FOR SELECT
  USING (obra_id IN (SELECT my_empresa_obras()) OR is_superadmin());

CREATE POLICY "servicos_insert" ON servicos FOR INSERT
  WITH CHECK (obra_id IN (SELECT my_empresa_obras()) OR is_superadmin());

CREATE POLICY "servicos_update" ON servicos FOR UPDATE
  USING (obra_id IN (SELECT my_empresa_obras()) OR is_superadmin());

CREATE POLICY "servicos_delete" ON servicos FOR DELETE
  USING (is_admin() OR is_superadmin());

-- MEDICOES
CREATE POLICY "medicoes_select" ON medicoes FOR SELECT
  USING (obra_id IN (SELECT my_empresa_obras()) OR is_superadmin());

CREATE POLICY "medicoes_insert" ON medicoes FOR INSERT
  WITH CHECK (obra_id IN (SELECT my_empresa_obras()) OR is_superadmin());

CREATE POLICY "medicoes_update" ON medicoes FOR UPDATE
  USING (obra_id IN (SELECT my_empresa_obras()) OR is_superadmin());

CREATE POLICY "medicoes_delete" ON medicoes FOR DELETE
  USING (is_admin() OR is_superadmin());

-- LINHAS_MEMORIA
CREATE POLICY "linhas_select" ON linhas_memoria FOR SELECT
  USING (medicao_id IN (SELECT id FROM medicoes WHERE obra_id IN (SELECT my_empresa_obras())) OR is_superadmin());

CREATE POLICY "linhas_insert" ON linhas_memoria FOR INSERT
  WITH CHECK (medicao_id IN (SELECT id FROM medicoes WHERE obra_id IN (SELECT my_empresa_obras())) OR is_superadmin());

CREATE POLICY "linhas_update" ON linhas_memoria FOR UPDATE
  USING (medicao_id IN (SELECT id FROM medicoes WHERE obra_id IN (SELECT my_empresa_obras())) OR is_superadmin());

CREATE POLICY "linhas_delete" ON linhas_memoria FOR DELETE
  USING (medicao_id IN (SELECT id FROM medicoes WHERE obra_id IN (SELECT my_empresa_obras())) OR is_superadmin());

-- FOTOS_MEDICAO
CREATE POLICY "fotos_select" ON fotos_medicao FOR SELECT
  USING (medicao_id IN (SELECT id FROM medicoes WHERE obra_id IN (SELECT my_empresa_obras())) OR is_superadmin());

CREATE POLICY "fotos_all" ON fotos_medicao FOR ALL
  USING (medicao_id IN (SELECT id FROM medicoes WHERE obra_id IN (SELECT my_empresa_obras())) OR is_superadmin());

-- LOGOS
CREATE POLICY "logos_all" ON logos_sistema FOR ALL
  USING (empresa_id = get_my_empresa_id() OR empresa_id IS NULL OR is_superadmin())
  WITH CHECK (TRUE);

-- NOTIFICACOES
CREATE POLICY "notif_all" ON notificacoes FOR ALL
  USING (user_id = auth.uid() OR is_superadmin())
  WITH CHECK (TRUE);

-- AUDITORIA
CREATE POLICY "audit_select" ON auditoria FOR SELECT
  USING (is_admin() OR is_superadmin());

-- ORCAMENTOS_REVISAO
CREATE POLICY "orc_select" ON orcamentos_revisao FOR SELECT
  USING (obra_id IN (SELECT my_empresa_obras()) OR is_superadmin());

CREATE POLICY "orc_insert" ON orcamentos_revisao FOR INSERT
  WITH CHECK (obra_id IN (SELECT my_empresa_obras()) OR is_superadmin());

CREATE POLICY "orc_update" ON orcamentos_revisao FOR UPDATE
  USING (obra_id IN (SELECT my_empresa_obras()) OR is_superadmin());

CREATE POLICY "orc_delete" ON orcamentos_revisao FOR DELETE
  USING (is_admin() OR is_superadmin());

-- KANBAN
CREATE POLICY "kanban_cards_all" ON kanban_cards FOR ALL
  USING (obra_id IN (SELECT my_empresa_obras()) OR is_superadmin() OR is_apontador_obra(obra_id))
  WITH CHECK (TRUE);

CREATE POLICY "kanban_itens_all" ON kanban_itens FOR ALL
  USING (card_id IN (SELECT id FROM kanban_cards WHERE obra_id IN (SELECT my_empresa_obras())) OR is_superadmin())
  WITH CHECK (TRUE);

-- CONTRATO_GESTORES
CREATE POLICY "cg_all" ON contrato_gestores FOR ALL
  USING (contrato_id IN (SELECT my_empresa_contratos()) OR is_superadmin())
  WITH CHECK (TRUE);

-- APONTAMENTOS E RELACIONADOS
CREATE POLICY "apontamentos_all" ON apontamentos FOR ALL
  USING (obra_id IN (SELECT my_empresa_obras()) OR is_superadmin() OR is_apontador_obra(obra_id))
  WITH CHECK (TRUE);

CREATE POLICY "apontamento_fotos_all" ON apontamento_fotos FOR ALL
  USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "apontamento_mo_all" ON apontamento_mao_obra FOR ALL
  USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "apontamento_pqe_all" ON apontamento_pqe FOR ALL
  USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "apontador_obras_all" ON apontador_obras FOR ALL
  USING (TRUE) WITH CHECK (TRUE);

-- FUNCOES MAO OBRA (global)
CREATE POLICY "funcoes_all" ON funcoes_mao_obra FOR ALL
  USING (TRUE) WITH CHECK (is_admin() OR is_superadmin());

-- DIARIO DE OBRA
CREATE POLICY "diario_all" ON diario_obra FOR ALL
  USING (obra_id IN (SELECT my_empresa_obras()) OR is_superadmin())
  WITH CHECK (TRUE);

-- ADITIVOS
CREATE POLICY "aditivos_all" ON aditivos FOR ALL
  USING (contrato_id IN (SELECT my_empresa_contratos()) OR is_superadmin())
  WITH CHECK (TRUE);

-- CRONOGRAMA
CREATE POLICY "cronograma_all" ON cronograma_marcos FOR ALL
  USING (obra_id IN (SELECT my_empresa_obras()) OR is_superadmin())
  WITH CHECK (TRUE);

-- CHECKLIST
CREATE POLICY "chk_modelo_select" ON checklist_itens_modelo FOR SELECT
  USING (TRUE);

CREATE POLICY "chk_modelo_admin" ON checklist_itens_modelo FOR ALL
  USING (is_admin() OR is_superadmin()) WITH CHECK (TRUE);

CREATE POLICY "chk_preenchido_all" ON checklist_preenchido FOR ALL
  USING (obra_id IN (SELECT my_empresa_obras()) OR is_superadmin())
  WITH CHECK (TRUE);

CREATE POLICY "chk_respostas_all" ON checklist_respostas FOR ALL
  USING (TRUE) WITH CHECK (TRUE);

-- SUBEMPREITEIROS
CREATE POLICY "sub_all" ON subempreiteiros FOR ALL
  USING (empresa_id = get_my_empresa_id() OR empresa_id IS NULL OR is_superadmin())
  WITH CHECK (TRUE);

CREATE POLICY "sub_obras_all" ON subempreiteiro_obras FOR ALL
  USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "sub_med_all" ON subempreiteiro_medicoes FOR ALL
  USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "sub_doc_all" ON subempreiteiro_documentos FOR ALL
  USING (TRUE) WITH CHECK (TRUE);

-- RDO
CREATE POLICY "rdo_all" ON rdo FOR ALL
  USING (obra_id IN (SELECT my_empresa_obras()) OR is_superadmin())
  WITH CHECK (TRUE);

-- CUSTOS ERP
CREATE POLICY "custos_all" ON custos_erp FOR ALL
  USING (is_admin() OR is_superadmin())
  WITH CHECK (TRUE);

-- TOTVS CONFIG
CREATE POLICY "totvs_all" ON totvs_config FOR ALL
  USING (is_admin() OR is_superadmin())
  WITH CHECK (TRUE);

-- IMPORT ERP LOG  
CREATE POLICY "import_all" ON import_erp_log FOR ALL
  USING (is_admin() OR is_superadmin())
  WITH CHECK (TRUE);

-- ZONAS ACESSO
CREATE POLICY "zonas_all" ON zonas_acesso FOR ALL
  USING (is_admin() OR is_superadmin())
  WITH CHECK (TRUE);

CREATE POLICY "uz_all" ON usuario_zonas FOR ALL
  USING (TRUE) WITH CHECK (TRUE);

-- FAQ (global)
CREATE POLICY "faq_select" ON faq_tutoriais FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "faq_admin" ON faq_tutoriais FOR ALL
  USING (is_admin() OR is_superadmin()) WITH CHECK (TRUE);

-- EMPRESAS
CREATE POLICY "empresas_select" ON empresas FOR SELECT
  USING (is_superadmin() OR id = get_my_empresa_id());

CREATE POLICY "empresas_admin" ON empresas FOR ALL
  USING (is_superadmin()) WITH CHECK (is_superadmin());

-- EMPRESA_MODULOS
CREATE POLICY "modulos_select" ON empresa_modulos FOR SELECT
  USING (is_superadmin() OR empresa_id = get_my_empresa_id());

CREATE POLICY "modulos_admin" ON empresa_modulos FOR ALL
  USING (is_superadmin()) WITH CHECK (is_superadmin());

-- ─── VERIFICAÇÃO ────────────────────────────────────────────────────────────

SELECT tablename, COUNT(*) as num_policies
FROM pg_policies 
WHERE schemaname = 'public'
GROUP BY tablename 
ORDER BY tablename;
