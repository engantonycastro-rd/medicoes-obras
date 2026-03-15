-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Histórico/Auditoria de Medições
-- Rodar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- Tabela de auditoria
CREATE TABLE IF NOT EXISTS auditoria (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email      TEXT,
  user_nome       TEXT,

  -- O quê mudou
  tabela          TEXT NOT NULL,             -- 'medicoes', 'linhas_memoria', 'servicos'
  registro_id     TEXT NOT NULL,             -- ID do registro alterado
  acao            TEXT NOT NULL CHECK (acao IN ('INSERT','UPDATE','DELETE')),

  -- Contexto
  obra_id         UUID,
  contrato_id     UUID,
  medicao_id      UUID,

  -- Dados
  dados_antes     JSONB,                     -- snapshot antes da alteração (UPDATE/DELETE)
  dados_depois    JSONB,                     -- snapshot depois da alteração (INSERT/UPDATE)
  campos_alterados TEXT[],                   -- lista dos campos que mudaram (UPDATE)
  resumo          TEXT                       -- descrição legível. Ex: "Alterou quantidade de 10 para 15"
);

CREATE INDEX IF NOT EXISTS idx_auditoria_created ON auditoria(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_obra ON auditoria(obra_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_user ON auditoria(user_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_tabela ON auditoria(tabela, registro_id);

-- RLS: admins veem tudo, equipe vê da obra
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_select" ON auditoria FOR SELECT
  USING (is_admin() OR (obra_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM obras o WHERE o.id = obra_id AND is_team_visible(o.user_id)
  )));

-- Insert: via trigger SECURITY DEFINER, sem restrição
CREATE POLICY "audit_insert" ON auditoria FOR INSERT WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TRIGGER: Audita alterações em medicoes
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION audit_medicoes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
  v_nome TEXT;
  v_campos TEXT[];
  v_resumo TEXT;
BEGIN
  -- Busca dados do usuário atual
  v_user_id := auth.uid();
  SELECT email, nome INTO v_email, v_nome FROM perfis WHERE id = v_user_id;

  IF TG_OP = 'INSERT' THEN
    v_resumo := format('%sª Medição criada (status: %s)', NEW.numero_extenso, NEW.status);
    INSERT INTO auditoria (user_id, user_email, user_nome, tabela, registro_id, acao,
      obra_id, contrato_id, medicao_id, dados_depois, resumo)
    VALUES (v_user_id, v_email, v_nome, 'medicoes', NEW.id::TEXT, 'INSERT',
      NEW.obra_id, NEW.contrato_id, NEW.id, to_jsonb(NEW), v_resumo);
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    v_campos := '{}';
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_campos := array_append(v_campos, 'status');
      v_resumo := format('Medição %s: status %s → %s', NEW.numero_extenso, OLD.status, NEW.status);
    END IF;
    IF OLD.data_medicao IS DISTINCT FROM NEW.data_medicao THEN
      v_campos := array_append(v_campos, 'data_medicao');
    END IF;
    IF OLD.observacoes IS DISTINCT FROM NEW.observacoes THEN
      v_campos := array_append(v_campos, 'observacoes');
    END IF;
    IF OLD.periodo_referencia IS DISTINCT FROM NEW.periodo_referencia THEN
      v_campos := array_append(v_campos, 'periodo_referencia');
    END IF;

    IF array_length(v_campos, 1) > 0 THEN
      IF v_resumo IS NULL THEN
        v_resumo := format('Medição %s atualizada: %s', NEW.numero_extenso, array_to_string(v_campos, ', '));
      END IF;
      INSERT INTO auditoria (user_id, user_email, user_nome, tabela, registro_id, acao,
        obra_id, contrato_id, medicao_id, dados_antes, dados_depois, campos_alterados, resumo)
      VALUES (v_user_id, v_email, v_nome, 'medicoes', NEW.id::TEXT, 'UPDATE',
        NEW.obra_id, NEW.contrato_id, NEW.id, to_jsonb(OLD), to_jsonb(NEW), v_campos, v_resumo);
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    v_resumo := format('Medição %s excluída', OLD.numero_extenso);
    INSERT INTO auditoria (user_id, user_email, user_nome, tabela, registro_id, acao,
      obra_id, contrato_id, medicao_id, dados_antes, resumo)
    VALUES (v_user_id, v_email, v_nome, 'medicoes', OLD.id::TEXT, 'DELETE',
      OLD.obra_id, OLD.contrato_id, OLD.id, to_jsonb(OLD), v_resumo);
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_medicoes ON medicoes;
CREATE TRIGGER trg_audit_medicoes
  AFTER INSERT OR UPDATE OR DELETE ON medicoes
  FOR EACH ROW EXECUTE FUNCTION audit_medicoes();

-- ═══════════════════════════════════════════════════════════════════════════════
-- TRIGGER: Audita alterações em linhas_memoria
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION audit_linhas_memoria()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
  v_nome TEXT;
  v_obra_id UUID;
  v_contrato_id UUID;
  v_resumo TEXT;
  v_srv_desc TEXT;
BEGIN
  v_user_id := auth.uid();
  SELECT email, nome INTO v_email, v_nome FROM perfis WHERE id = v_user_id;

  -- Busca obra/contrato via medicao
  IF TG_OP = 'DELETE' THEN
    SELECT m.obra_id, m.contrato_id INTO v_obra_id, v_contrato_id FROM medicoes m WHERE m.id = OLD.medicao_id;
  ELSE
    SELECT m.obra_id, m.contrato_id INTO v_obra_id, v_contrato_id FROM medicoes m WHERE m.id = NEW.medicao_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT descricao INTO v_srv_desc FROM servicos WHERE id = NEW.servico_id;
    v_resumo := format('Linha %s adicionada: %s (total: %s)',
      NEW.sub_item, COALESCE(LEFT(NEW.descricao_calculo, 40), ''), NEW.total);
    INSERT INTO auditoria (user_id, user_email, user_nome, tabela, registro_id, acao,
      obra_id, contrato_id, medicao_id, dados_depois, resumo)
    VALUES (v_user_id, v_email, v_nome, 'linhas_memoria', NEW.id::TEXT, 'INSERT',
      v_obra_id, v_contrato_id, NEW.medicao_id, to_jsonb(NEW), v_resumo);
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Só loga se houve mudança real de dados (ignora updated_at)
    IF OLD.total IS DISTINCT FROM NEW.total
       OR OLD.status IS DISTINCT FROM NEW.status
       OR OLD.descricao_calculo IS DISTINCT FROM NEW.descricao_calculo
       OR OLD.quantidade IS DISTINCT FROM NEW.quantidade THEN

      v_resumo := format('Linha %s alterada', NEW.sub_item);
      IF OLD.total IS DISTINCT FROM NEW.total THEN
        v_resumo := format('Linha %s: total %s → %s', NEW.sub_item, OLD.total, NEW.total);
      END IF;
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        v_resumo := format('Linha %s: status %s → %s', NEW.sub_item, OLD.status, NEW.status);
      END IF;

      INSERT INTO auditoria (user_id, user_email, user_nome, tabela, registro_id, acao,
        obra_id, contrato_id, medicao_id, dados_antes, dados_depois, resumo)
      VALUES (v_user_id, v_email, v_nome, 'linhas_memoria', NEW.id::TEXT, 'UPDATE',
        v_obra_id, v_contrato_id, NEW.medicao_id, to_jsonb(OLD), to_jsonb(NEW), v_resumo);
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    v_resumo := format('Linha %s excluída (total era: %s)', OLD.sub_item, OLD.total);
    INSERT INTO auditoria (user_id, user_email, user_nome, tabela, registro_id, acao,
      obra_id, contrato_id, medicao_id, dados_antes, resumo)
    VALUES (v_user_id, v_email, v_nome, 'linhas_memoria', OLD.id::TEXT, 'DELETE',
      v_obra_id, v_contrato_id, OLD.medicao_id, to_jsonb(OLD), v_resumo);
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_linhas ON linhas_memoria;
CREATE TRIGGER trg_audit_linhas
  AFTER INSERT OR UPDATE OR DELETE ON linhas_memoria
  FOR EACH ROW EXECUTE FUNCTION audit_linhas_memoria();

-- Verifica
SELECT 'Auditoria criada!' AS status,
  (SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_name LIKE 'trg_audit%') AS triggers_ativos;
