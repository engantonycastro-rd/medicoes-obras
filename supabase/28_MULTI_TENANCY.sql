-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 28 — MULTI-TENANCY SaaS MedObras
-- Transforma o sistema single-tenant em SaaS multi-tenant
-- RD Construtora migrada como empresa #1 (plano ILIMITADO, gratuito)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. TABELA EMPRESAS ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS empresas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Dados da empresa
  nome            TEXT NOT NULL,
  cnpj            TEXT,
  email_contato   TEXT,
  telefone        TEXT,
  logo_url        TEXT,
  -- Plano e billing
  plano           TEXT NOT NULL CHECK (plano IN ('STARTER','PROFISSIONAL','ENTERPRISE','ILIMITADO','TRIAL')) DEFAULT 'TRIAL',
  valor_mensal    NUMERIC(10,2) NOT NULL DEFAULT 0,
  cobranca_ativa  BOOLEAN NOT NULL DEFAULT FALSE,
  -- Limites do plano (0 = ilimitado)
  max_obras       INTEGER NOT NULL DEFAULT 5,
  max_usuarios    INTEGER NOT NULL DEFAULT 3,
  -- Trial / validade
  trial_inicio    DATE,
  trial_fim       DATE,
  data_vencimento DATE,
  -- Status
  status          TEXT NOT NULL CHECK (status IN ('ATIVA','BLOQUEADA','CANCELADA','TRIAL')) DEFAULT 'TRIAL',
  -- Billing externo (Asaas)
  asaas_customer_id TEXT,
  asaas_subscription_id TEXT,
  -- Meta
  observacoes     TEXT
);

CREATE TRIGGER trg_empresas_updated BEFORE UPDATE ON empresas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── 2. FEATURE FLAGS (MÓDULOS POR EMPRESA) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS empresa_modulos (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  modulo      TEXT NOT NULL,
  habilitado  BOOLEAN NOT NULL DEFAULT FALSE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('PLANO','BETA','CUSTOM')) DEFAULT 'PLANO',
  -- Para módulos custom cobrados à parte
  valor_extra NUMERIC(10,2) DEFAULT 0,
  observacao  TEXT,
  UNIQUE(empresa_id, modulo)
);

-- Lista de todos os módulos do sistema
-- Core: contratos_obras, servicos_medicoes, exportacao
-- Pro: planejamento, setor_orcamentos, apontamento, diario_rdo, checklist_nr18
-- Enterprise: cronograma, aditivos, subempreiteiros, relatorio_fotos, dashboard_executivo, custos_erp, setor_licitacao

-- ─── 3. ADICIONAR empresa_id NAS TABELAS RAIZ ───────────────────────────────

-- Perfis: cada usuário pertence a uma empresa
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_perfis_empresa ON perfis(empresa_id);

-- Contratos: cada contrato pertence a uma empresa
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_contratos_empresa ON contratos(empresa_id);

-- Logos: cada logo pertence a uma empresa
ALTER TABLE logos_sistema ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE SET NULL;

-- Subempreiteiros: raiz própria, precisa de empresa_id
ALTER TABLE subempreiteiros ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_subempreiteiros_empresa ON subempreiteiros(empresa_id);

-- FAQ: global (sem empresa_id) — compartilhado entre todas
-- Checklist itens modelo: global — compartilhado entre todas
-- Funcoes mao obra: global — compartilhado entre todas

-- ─── 4. ROLE SUPERADMIN ──────────────────────────────────────────────────────

-- Atualizar constraint de role em perfis para incluir SUPERADMIN
ALTER TABLE perfis DROP CONSTRAINT IF EXISTS perfis_role_check;
ALTER TABLE perfis ADD CONSTRAINT perfis_role_check 
  CHECK (role IN ('ADMIN','GESTOR','ENGENHEIRO','APONTADOR','ORCAMENTISTA','DIRETOR','SUPERADMIN'));

-- ─── 5. FUNÇÕES HELPER ──────────────────────────────────────────────────────

-- Retorna o empresa_id do usuário logado
CREATE OR REPLACE FUNCTION get_my_empresa_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT empresa_id FROM perfis WHERE id = auth.uid();
$$;

-- Verifica se o usuário é SUPERADMIN
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM perfis WHERE id = auth.uid() AND role = 'SUPERADMIN');
$$;

