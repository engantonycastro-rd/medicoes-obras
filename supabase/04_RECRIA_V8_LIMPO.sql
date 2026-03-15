-- ═══════════════════════════════════════════════════════════════════════════
-- RECRIA TUDO — V8 — Estrutura: Contrato > Obras > Medições
-- Execute no SQL Editor do Supabase (banco já limpo)
-- ═══════════════════════════════════════════════════════════════════════════

-- PASSO 1: Apaga tudo que possa existir
DROP TRIGGER IF EXISTS on_auth_user_created        ON auth.users;
DROP TRIGGER IF EXISTS trg_contratos_updated_at    ON contratos;
DROP TRIGGER IF EXISTS trg_obras_updated_at        ON obras;
DROP TRIGGER IF EXISTS trg_medicoes_updated_at     ON medicoes;
DROP TRIGGER IF EXISTS trg_linhas_updated_at       ON linhas_memoria;
DROP TRIGGER IF EXISTS trg_perfis_updated_at       ON perfis;

DROP FUNCTION IF EXISTS handle_new_user()           CASCADE;
DROP FUNCTION IF EXISTS set_updated_at()            CASCADE;
DROP FUNCTION IF EXISTS is_admin()                  CASCADE;
DROP FUNCTION IF EXISTS is_ativo()                  CASCADE;

DROP TABLE IF EXISTS fotos_medicao   CASCADE;
DROP TABLE IF EXISTS linhas_memoria  CASCADE;
DROP TABLE IF EXISTS medicoes        CASCADE;
DROP TABLE IF EXISTS servicos        CASCADE;
DROP TABLE IF EXISTS obras           CASCADE;
DROP TABLE IF EXISTS contratos       CASCADE;
DROP TABLE IF EXISTS logos_sistema   CASCADE;
DROP TABLE IF EXISTS perfis          CASCADE;

-- PASSO 2: Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- PASSO 3: Função updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════
-- TABELAS
-- ═══════════════════════════════════════════════════════════════════════════

-- PERFIS
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
CREATE TRIGGER trg_perfis_updated_at BEFORE UPDATE ON perfis FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- LOGOS DO SISTEMA (cadastradas pelo admin)
CREATE TABLE logos_sistema (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  nome        TEXT NOT NULL,
  descricao   TEXT,
  base64      TEXT NOT NULL,
  criado_por  UUID REFERENCES auth.users(id)
);

-- CONTRATOS (nível 1 — cliente/programa)
CREATE TABLE contratos (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  nome_obra          TEXT NOT NULL,   -- nome do contrato/cliente (ex: "FUNDASE")
  local_obra         TEXT NOT NULL,
  numero_contrato    TEXT,
  tipo               TEXT NOT NULL CHECK (tipo IN ('ESTADO','PREFEITURA')) DEFAULT 'ESTADO',
  orgao_nome         TEXT NOT NULL,
  orgao_subdivisao   TEXT,
  empresa_executora  TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('ATIVO','CONCLUIDO','SUSPENSO')) DEFAULT 'ATIVO',
  user_id            UUID REFERENCES auth.users(id) ON DELETE CASCADE
);
CREATE TRIGGER trg_contratos_updated_at BEFORE UPDATE ON contratos FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- OBRAS (nível 2 — cada obra dentro do contrato)
CREATE TABLE obras (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  contrato_id           UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  user_id               UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_obra             TEXT NOT NULL,
  local_obra            TEXT NOT NULL,
  numero_contrato       TEXT,
  orgao_subdivisao      TEXT,
  desconto_percentual   NUMERIC(8,6) NOT NULL DEFAULT 0,
  bdi_percentual        NUMERIC(8,6) NOT NULL DEFAULT 0.25,
  data_base_planilha    TEXT,
  prazo_execucao_dias   INTEGER DEFAULT 120,
  data_ordem_servico    DATE,
  status                TEXT NOT NULL CHECK (status IN ('ATIVA','CONCLUIDA','SUSPENSA')) DEFAULT 'ATIVA'
);
CREATE TRIGGER trg_obras_updated_at BEFORE UPDATE ON obras FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_obras_contrato ON obras(contrato_id);

-- SERVIÇOS (vinculados à obra)
CREATE TABLE servicos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contrato_id     UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  obra_id         UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
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
  UNIQUE(obra_id, item)
);
CREATE INDEX idx_servicos_obra ON servicos(obra_id);

