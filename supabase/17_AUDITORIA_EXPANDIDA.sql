-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Auditoria expandida — Contratos, Obras, Orçamentos
-- ═══════════════════════════════════════════════════════════════════════════════

-- Atualiza constraint de acao para incluir novos tipos
ALTER TABLE auditoria DROP CONSTRAINT IF EXISTS auditoria_acao_check;

-- ═══ TRIGGER: Contratos ═══
CREATE OR REPLACE FUNCTION audit_contratos()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_uid UUID; v_email TEXT; v_nome TEXT; v_resumo TEXT;
BEGIN
  v_uid := auth.uid();
  SELECT email, nome INTO v_email, v_nome FROM perfis WHERE id = v_uid;

  IF TG_OP = 'INSERT' THEN
    v_resumo := format('Contrato criado: %s (%s)', NEW.nome_obra, COALESCE(NEW.numero_contrato, ''));
    INSERT INTO auditoria (user_id, user_email, user_nome, tabela, registro_id, acao, contrato_id, dados_depois, resumo)
    VALUES (v_uid, v_email, v_nome, 'contratos', NEW.id::TEXT, 'INSERT', NEW.id, to_jsonb(NEW), v_resumo);
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    v_resumo := format('Contrato atualizado: %s', NEW.nome_obra);
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_resumo := format('Contrato %s: status %s → %s', NEW.nome_obra, OLD.status, NEW.status);
    END IF;
    INSERT INTO auditoria (user_id, user_email, user_nome, tabela, registro_id, acao, contrato_id, dados_antes, dados_depois, resumo)
    VALUES (v_uid, v_email, v_nome, 'contratos', NEW.id::TEXT, 'UPDATE', NEW.id, to_jsonb(OLD), to_jsonb(NEW), v_resumo);
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    v_resumo := format('Contrato excluído: %s', OLD.nome_obra);
    INSERT INTO auditoria (user_id, user_email, user_nome, tabela, registro_id, acao, contrato_id, dados_antes, resumo)
    VALUES (v_uid, v_email, v_nome, 'contratos', OLD.id::TEXT, 'DELETE', OLD.id, to_jsonb(OLD), v_resumo);
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_contratos ON contratos;
CREATE TRIGGER trg_audit_contratos
  AFTER INSERT OR UPDATE OR DELETE ON contratos
  FOR EACH ROW EXECUTE FUNCTION audit_contratos();

-- ═══ TRIGGER: Obras ═══
CREATE OR REPLACE FUNCTION audit_obras()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_uid UUID; v_email TEXT; v_nome TEXT; v_resumo TEXT; v_contrato TEXT;
BEGIN
  v_uid := auth.uid();
  SELECT email, nome INTO v_email, v_nome FROM perfis WHERE id = v_uid;

  IF TG_OP = 'INSERT' THEN
    SELECT nome_obra INTO v_contrato FROM contratos WHERE id = NEW.contrato_id;
    v_resumo := format('Obra criada: %s (contrato: %s)', NEW.nome_obra, COALESCE(v_contrato, ''));
    INSERT INTO auditoria (user_id, user_email, user_nome, tabela, registro_id, acao, obra_id, contrato_id, dados_depois, resumo)
    VALUES (v_uid, v_email, v_nome, 'obras', NEW.id::TEXT, 'INSERT', NEW.id, NEW.contrato_id, to_jsonb(NEW), v_resumo);
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    v_resumo := format('Obra atualizada: %s', NEW.nome_obra);
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_resumo := format('Obra %s: status %s → %s', NEW.nome_obra, OLD.status, NEW.status);
    END IF;
    IF OLD.contrato_id IS DISTINCT FROM NEW.contrato_id THEN
      v_resumo := format('Obra %s movida para outro contrato', NEW.nome_obra);
    END IF;
    INSERT INTO auditoria (user_id, user_email, user_nome, tabela, registro_id, acao, obra_id, contrato_id, dados_antes, dados_depois, resumo)
    VALUES (v_uid, v_email, v_nome, 'obras', NEW.id::TEXT, 'UPDATE', NEW.id, NEW.contrato_id, to_jsonb(OLD), to_jsonb(NEW), v_resumo);
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    v_resumo := format('Obra excluída: %s', OLD.nome_obra);
    INSERT INTO auditoria (user_id, user_email, user_nome, tabela, registro_id, acao, obra_id, contrato_id, dados_antes, resumo)
    VALUES (v_uid, v_email, v_nome, 'obras', OLD.id::TEXT, 'DELETE', OLD.id, OLD.contrato_id, to_jsonb(OLD), v_resumo);
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_obras ON obras;
CREATE TRIGGER trg_audit_obras
  AFTER INSERT OR UPDATE OR DELETE ON obras
  FOR EACH ROW EXECUTE FUNCTION audit_obras();