-- Verifica se o usuário pertence à mesma empresa (ou é superadmin)
CREATE OR REPLACE FUNCTION same_empresa(target_empresa_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT is_superadmin() OR get_my_empresa_id() = target_empresa_id;
$$;

-- Retorna módulos habilitados da empresa do usuário
CREATE OR REPLACE FUNCTION get_my_modulos()
RETURNS SETOF TEXT
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT modulo FROM empresa_modulos 
  WHERE empresa_id = get_my_empresa_id() AND habilitado = TRUE;
$$;

-- Verifica se um módulo específico está habilitado para a empresa do usuário
CREATE OR REPLACE FUNCTION has_modulo(p_modulo TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT is_superadmin() OR EXISTS (
    SELECT 1 FROM empresa_modulos 
    WHERE empresa_id = get_my_empresa_id() 
      AND modulo = p_modulo 
      AND habilitado = TRUE
  );
$$;

-- ─── 6. MIGRAR DADOS DA RD CONSTRUTORA ──────────────────────────────────────

-- Criar RD Construtora como empresa #1
INSERT INTO empresas (id, nome, cnpj, plano, valor_mensal, cobranca_ativa, max_obras, max_usuarios, status, observacoes)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'RD Construtora',
  NULL,
  'ILIMITADO',
  0,
  FALSE,
  0,  -- 0 = ilimitado
  0,  -- 0 = ilimitado
  'ATIVA',
  'Empresa fundadora — case de sucesso MedObras'
) ON CONFLICT (id) DO NOTHING;

-- Vincular TODOS os perfis existentes à RD
UPDATE perfis SET empresa_id = '00000000-0000-0000-0000-000000000001' WHERE empresa_id IS NULL;

-- Vincular TODOS os contratos existentes à RD
UPDATE contratos SET empresa_id = '00000000-0000-0000-0000-000000000001' WHERE empresa_id IS NULL;

-- Vincular logos existentes à RD
UPDATE logos_sistema SET empresa_id = '00000000-0000-0000-0000-000000000001' WHERE empresa_id IS NULL;

-- Vincular subempreiteiros existentes à RD
UPDATE subempreiteiros SET empresa_id = '00000000-0000-0000-0000-000000000001' WHERE empresa_id IS NULL;

-- ─── 7. INSERIR TODOS OS MÓDULOS HABILITADOS PARA A RD ──────────────────────

INSERT INTO empresa_modulos (empresa_id, modulo, habilitado, tipo) VALUES
  ('00000000-0000-0000-0000-000000000001', 'contratos_obras', TRUE, 'PLANO'),
  ('00000000-0000-0000-0000-000000000001', 'servicos_medicoes', TRUE, 'PLANO'),
  ('00000000-0000-0000-0000-000000000001', 'exportacao', TRUE, 'PLANO'),
  ('00000000-0000-0000-0000-000000000001', 'planejamento', TRUE, 'PLANO'),
  ('00000000-0000-0000-0000-000000000001', 'setor_orcamentos', TRUE, 'PLANO'),
  ('00000000-0000-0000-0000-000000000001', 'apontamento', TRUE, 'PLANO'),
  ('00000000-0000-0000-0000-000000000001', 'diario_rdo', TRUE, 'PLANO'),
  ('00000000-0000-0000-0000-000000000001', 'checklist_nr18', TRUE, 'PLANO'),
  ('00000000-0000-0000-0000-000000000001', 'cronograma', TRUE, 'PLANO'),
  ('00000000-0000-0000-0000-000000000001', 'aditivos', TRUE, 'PLANO'),
  ('00000000-0000-0000-0000-000000000001', 'subempreiteiros', TRUE, 'PLANO'),
  ('00000000-0000-0000-0000-000000000001', 'relatorio_fotos', TRUE, 'PLANO'),
  ('00000000-0000-0000-0000-000000000001', 'dashboard_executivo', TRUE, 'PLANO'),
  ('00000000-0000-0000-0000-000000000001', 'custos_erp', TRUE, 'PLANO'),
  ('00000000-0000-0000-0000-000000000001', 'setor_licitacao', FALSE, 'BETA'),
  ('00000000-0000-0000-0000-000000000001', 'medicao_rapida', FALSE, 'BETA'),
  ('00000000-0000-0000-0000-000000000001', 'reserva_veiculos', FALSE, 'BETA')
ON CONFLICT (empresa_id, modulo) DO NOTHING;

-- ─── 8. RLS — EMPRESAS ──────────────────────────────────────────────────────

ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;

-- Superadmin vê todas, usuário comum vê só a sua
CREATE POLICY "empresas_select" ON empresas FOR SELECT
  USING (is_superadmin() OR id = get_my_empresa_id());
CREATE POLICY "empresas_insert" ON empresas FOR INSERT
  WITH CHECK (is_superadmin());
CREATE POLICY "empresas_update" ON empresas FOR UPDATE
  USING (is_superadmin());
CREATE POLICY "empresas_delete" ON empresas FOR DELETE
  USING (is_superadmin());

-- ─── 9. RLS — EMPRESA_MODULOS ────────────────────────────────────────────────

ALTER TABLE empresa_modulos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "modulos_select" ON empresa_modulos FOR SELECT
  USING (is_superadmin() OR empresa_id = get_my_empresa_id());
CREATE POLICY "modulos_insert" ON empresa_modulos FOR INSERT
  WITH CHECK (is_superadmin());
CREATE POLICY "modulos_update" ON empresa_modulos FOR UPDATE
  USING (is_superadmin());
CREATE POLICY "modulos_delete" ON empresa_modulos FOR DELETE
  USING (is_superadmin());

-- ─── 10. ATUALIZAR RLS DAS TABELAS EXISTENTES ───────────────────────────────
-- Adiciona filtro por empresa_id nas políticas de SELECT

-- PERFIS: usuário vê apenas perfis da sua empresa
DROP POLICY IF EXISTS "perfis_select" ON perfis;
CREATE POLICY "perfis_select" ON perfis FOR SELECT
  USING (is_superadmin() OR empresa_id = get_my_empresa_id());

-- CONTRATOS: só da mesma empresa
DROP POLICY IF EXISTS "contratos_select" ON contratos;
CREATE POLICY "contratos_select" ON contratos FOR SELECT
  USING (is_superadmin() OR empresa_id = get_my_empresa_id());

DROP POLICY IF EXISTS "contratos_insert" ON contratos;
CREATE POLICY "contratos_insert" ON contratos FOR INSERT
  WITH CHECK (is_superadmin() OR empresa_id = get_my_empresa_id());

DROP POLICY IF EXISTS "contratos_update" ON contratos;
CREATE POLICY "contratos_update" ON contratos FOR UPDATE
  USING (is_superadmin() OR empresa_id = get_my_empresa_id());

DROP POLICY IF EXISTS "contratos_delete" ON contratos;
CREATE POLICY "contratos_delete" ON contratos FOR DELETE
  USING (is_superadmin() OR empresa_id = get_my_empresa_id());

-- OBRAS: herda empresa via contrato
DROP POLICY IF EXISTS "obras_select" ON obras;
CREATE POLICY "obras_select" ON obras FOR SELECT
  USING (
    is_superadmin() 
    OR contrato_id IN (SELECT id FROM contratos WHERE empresa_id = get_my_empresa_id())
    OR is_apontador_obra(id)
  );

-- SERVICOS: herda via obra → contrato
DROP POLICY IF EXISTS "servicos_select" ON servicos;
CREATE POLICY "servicos_select" ON servicos FOR SELECT
  USING (
    is_superadmin()
    OR obra_id IN (
      SELECT o.id FROM obras o 
      JOIN contratos c ON c.id = o.contrato_id 
      WHERE c.empresa_id = get_my_empresa_id()
    )
  );

-- MEDICOES: herda via obra → contrato
DROP POLICY IF EXISTS "medicoes_select" ON medicoes;
CREATE POLICY "medicoes_select" ON medicoes FOR SELECT
  USING (
    is_superadmin()
    OR obra_id IN (
      SELECT o.id FROM obras o 
      JOIN contratos c ON c.id = o.contrato_id 
      WHERE c.empresa_id = get_my_empresa_id()
    )
  );

-- LOGOS: por empresa
DROP POLICY IF EXISTS "logos_select" ON logos_sistema;
CREATE POLICY "logos_select" ON logos_sistema FOR SELECT
  USING (is_superadmin() OR empresa_id = get_my_empresa_id());

DROP POLICY IF EXISTS "logos_insert" ON logos_sistema;
CREATE POLICY "logos_insert" ON logos_sistema FOR INSERT
  WITH CHECK (is_superadmin() OR empresa_id = get_my_empresa_id());

-- SUBEMPREITEIROS: por empresa
DROP POLICY IF EXISTS "subempreiteiros_select" ON subempreiteiros;
CREATE POLICY "subempreiteiros_select" ON subempreiteiros FOR SELECT
  USING (is_superadmin() OR empresa_id = get_my_empresa_id());

-- ─── 11. FUNÇÃO PARA CRIAR NOVA EMPRESA COM MÓDULOS DO PLANO ────────────────

CREATE OR REPLACE FUNCTION criar_empresa_com_modulos(
  p_nome TEXT,
  p_cnpj TEXT,
  p_email TEXT,
  p_plano TEXT DEFAULT 'TRIAL'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_empresa_id UUID;
  v_max_obras INTEGER;
  v_max_usuarios INTEGER;
  v_valor NUMERIC(10,2);
  v_modulos TEXT[];
BEGIN
  -- Definir limites por plano
  CASE p_plano
    WHEN 'STARTER' THEN
      v_max_obras := 5; v_max_usuarios := 3; v_valor := 97;
      v_modulos := ARRAY['contratos_obras','servicos_medicoes','exportacao'];
    WHEN 'PROFISSIONAL' THEN
      v_max_obras := 30; v_max_usuarios := 10; v_valor := 297;
      v_modulos := ARRAY['contratos_obras','servicos_medicoes','exportacao','planejamento','setor_orcamentos','apontamento','diario_rdo','checklist_nr18'];
    WHEN 'ENTERPRISE' THEN
      v_max_obras := 0; v_max_usuarios := 0; v_valor := 497;
      v_modulos := ARRAY['contratos_obras','servicos_medicoes','exportacao','planejamento','setor_orcamentos','apontamento','diario_rdo','checklist_nr18','cronograma','aditivos','subempreiteiros','relatorio_fotos','dashboard_executivo','custos_erp','setor_licitacao'];
    WHEN 'TRIAL' THEN
      v_max_obras := 5; v_max_usuarios := 3; v_valor := 0;
      v_modulos := ARRAY['contratos_obras','servicos_medicoes','exportacao','planejamento','setor_orcamentos','apontamento','diario_rdo','checklist_nr18'];
    ELSE
      v_max_obras := 0; v_max_usuarios := 0; v_valor := 0;
      v_modulos := ARRAY['contratos_obras','servicos_medicoes','exportacao','planejamento','setor_orcamentos','apontamento','diario_rdo','checklist_nr18','cronograma','aditivos','subempreiteiros','relatorio_fotos','dashboard_executivo','custos_erp'];
  END CASE;

  -- Criar empresa
  INSERT INTO empresas (nome, cnpj, email_contato, plano, valor_mensal, max_obras, max_usuarios, status,
    trial_inicio, trial_fim)
  VALUES (p_nome, p_cnpj, p_email, p_plano, v_valor, v_max_obras, v_max_usuarios,
    CASE WHEN p_plano = 'TRIAL' THEN 'TRIAL' ELSE 'ATIVA' END,
    CASE WHEN p_plano = 'TRIAL' THEN CURRENT_DATE ELSE NULL END,
    CASE WHEN p_plano = 'TRIAL' THEN CURRENT_DATE + 14 ELSE NULL END)
  RETURNING id INTO v_empresa_id;

  -- Inserir módulos do plano
  INSERT INTO empresa_modulos (empresa_id, modulo, habilitado, tipo)
  SELECT v_empresa_id, unnest(v_modulos), TRUE, 'PLANO';

  RETURN v_empresa_id;
END;
$$;

-- ─── 12. VIEW PARA SUPERADMIN — MÉTRICAS ────────────────────────────────────

CREATE OR REPLACE VIEW vw_superadmin_metricas AS
SELECT
  (SELECT COUNT(*) FROM empresas WHERE status IN ('ATIVA','TRIAL'))::INTEGER AS empresas_ativas,
  (SELECT COUNT(*) FROM empresas WHERE status = 'TRIAL')::INTEGER AS empresas_trial,
  (SELECT COALESCE(SUM(valor_mensal), 0) FROM empresas WHERE status = 'ATIVA' AND cobranca_ativa = TRUE)::NUMERIC AS mrr,
  (SELECT COUNT(*) FROM perfis WHERE ativo = TRUE)::INTEGER AS usuarios_totais,
  (SELECT COUNT(*) FROM contratos)::INTEGER AS contratos_totais,
  (SELECT COUNT(*) FROM obras)::INTEGER AS obras_totais;

-- ─── VERIFICAÇÃO ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  rd_count INTEGER;
  perfis_count INTEGER;
  contratos_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO rd_count FROM empresas WHERE id = '00000000-0000-0000-0000-000000000001';
  SELECT COUNT(*) INTO perfis_count FROM perfis WHERE empresa_id = '00000000-0000-0000-0000-000000000001';
  SELECT COUNT(*) INTO contratos_count FROM contratos WHERE empresa_id = '00000000-0000-0000-0000-000000000001';
  RAISE NOTICE '═══ MULTI-TENANCY APLICADA ═══';
  RAISE NOTICE 'RD Construtora criada: % (esperado: 1)', rd_count;
  RAISE NOTICE 'Perfis migrados para RD: %', perfis_count;
  RAISE NOTICE 'Contratos migrados para RD: %', contratos_count;
END $$;

SELECT 'OK! Multi-tenancy MedObras aplicada. RD Construtora = empresa #1 ILIMITADO.' AS status;