-- MEDIÇÕES (vinculadas à obra)
CREATE TABLE medicoes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contrato_id     UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  obra_id         UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  numero          INTEGER NOT NULL,
  numero_extenso  TEXT NOT NULL,
  data_medicao    DATE NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('RASCUNHO','ENVIADA','APROVADA')) DEFAULT 'RASCUNHO',
  observacoes     TEXT,
  UNIQUE(obra_id, numero)
);
CREATE TRIGGER trg_medicoes_updated_at BEFORE UPDATE ON medicoes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_medicoes_obra ON medicoes(obra_id);

-- LINHAS DA MEMÓRIA DE CÁLCULO
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
CREATE TRIGGER trg_linhas_updated_at BEFORE UPDATE ON linhas_memoria FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_linhas_medicao ON linhas_memoria(medicao_id);

-- FOTOS DAS MEDIÇÕES
CREATE TABLE fotos_medicao (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  medicao_id  UUID NOT NULL REFERENCES medicoes(id) ON DELETE CASCADE,
  servico_id  UUID REFERENCES servicos(id) ON DELETE SET NULL,
  base64      TEXT NOT NULL,
  legenda     TEXT NOT NULL DEFAULT '',
  ordem       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_fotos_medicao ON fotos_medicao(medicao_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- INSERE ADMIN ANTES DE ATIVAR RLS
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO perfis (id, email, role, ativo, nome)
SELECT id, email, 'ADMIN', TRUE, 'Adaylson Castro'
FROM auth.users
WHERE email = 'setordeorcamentos@rdconstrutora.com'
ON CONFLICT (id) DO UPDATE SET role = 'ADMIN', ativo = TRUE, nome = 'Adaylson Castro';

DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM perfis WHERE email = 'setordeorcamentos@rdconstrutora.com' AND ativo = TRUE;
  IF v_count = 0 THEN
    RAISE EXCEPTION '❌ Admin não encontrado em auth.users! Verifique o e-mail.';
  ELSE
    RAISE NOTICE '✅ Admin inserido com sucesso!';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ATIVA RLS
-- ═══════════════════════════════════════════════════════════════════════════

-- perfis: RLS desativado intencionalmente (evita recursão infinita em is_admin())
-- Segurança mantida pelo código: ativo=false bloqueia acesso, UsuariosPage só para ADMIN
ALTER TABLE perfis         DISABLE ROW LEVEL SECURITY;
ALTER TABLE logos_sistema  ENABLE ROW LEVEL SECURITY;
ALTER TABLE contratos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE obras          ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicoes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE linhas_memoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE fotos_medicao  ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNÇÕES HELPER (após admin inserido)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM perfis WHERE id = auth.uid() AND role = 'ADMIN' AND ativo = TRUE);
$$;

CREATE OR REPLACE FUNCTION is_ativo()
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM perfis WHERE id = auth.uid() AND ativo = TRUE);
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- POLÍTICAS RLS
-- ═══════════════════════════════════════════════════════════════════════════

-- PERFIS
CREATE POLICY "perfis_select_proprio"  ON perfis FOR SELECT USING (auth.uid() = id);
CREATE POLICY "perfis_select_admin"    ON perfis FOR SELECT USING (is_admin());
CREATE POLICY "perfis_all_admin"       ON perfis FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "perfis_insert_proprio"  ON perfis FOR INSERT WITH CHECK (auth.uid() = id);

-- LOGOS (admin gerencia, todos ativos veem)
CREATE POLICY "logos_select" ON logos_sistema FOR SELECT USING (is_ativo() OR is_admin());
CREATE POLICY "logos_insert" ON logos_sistema FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "logos_update" ON logos_sistema FOR UPDATE USING (is_admin());
CREATE POLICY "logos_delete" ON logos_sistema FOR DELETE USING (is_admin());

-- CONTRATOS
CREATE POLICY "contratos_select" ON contratos FOR SELECT
  USING (is_admin() OR (auth.uid() = user_id AND is_ativo()));
CREATE POLICY "contratos_insert" ON contratos FOR INSERT
  WITH CHECK ((auth.uid() = user_id OR is_admin()) AND is_ativo());
CREATE POLICY "contratos_update" ON contratos FOR UPDATE
  USING (is_admin() OR (auth.uid() = user_id AND is_ativo()));
CREATE POLICY "contratos_delete" ON contratos FOR DELETE
  USING (is_admin() OR (auth.uid() = user_id AND is_ativo()));

