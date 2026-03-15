-- ═══════════════════════════════════════════════════════════════════════════
-- PASSO 2: RECRIA TUDO — Execute após o PASSO 1 terminar com sucesso
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── EXTENSÕES ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── FUNÇÃO updated_at (precisa existir antes dos triggers) ──────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════
-- TABELAS
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── PERFIS ──────────────────────────────────────────────────────────────────
CREATE TABLE perfis (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  email       TEXT NOT NULL,
  nome        TEXT,
  role        TEXT NOT NULL CHECK (role IN ('ADMIN','ENGENHEIRO')) DEFAULT 'ENGENHEIRO',
  ativo       BOOLEAN NOT NULL DEFAULT FALSE,
  criado_por  UUID REFERENCES auth.users(id)
);

CREATE TRIGGER trg_perfis_updated_at
  BEFORE UPDATE ON perfis
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── CONTRATOS ───────────────────────────────────────────────────────────────
CREATE TABLE contratos (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  nome_obra             TEXT NOT NULL,
  local_obra            TEXT NOT NULL,
  numero_contrato       TEXT,
  tipo                  TEXT NOT NULL CHECK (tipo IN ('ESTADO','PREFEITURA')) DEFAULT 'ESTADO',
  orgao_nome            TEXT NOT NULL,
  orgao_subdivisao      TEXT,
  empresa_executora     TEXT NOT NULL,
  desconto_percentual   NUMERIC(8,6) NOT NULL DEFAULT 0,
  bdi_percentual        NUMERIC(8,6) NOT NULL DEFAULT 0.30091,
  bdi_preco_unitario    NUMERIC(8,6) DEFAULT 1.2452,
  data_base_planilha    TEXT,
  data_ordem_servico    DATE,
  prazo_execucao_dias   INTEGER DEFAULT 120,
  status                TEXT NOT NULL CHECK (status IN ('ATIVO','CONCLUIDO','SUSPENSO')) DEFAULT 'ATIVO',
  user_id               UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TRIGGER trg_contratos_updated_at
  BEFORE UPDATE ON contratos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── SERVIÇOS ─────────────────────────────────────────────────────────────────
CREATE TABLE servicos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contrato_id     UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  item            TEXT NOT NULL,
  fonte           TEXT NOT NULL,
  codigo          TEXT,
  descricao       TEXT NOT NULL,
  unidade         TEXT NOT NULL,
  quantidade      NUMERIC(14,4) NOT NULL DEFAULT 0,
  preco_unitario  NUMERIC(14,4) NOT NULL DEFAULT 0,
  is_grupo        BOOLEAN NOT NULL DEFAULT FALSE,
  grupo_item      TEXT,
  ordem           INTEGER NOT NULL DEFAULT 0,
  UNIQUE(contrato_id, item)
);

-- ─── MEDIÇÕES ─────────────────────────────────────────────────────────────────
CREATE TABLE medicoes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contrato_id     UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  numero          INTEGER NOT NULL,
  numero_extenso  TEXT NOT NULL,
  data_medicao    DATE NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('RASCUNHO','ENVIADA','APROVADA')) DEFAULT 'RASCUNHO',
  observacoes     TEXT,
  UNIQUE(contrato_id, numero)
);

CREATE TRIGGER trg_medicoes_updated_at
  BEFORE UPDATE ON medicoes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── LINHAS DA MEMÓRIA ────────────────────────────────────────────────────────
