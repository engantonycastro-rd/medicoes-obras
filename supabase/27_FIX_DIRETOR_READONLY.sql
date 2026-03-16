-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX: Restrição do cargo DIRETOR — somente leitura no Dashboard Executivo
-- O DIRETOR precisa de SELECT nas tabelas para calcular os KPIs do painel,
-- mas NÃO pode INSERT/UPDATE/DELETE em nada.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Verifica: DIRETOR só deve ter policies FOR SELECT (nunca INSERT/UPDATE/DELETE)
-- As policies criadas na migration 26 já são todas FOR SELECT — ok.

-- Segurança extra: Função que bloqueia qualquer escrita do DIRETOR
CREATE OR REPLACE FUNCTION bloquear_escrita_diretor()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM perfis WHERE id = auth.uid() AND role = 'DIRETOR') THEN
    RAISE EXCEPTION 'Diretores não têm permissão de escrita nesta tabela';
  END IF;
  RETURN NEW;
END;
$$;

-- Aplica trigger de bloqueio nas tabelas críticas
DO $$ 
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'contratos', 'obras', 'servicos', 'medicoes', 'linhas_memoria',
    'apontamentos', 'diario_obra', 'aditivos', 'cronograma_marcos',
    'checklist_preenchido', 'subempreiteiros', 'rdo', 'orcamentos_revisao'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS blk_diretor_%s ON %I', t, t);
    EXECUTE format('CREATE TRIGGER blk_diretor_%s BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION bloquear_escrita_diretor()', t, t);
  END LOOP;
END $$;

SELECT 'OK! DIRETOR bloqueado para escrita em todas as tabelas.' AS status;
