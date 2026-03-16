-- ═══════════════════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO + CORREÇÃO — Contratos sumindo após multi-tenancy
-- Rode este SQL no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. DIAGNÓSTICO: Verificar se a RD existe
SELECT id, nome, plano, status FROM empresas;

-- 2. DIAGNÓSTICO: Verificar perfis sem empresa_id
SELECT id, email, role, empresa_id FROM perfis;

-- 3. DIAGNÓSTICO: Verificar contratos sem empresa_id
SELECT id, nome_obra, empresa_id FROM contratos LIMIT 10;

-- 4. DIAGNÓSTICO: Verificar se a função get_my_empresa_id funciona
SELECT get_my_empresa_id() AS minha_empresa;

-- ═══════════════════════════════════════════════════════════════════════════════
-- CORREÇÃO: Forçar vinculação de TODOS os dados à RD Construtora
-- ═══════════════════════════════════════════════════════════════════════════════

-- Garantir que a RD existe
INSERT INTO empresas (id, nome, plano, valor_mensal, cobranca_ativa, max_obras, max_usuarios, status, observacoes)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'RD Construtora', 'ILIMITADO', 0, FALSE, 0, 0, 'ATIVA',
  'Empresa fundadora — case de sucesso MedObras'
) ON CONFLICT (id) DO NOTHING;

-- Vincular TODOS os perfis que ainda não têm empresa
UPDATE perfis SET empresa_id = '00000000-0000-0000-0000-000000000001' WHERE empresa_id IS NULL;

-- Vincular TODOS os contratos que ainda não têm empresa
UPDATE contratos SET empresa_id = '00000000-0000-0000-0000-000000000001' WHERE empresa_id IS NULL;

-- Vincular logos
UPDATE logos_sistema SET empresa_id = '00000000-0000-0000-0000-000000000001' WHERE empresa_id IS NULL;

-- Vincular subempreiteiros (se existirem)
UPDATE subempreiteiros SET empresa_id = '00000000-0000-0000-0000-000000000001' WHERE empresa_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- CORREÇÃO RLS: Recriar policies que podem estar conflitando
-- O problema mais provável é que policies ANTIGAS ainda existem e conflitam
-- ═══════════════════════════════════════════════════════════════════════════════

-- Limpar TODAS as policies de contratos e recriar
DROP POLICY IF EXISTS "contratos_select" ON contratos;
DROP POLICY IF EXISTS "contratos_insert" ON contratos;
DROP POLICY IF EXISTS "contratos_update" ON contratos;
DROP POLICY IF EXISTS "contratos_delete" ON contratos;
DROP POLICY IF EXISTS "Contratos visíveis para autenticados" ON contratos;
DROP POLICY IF EXISTS "Contratos: select" ON contratos;
DROP POLICY IF EXISTS "Contratos: insert" ON contratos;
DROP POLICY IF EXISTS "Contratos: update" ON contratos;
DROP POLICY IF EXISTS "Contratos: delete" ON contratos;

-- Recriar com lógica segura: se empresa_id está preenchido, filtra. Se não, libera (backwards compat)
CREATE POLICY "contratos_select" ON contratos FOR SELECT
  USING (
    is_superadmin()
    OR empresa_id = get_my_empresa_id()
    OR empresa_id IS NULL
  );

CREATE POLICY "contratos_insert" ON contratos FOR INSERT
  WITH CHECK (
    is_superadmin()
    OR empresa_id = get_my_empresa_id()
    OR empresa_id IS NULL
  );

CREATE POLICY "contratos_update" ON contratos FOR UPDATE
  USING (
    is_superadmin()
    OR empresa_id = get_my_empresa_id()
    OR empresa_id IS NULL
  );

CREATE POLICY "contratos_delete" ON contratos FOR DELETE
  USING (
    is_superadmin()
    OR empresa_id = get_my_empresa_id()
    OR empresa_id IS NULL
  );

-- Mesma lógica para PERFIS
DROP POLICY IF EXISTS "perfis_select" ON perfis;
DROP POLICY IF EXISTS "Perfis visíveis para autenticados" ON perfis;
DROP POLICY IF EXISTS "perfis: select" ON perfis;

CREATE POLICY "perfis_select" ON perfis FOR SELECT
  USING (
    is_superadmin()
    OR empresa_id = get_my_empresa_id()
    OR empresa_id IS NULL
    OR id = auth.uid()
  );

-- Mesma lógica para OBRAS (herda via contrato)
DROP POLICY IF EXISTS "obras_select" ON obras;
DROP POLICY IF EXISTS "Obras visíveis para autenticados" ON obras;

CREATE POLICY "obras_select" ON obras FOR SELECT
  USING (
    is_superadmin()
    OR contrato_id IN (
      SELECT id FROM contratos 
      WHERE empresa_id = get_my_empresa_id() 
         OR empresa_id IS NULL
    )
    OR is_apontador_obra(id)
  );

-- Mesma lógica para SERVICOS
DROP POLICY IF EXISTS "servicos_select" ON servicos;
DROP POLICY IF EXISTS "Serviços visíveis para autenticados" ON servicos;

CREATE POLICY "servicos_select" ON servicos FOR SELECT
  USING (
    is_superadmin()
    OR obra_id IN (
      SELECT o.id FROM obras o 
      JOIN contratos c ON c.id = o.contrato_id 
      WHERE c.empresa_id = get_my_empresa_id()
         OR c.empresa_id IS NULL
    )
  );

-- Mesma lógica para MEDICOES
DROP POLICY IF EXISTS "medicoes_select" ON medicoes;
DROP POLICY IF EXISTS "Medições visíveis para autenticados" ON medicoes;

CREATE POLICY "medicoes_select" ON medicoes FOR SELECT
  USING (
    is_superadmin()
    OR obra_id IN (
      SELECT o.id FROM obras o 
      JOIN contratos c ON c.id = o.contrato_id 
      WHERE c.empresa_id = get_my_empresa_id()
         OR c.empresa_id IS NULL
    )
  );

-- Mesma lógica para LOGOS
DROP POLICY IF EXISTS "logos_select" ON logos_sistema;
DROP POLICY IF EXISTS "logos_insert" ON logos_sistema;
DROP POLICY IF EXISTS "Logos visíveis" ON logos_sistema;

CREATE POLICY "logos_select" ON logos_sistema FOR SELECT
  USING (
    is_superadmin()
    OR empresa_id = get_my_empresa_id()
    OR empresa_id IS NULL
  );

CREATE POLICY "logos_insert" ON logos_sistema FOR INSERT
  WITH CHECK (
    is_superadmin()
    OR empresa_id = get_my_empresa_id()
    OR empresa_id IS NULL
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO FINAL
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT 'Perfis com empresa_id' AS check, COUNT(*) AS total FROM perfis WHERE empresa_id IS NOT NULL
UNION ALL
SELECT 'Perfis sem empresa_id', COUNT(*) FROM perfis WHERE empresa_id IS NULL
UNION ALL
SELECT 'Contratos com empresa_id', COUNT(*) FROM contratos WHERE empresa_id IS NOT NULL
UNION ALL
SELECT 'Contratos sem empresa_id', COUNT(*) FROM contratos WHERE empresa_id IS NULL;