CREATE TABLE linhas_memoria (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  medicao_id          UUID NOT NULL REFERENCES medicoes(id) ON DELETE CASCADE,
  servico_id          UUID NOT NULL REFERENCES servicos(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sub_item            TEXT NOT NULL,
  descricao_calculo   TEXT NOT NULL DEFAULT '',
  largura             NUMERIC(14,4),
  comprimento         NUMERIC(14,4),
  altura              NUMERIC(14,4),
  perimetro           NUMERIC(14,4),
  area                NUMERIC(14,4),
  volume              NUMERIC(14,4),
  kg                  NUMERIC(14,4),
  outros              NUMERIC(14,4),
  desconto_dim        NUMERIC(14,4),
  quantidade          NUMERIC(14,4),
  total               NUMERIC(14,4) NOT NULL DEFAULT 0,
  status              TEXT NOT NULL CHECK (status IN ('A pagar','Pago','Não executado')) DEFAULT 'A pagar',
  observacao          TEXT
);

CREATE TRIGGER trg_linhas_updated_at
  BEFORE UPDATE ON linhas_memoria
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── ÍNDICES ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_servicos_contrato ON servicos(contrato_id);
CREATE INDEX idx_medicoes_contrato ON medicoes(contrato_id);
CREATE INDEX idx_linhas_medicao    ON linhas_memoria(medicao_id);
CREATE INDEX idx_linhas_servico    ON linhas_memoria(servico_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- INSERIR ADMIN ANTES DE ATIVAR RLS
-- ═══════════════════════════════════════════════════════════════════════════

-- Insere o admin AGORA, com RLS ainda desativado (tabela recém criada não tem RLS)
INSERT INTO perfis (id, email, role, ativo, nome)
SELECT
  id,
  email,
  'ADMIN',
  TRUE,
  'Adaylson Castro'
FROM auth.users
WHERE email = 'setordeorcamentos@rdconstrutora.com'
ON CONFLICT (id) DO UPDATE
  SET role = 'ADMIN', ativo = TRUE, nome = 'Adaylson Castro';

-- Confirma inserção
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM perfis WHERE email = 'setordeorcamentos@rdconstrutora.com' AND ativo = TRUE;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'ERRO: Admin não foi inserido! Verifique se o email está cadastrado em Authentication > Users';
  ELSE
    RAISE NOTICE 'SUCESSO: Admin inserido corretamente!';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS — Ativa SOMENTE após o admin estar inserido
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE perfis        ENABLE ROW LEVEL SECURITY;
ALTER TABLE contratos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicoes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE linhas_memoria ENABLE ROW LEVEL SECURITY;

-- ─── FUNÇÕES helper (criadas DEPOIS do admin, para não quebrar bootstrap) ────

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM perfis
    WHERE id = auth.uid() AND role = 'ADMIN' AND ativo = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION is_ativo()
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM perfis
    WHERE id = auth.uid() AND ativo = TRUE
  );
$$;

-- ─── POLÍTICAS: PERFIS ────────────────────────────────────────────────────────

-- Qualquer autenticado lê o próprio perfil
CREATE POLICY "perfis_select_proprio"
  ON perfis FOR SELECT
  USING (auth.uid() = id);

-- Admin lê todos
CREATE POLICY "perfis_select_admin"
  ON perfis FOR SELECT
  USING (is_admin());

-- Admin altera todos
CREATE POLICY "perfis_all_admin"
  ON perfis FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Qualquer autenticado insere o próprio (auto-cadastro)
CREATE POLICY "perfis_insert_proprio"
  ON perfis FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ─── POLÍTICAS: CONTRATOS ─────────────────────────────────────────────────────

CREATE POLICY "contratos_select_admin"
  ON contratos FOR SELECT USING (is_admin());

CREATE POLICY "contratos_select_proprio"
  ON contratos FOR SELECT USING (auth.uid() = user_id AND is_ativo());

CREATE POLICY "contratos_insert"
  ON contratos FOR INSERT WITH CHECK (auth.uid() = user_id AND is_ativo());

CREATE POLICY "contratos_update_proprio"
  ON contratos FOR UPDATE USING (auth.uid() = user_id AND is_ativo());

CREATE POLICY "contratos_update_admin"
  ON contratos FOR UPDATE USING (is_admin());

CREATE POLICY "contratos_delete_proprio"
  ON contratos FOR DELETE USING (auth.uid() = user_id AND is_ativo());

CREATE POLICY "contratos_delete_admin"
  ON contratos FOR DELETE USING (is_admin());

-- ─── POLÍTICAS: SERVIÇOS ──────────────────────────────────────────────────────

CREATE POLICY "servicos_select"
  ON servicos FOR SELECT
  USING (is_admin() OR EXISTS (
    SELECT 1 FROM contratos c WHERE c.id = contrato_id
    AND (c.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));

CREATE POLICY "servicos_insert"
  ON servicos FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM contratos c WHERE c.id = contrato_id
    AND (c.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));

CREATE POLICY "servicos_update"
  ON servicos FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM contratos c WHERE c.id = contrato_id
    AND (c.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));

