-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Configuração TOTVS RM + Tabelas de Custos ERP
-- Rodar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- Config de conexão com TOTVS RM (apenas 1 registro, gerenciado por admin)
CREATE TABLE IF NOT EXISTS totvs_config (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_por  UUID REFERENCES auth.users(id),

  -- Conexão
  host            TEXT NOT NULL DEFAULT '',           -- Ex: http://192.168.1.100:8051
  usuario         TEXT NOT NULL DEFAULT '',           -- Usuário do RM
  senha           TEXT NOT NULL DEFAULT '',           -- Será criptografada no frontend
  coligada        INTEGER NOT NULL DEFAULT 1,         -- Código da coligada (1 = padrão)
  filial          INTEGER NOT NULL DEFAULT 1,

  -- Mapeamentos
  contexto        TEXT NOT NULL DEFAULT 'TOTVS',      -- Contexto da API
  timeout_ms      INTEGER NOT NULL DEFAULT 30000,
  ativo           BOOLEAN NOT NULL DEFAULT FALSE,

  -- Última sincronização
  ultima_sync     TIMESTAMPTZ,
  status_sync     TEXT CHECK (status_sync IN ('SUCESSO','ERRO','EM_ANDAMENTO'))
);

DROP TRIGGER IF EXISTS trg_totvs_config_updated ON totvs_config;
CREATE TRIGGER trg_totvs_config_updated
  BEFORE UPDATE ON totvs_config FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: somente admins
ALTER TABLE totvs_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "totvs_config_admin" ON totvs_config FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Custos importados do ERP
CREATE TABLE IF NOT EXISTS custos_erp (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  obra_id         UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  contrato_id     UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  importado_por   UUID REFERENCES auth.users(id),

  tipo_documento  TEXT NOT NULL CHECK (tipo_documento IN ('NF_ENTRADA','NF_SAIDA','FOLHA','EQUIPAMENTO','SERVICO_TERCEIRO','OUTROS')),
  numero_documento TEXT,
  serie           TEXT,
  fornecedor      TEXT,
  cnpj_fornecedor TEXT,

  valor_total     NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_desconto  NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_liquido   NUMERIC(14,2) NOT NULL DEFAULT 0,

  data_emissao    DATE,
  data_vencimento DATE,
  data_pagamento  DATE,

  centro_custo    TEXT,
  conta_contabil  TEXT,
  categoria       TEXT,
  descricao       TEXT,

  status_pagamento TEXT NOT NULL CHECK (status_pagamento IN ('PENDENTE','PAGO','VENCIDO','CANCELADO')) DEFAULT 'PENDENTE',

  id_erp          TEXT,
  origem          TEXT NOT NULL CHECK (origem IN ('IMPORT_EXCEL','API_RM','MANUAL')) DEFAULT 'IMPORT_EXCEL'
);

CREATE INDEX IF NOT EXISTS idx_custos_erp_obra ON custos_erp(obra_id);
CREATE INDEX IF NOT EXISTS idx_custos_erp_contrato ON custos_erp(contrato_id);
CREATE INDEX IF NOT EXISTS idx_custos_erp_id_erp ON custos_erp(id_erp);

-- Log de importação/sync
CREATE TABLE IF NOT EXISTS import_erp_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  importado_por   UUID REFERENCES auth.users(id),
  obra_id         UUID REFERENCES obras(id) ON DELETE SET NULL,
  contrato_id     UUID REFERENCES contratos(id) ON DELETE SET NULL,
  nome_arquivo    TEXT NOT NULL,
  qtd_registros   INTEGER NOT NULL DEFAULT 0,
  valor_total     NUMERIC(14,2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL CHECK (status IN ('SUCESSO','ERRO','PARCIAL')) DEFAULT 'SUCESSO',
  observacao      TEXT
);

-- RLS custos
ALTER TABLE custos_erp ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_erp_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custos_select" ON custos_erp FOR SELECT
  USING (is_admin() OR EXISTS (SELECT 1 FROM obras o WHERE o.id = obra_id AND is_team_visible(o.user_id)));
CREATE POLICY "custos_insert" ON custos_erp FOR INSERT
  WITH CHECK (is_admin() OR EXISTS (SELECT 1 FROM obras o WHERE o.id = obra_id AND is_team_visible(o.user_id)));
CREATE POLICY "custos_update" ON custos_erp FOR UPDATE USING (is_admin());
CREATE POLICY "custos_delete" ON custos_erp FOR DELETE USING (is_admin());

CREATE POLICY "log_select" ON import_erp_log FOR SELECT USING (is_admin() OR auth.uid() = importado_por);
CREATE POLICY "log_insert" ON import_erp_log FOR INSERT WITH CHECK (is_ativo());

-- Função proxy para chamar TOTVS RM via pg_net (se disponível) ou via Edge Function
-- A chamada real será feita pelo frontend via Supabase Edge Function