-- ═══ TRIGGER: Orçamentos/Revisão ═══
CREATE OR REPLACE FUNCTION audit_orcamentos()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_uid UUID; v_email TEXT; v_nome TEXT; v_resumo TEXT;
BEGIN
  v_uid := auth.uid();
  SELECT email, nome INTO v_email, v_nome FROM perfis WHERE id = v_uid;

  IF TG_OP = 'INSERT' THEN
    v_resumo := format('Orçamento enviado para revisão: %s (urgência: %s)', NEW.titulo, NEW.urgencia);
    INSERT INTO auditoria (user_id, user_email, user_nome, tabela, registro_id, acao, obra_id, contrato_id, dados_depois, resumo)
    VALUES (v_uid, v_email, v_nome, 'orcamentos_revisao', NEW.id::TEXT, 'INSERT', NEW.obra_id, NEW.contrato_id, to_jsonb(NEW), v_resumo);
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      IF NEW.status = 'EM_REVISAO' THEN
        v_resumo := format('Orçamento "%s" — revisão iniciada por %s', NEW.titulo, COALESCE(v_nome, v_email));
      ELSIF NEW.status = 'CONCLUIDO' THEN
        v_resumo := format('Orçamento "%s" — revisão concluída. %s alteração(ões)', NEW.titulo, COALESCE(NEW.qtd_alteracoes, 0));
        IF NEW.valor_original > 0 AND NEW.valor_revisado > 0 THEN
          v_resumo := v_resumo || format('. Valor: R$ %s → R$ %s (dif: R$ %s)',
            TO_CHAR(NEW.valor_original, 'FM999G999G990D00'),
            TO_CHAR(NEW.valor_revisado, 'FM999G999G990D00'),
            TO_CHAR(ABS(NEW.diferenca_valor), 'FM999G999G990D00'));
        END IF;
      ELSIF NEW.status = 'CANCELADO' THEN
        v_resumo := format('Orçamento "%s" — cancelado', NEW.titulo);
      ELSE
        v_resumo := format('Orçamento "%s" — status: %s → %s', NEW.titulo, OLD.status, NEW.status);
      END IF;
    ELSE
      v_resumo := format('Orçamento "%s" atualizado', NEW.titulo);
    END IF;
    INSERT INTO auditoria (user_id, user_email, user_nome, tabela, registro_id, acao, obra_id, contrato_id, dados_antes, dados_depois, resumo)
    VALUES (v_uid, v_email, v_nome, 'orcamentos_revisao', NEW.id::TEXT, 'UPDATE', NEW.obra_id, NEW.contrato_id, to_jsonb(OLD), to_jsonb(NEW), v_resumo);
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    v_resumo := format('Orçamento excluído: %s', OLD.titulo);
    INSERT INTO auditoria (user_id, user_email, user_nome, tabela, registro_id, acao, obra_id, contrato_id, dados_antes, resumo)
    VALUES (v_uid, v_email, v_nome, 'orcamentos_revisao', OLD.id::TEXT, 'DELETE', OLD.obra_id, OLD.contrato_id, to_jsonb(OLD), v_resumo);
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_orcamentos ON orcamentos_revisao;
CREATE TRIGGER trg_audit_orcamentos
  AFTER INSERT OR UPDATE OR DELETE ON orcamentos_revisao
  FOR EACH ROW EXECUTE FUNCTION audit_orcamentos();

-- Verifica
SELECT 'OK!' AS status,
  (SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_name LIKE 'trg_audit%') AS total_triggers;