CREATE POLICY "servicos_delete"
  ON servicos FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM contratos c WHERE c.id = contrato_id
    AND (c.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));

-- ─── POLÍTICAS: MEDIÇÕES ──────────────────────────────────────────────────────

CREATE POLICY "medicoes_select"
  ON medicoes FOR SELECT
  USING (is_admin() OR EXISTS (
    SELECT 1 FROM contratos c WHERE c.id = contrato_id
    AND (c.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));

CREATE POLICY "medicoes_insert"
  ON medicoes FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM contratos c WHERE c.id = contrato_id
    AND (c.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));

CREATE POLICY "medicoes_update"
  ON medicoes FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM contratos c WHERE c.id = contrato_id
    AND (c.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));

CREATE POLICY "medicoes_delete"
  ON medicoes FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM contratos c WHERE c.id = contrato_id
    AND (c.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));

-- ─── POLÍTICAS: LINHAS MEMÓRIA ────────────────────────────────────────────────

CREATE POLICY "linhas_select"
  ON linhas_memoria FOR SELECT
  USING (is_admin() OR EXISTS (
    SELECT 1 FROM medicoes m JOIN contratos c ON c.id = m.contrato_id
    WHERE m.id = medicao_id AND (c.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));

CREATE POLICY "linhas_insert"
  ON linhas_memoria FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM medicoes m JOIN contratos c ON c.id = m.contrato_id
    WHERE m.id = medicao_id AND (c.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));

CREATE POLICY "linhas_update"
  ON linhas_memoria FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM medicoes m JOIN contratos c ON c.id = m.contrato_id
    WHERE m.id = medicao_id AND (c.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));

CREATE POLICY "linhas_delete"
  ON linhas_memoria FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM medicoes m JOIN contratos c ON c.id = m.contrato_id
    WHERE m.id = medicao_id AND (c.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));

-- ─── TRIGGER: novos usuários ficam pendentes ──────────────────────────────────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO perfis (id, email, role, ativo)
  VALUES (NEW.id, NEW.email, 'ENGENHEIRO', FALSE)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── VIEW: resumo por serviço ──────────────────────────────────────────────────

CREATE OR REPLACE VIEW vw_resumo_servicos AS
SELECT
  lm.medicao_id,
  lm.servico_id,
  s.item,
  s.descricao,
  s.unidade,
  s.quantidade AS qtd_prevista,
  s.preco_unitario,
  COALESCE(SUM(lm.total) FILTER (WHERE lm.status = 'Pago'),          0) AS qtd_anterior,
  COALESCE(SUM(lm.total) FILTER (WHERE lm.status = 'A pagar'),       0) AS qtd_periodo,
  COALESCE(SUM(lm.total) FILTER (WHERE lm.status IN ('Pago','A pagar')), 0) AS qtd_acumulada
FROM linhas_memoria lm
JOIN servicos s ON s.id = lm.servico_id
GROUP BY lm.medicao_id, lm.servico_id, s.item, s.descricao, s.unidade, s.quantidade, s.preco_unitario;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO FINAL
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  '✅ Tabelas criadas: ' || COUNT(*)::TEXT AS resultado
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

SELECT
  email,
  role,
  ativo,
  nome
FROM perfis
WHERE email = 'setordeorcamentos@rdconstrutora.com';
