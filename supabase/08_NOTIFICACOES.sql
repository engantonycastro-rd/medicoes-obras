-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Sistema de Notificações
-- Rodar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- Tabela de notificações
CREATE TABLE IF NOT EXISTS notificacoes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('info','sucesso','alerta','erro')),
  titulo      TEXT NOT NULL,
  mensagem    TEXT,
  lida        BOOLEAN NOT NULL DEFAULT FALSE,
  link        TEXT  -- rota de navegação, ex: "/medicoes"
);

CREATE INDEX IF NOT EXISTS idx_notificacoes_user ON notificacoes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notificacoes_lida ON notificacoes(user_id, lida);

-- RLS
ALTER TABLE notificacoes ENABLE ROW LEVEL SECURITY;

-- Cada usuário vê apenas suas notificações
CREATE POLICY "notif_select_own" ON notificacoes FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "notif_update_own" ON notificacoes FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "notif_delete_own" ON notificacoes FOR DELETE
  USING (auth.uid() = user_id);
-- Insert: precisa de função SECURITY DEFINER para notificar outros users
CREATE POLICY "notif_insert_own" ON notificacoes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Função RPC para criar notificação para QUALQUER usuário (chamada por admins/gestores)
CREATE OR REPLACE FUNCTION criar_notificacao(
  p_user_id UUID,
  p_tipo TEXT,
  p_titulo TEXT,
  p_mensagem TEXT DEFAULT NULL,
  p_link TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO notificacoes (user_id, tipo, titulo, mensagem, link)
  VALUES (p_user_id, p_tipo, p_titulo, p_mensagem, p_link)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Função RPC para notificar TODOS os admins
CREATE OR REPLACE FUNCTION notificar_admins(
  p_tipo TEXT,
  p_titulo TEXT,
  p_mensagem TEXT DEFAULT NULL,
  p_link TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO notificacoes (user_id, tipo, titulo, mensagem, link)
  SELECT id, p_tipo, p_titulo, p_mensagem, p_link
  FROM perfis WHERE role = 'ADMIN' AND ativo = TRUE;
END;
$$;

-- Função RPC para notificar membros da equipe de um gestor
CREATE OR REPLACE FUNCTION notificar_equipe(
  p_gestor_id UUID,
  p_tipo TEXT,
  p_titulo TEXT,
  p_mensagem TEXT DEFAULT NULL,
  p_link TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Notifica o gestor
  INSERT INTO notificacoes (user_id, tipo, titulo, mensagem, link)
  VALUES (p_gestor_id, p_tipo, p_titulo, p_mensagem, p_link);
  -- Notifica membros da equipe
  INSERT INTO notificacoes (user_id, tipo, titulo, mensagem, link)
  SELECT id, p_tipo, p_titulo, p_mensagem, p_link
  FROM perfis WHERE gestor_id = p_gestor_id AND ativo = TRUE;
END;
$$;

-- Limpa notificações com mais de 90 dias (rode periodicamente ou via cron)
-- SELECT FROM notificacoes WHERE created_at < NOW() - INTERVAL '90 days';
