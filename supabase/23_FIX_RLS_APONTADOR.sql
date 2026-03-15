-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX: Apontador precisa ver as obras vinculadas a ele
-- ═══════════════════════════════════════════════════════════════════════════════

-- Obras: apontador vê as obras vinculadas via apontador_obras
CREATE POLICY "obras_apontador_select" ON obras FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM apontador_obras ao WHERE ao.obra_id = id AND ao.user_id = auth.uid())
  );

-- Contratos: apontador precisa ver o contrato da obra para o JOIN funcionar
CREATE POLICY "contratos_apontador_select" ON contratos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM apontador_obras ao
      JOIN obras o ON o.id = ao.obra_id
      WHERE o.contrato_id = contratos.id AND ao.user_id = auth.uid()
    )
  );

-- Kanban cards: apontador precisa ver para conferência PQE
CREATE POLICY "kanban_cards_apontador" ON kanban_cards FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM apontador_obras ao WHERE ao.obra_id = obra_id AND ao.user_id = auth.uid())
  );

-- Kanban itens: apontador precisa ver os itens dos cards
CREATE POLICY "kanban_itens_apontador" ON kanban_itens FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM kanban_cards c
      JOIN apontador_obras ao ON ao.obra_id = c.obra_id
      WHERE c.id = card_id AND ao.user_id = auth.uid()
    )
  );

SELECT 'OK!' AS status;
