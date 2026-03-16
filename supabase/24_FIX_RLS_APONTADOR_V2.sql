-- ═══════════════════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO + FIX DEFINITIVO: Apontador RLS
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. DIAGNÓSTICO: Verificar se os vínculos existem
SELECT 'VINCULOS' AS teste, ao.user_id, ao.obra_id, p.nome, p.role, o.nome_obra
FROM apontador_obras ao
JOIN perfis p ON p.id = ao.user_id
JOIN obras o ON o.id = ao.obra_id;

-- 2. Verificar policies existentes em obras
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'obras';

-- 3. Verificar policies em apontador_obras
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'apontador_obras';

-- ═══ FIX DEFINITIVO: Função SECURITY DEFINER ═══
-- Mesma estratégia do is_contrato_gestor que já funciona

CREATE OR REPLACE FUNCTION is_apontador_obra(p_obra_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM apontador_obras
    WHERE user_id = auth.uid() AND obra_id = p_obra_id
  );
END;
$$;

-- Remove policies antigas que podem estar conflitando
DROP POLICY IF EXISTS "obras_apontador_select" ON obras;
DROP POLICY IF EXISTS "contratos_apontador_select" ON contratos;
DROP POLICY IF EXISTS "kanban_cards_apontador" ON kanban_cards;
DROP POLICY IF EXISTS "kanban_itens_apontador" ON kanban_itens;

-- Recria com SECURITY DEFINER function
CREATE POLICY "obras_apontador_select" ON obras FOR SELECT
  USING (is_apontador_obra(id));

CREATE POLICY "contratos_apontador_select" ON contratos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM obras o WHERE o.contrato_id = contratos.id AND is_apontador_obra(o.id)
    )
  );

CREATE POLICY "kanban_cards_apontador" ON kanban_cards FOR SELECT
  USING (is_apontador_obra(obra_id));

CREATE POLICY "kanban_itens_apontador" ON kanban_itens FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM kanban_cards c WHERE c.id = card_id AND is_apontador_obra(c.obra_id)
    )
  );

-- Verificação final
SELECT 'POLICIES OBRAS' AS teste, policyname FROM pg_policies WHERE tablename = 'obras' AND policyname LIKE '%apontador%';
SELECT 'FUNCTION OK' AS teste, EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'is_apontador_obra') AS existe;