-- OBRAS
CREATE POLICY "obras_select" ON obras FOR SELECT
  USING (is_admin() OR (auth.uid() = user_id AND is_ativo()));
CREATE POLICY "obras_insert" ON obras FOR INSERT
  WITH CHECK ((auth.uid() = user_id OR is_admin()) AND is_ativo());
CREATE POLICY "obras_update" ON obras FOR UPDATE
  USING (is_admin() OR (auth.uid() = user_id AND is_ativo()));
CREATE POLICY "obras_delete" ON obras FOR DELETE
  USING (is_admin() OR (auth.uid() = user_id AND is_ativo()));

-- SERVIÇOS
CREATE POLICY "servicos_select" ON servicos FOR SELECT
  USING (is_admin() OR EXISTS (
    SELECT 1 FROM obras o WHERE o.id = obra_id AND (o.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));
CREATE POLICY "servicos_insert" ON servicos FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM obras o WHERE o.id = obra_id AND (o.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));
CREATE POLICY "servicos_update" ON servicos FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM obras o WHERE o.id = obra_id AND (o.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));
CREATE POLICY "servicos_delete" ON servicos FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM obras o WHERE o.id = obra_id AND (o.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));

-- MEDIÇÕES
CREATE POLICY "medicoes_select" ON medicoes FOR SELECT
  USING (is_admin() OR EXISTS (
    SELECT 1 FROM obras o WHERE o.id = obra_id AND (o.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));
CREATE POLICY "medicoes_insert" ON medicoes FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM obras o WHERE o.id = obra_id AND (o.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));
CREATE POLICY "medicoes_update" ON medicoes FOR UPDATE
  USING (is_admin() OR EXISTS (
    SELECT 1 FROM obras o WHERE o.id = obra_id AND (o.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));
CREATE POLICY "medicoes_delete" ON medicoes FOR DELETE
  USING (is_admin() OR EXISTS (
    SELECT 1 FROM obras o WHERE o.id = obra_id AND (o.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));

-- LINHAS MEMÓRIA
CREATE POLICY "linhas_select" ON linhas_memoria FOR SELECT
  USING (is_admin() OR EXISTS (
    SELECT 1 FROM medicoes m JOIN obras o ON o.id = m.obra_id
    WHERE m.id = medicao_id AND (o.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));
CREATE POLICY "linhas_insert" ON linhas_memoria FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM medicoes m JOIN obras o ON o.id = m.obra_id
    WHERE m.id = medicao_id AND (o.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));
CREATE POLICY "linhas_update" ON linhas_memoria FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM medicoes m JOIN obras o ON o.id = m.obra_id
    WHERE m.id = medicao_id AND (o.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));
CREATE POLICY "linhas_delete" ON linhas_memoria FOR DELETE
  USING (is_admin() OR EXISTS (
    SELECT 1 FROM medicoes m JOIN obras o ON o.id = m.obra_id
    WHERE m.id = medicao_id AND (o.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));

-- FOTOS
CREATE POLICY "fotos_select" ON fotos_medicao FOR SELECT
  USING (is_admin() OR EXISTS (
    SELECT 1 FROM medicoes m JOIN obras o ON o.id = m.obra_id
    WHERE m.id = medicao_id AND (o.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));
CREATE POLICY "fotos_insert" ON fotos_medicao FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM medicoes m JOIN obras o ON o.id = m.obra_id
    WHERE m.id = medicao_id AND (o.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));
CREATE POLICY "fotos_update" ON fotos_medicao FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM medicoes m JOIN obras o ON o.id = m.obra_id
    WHERE m.id = medicao_id AND (o.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));
CREATE POLICY "fotos_delete" ON fotos_medicao FOR DELETE
  USING (is_admin() OR EXISTS (
    SELECT 1 FROM medicoes m JOIN obras o ON o.id = m.obra_id
    WHERE m.id = medicao_id AND (o.user_id = auth.uid() OR is_admin()) AND is_ativo()
  ));

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGER: novos usuários ficam pendentes
-- ═══════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO FINAL
-- ═══════════════════════════════════════════════════════════════════════════

SELECT 'TABELAS CRIADAS:' as info, string_agg(table_name, ', ') as tabelas
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

SELECT email, role, ativo, nome FROM perfis WHERE email = 'setordeorcamentos@rdconstrutora.com';