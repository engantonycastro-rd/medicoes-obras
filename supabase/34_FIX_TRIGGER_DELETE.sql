-- ═══════════════════════════════════════════════════════════════════════════
-- FIX 34 — TRIGGER DIRETOR: RETURN OLD em DELETE
-- Bug: RETURN NEW em DELETE retorna NULL → PostgreSQL ignora silenciosamente
-- Afetava TODOS os cargos, não só DIRETOR
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION bloquear_escrita_diretor()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM perfis WHERE id = auth.uid() AND role = 'DIRETOR') THEN
    RAISE EXCEPTION 'Diretores não têm permissão de escrita nesta tabela';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

SELECT 'OK! Trigger DIRETOR corrigido — DELETE funciona para todos os cargos.' AS status;
