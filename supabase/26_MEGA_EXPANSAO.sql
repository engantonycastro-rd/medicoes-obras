-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 26: Mega-expansão Central de Obras
-- Features: Diário de Obra, Aditivos, Cronograma, Checklist NR-18,
--           Subempreiteiros, RDO, Dashboard Executivo
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══ 1. DIÁRIO DE OBRA ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS diario_obra (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  obra_id         UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  data            DATE NOT NULL,
  criado_por      UUID NOT NULL REFERENCES perfis(id),

  clima_manha     TEXT DEFAULT 'SOL' CHECK (clima_manha IN ('SOL','NUBLADO','CHUVA','CHUVOSO')),
  clima_tarde     TEXT DEFAULT 'SOL' CHECK (clima_tarde IN ('SOL','NUBLADO','CHUVA','CHUVOSO')),

  atividades      TEXT,
  mao_obra_propria INTEGER DEFAULT 0,
  mao_obra_terceiros INTEGER DEFAULT 0,
  equipamentos    TEXT,
  materiais_recebidos TEXT,
  visitantes      TEXT,
  ocorrencias     TEXT,
  observacoes     TEXT,

  -- Validação do engenheiro
  validado        BOOLEAN DEFAULT FALSE,
  validado_por    UUID REFERENCES perfis(id),
  validado_em     TIMESTAMPTZ,

  UNIQUE(obra_id, data)
);

CREATE INDEX idx_diario_obra ON diario_obra(obra_id, data DESC);

DROP TRIGGER IF EXISTS set_updated_diario ON diario_obra;
CREATE TRIGGER set_updated_diario BEFORE UPDATE ON diario_obra
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE diario_obra ENABLE ROW LEVEL SECURITY;
CREATE POLICY "diario_admin" ON diario_obra FOR ALL USING (is_admin());
CREATE POLICY "diario_select" ON diario_obra FOR SELECT USING (is_ativo());
CREATE POLICY "diario_insert" ON diario_obra FOR INSERT WITH CHECK (is_ativo());
CREATE POLICY "diario_update" ON diario_obra FOR UPDATE USING (
  criado_por = auth.uid() OR is_admin() OR EXISTS (
    SELECT 1 FROM obras o WHERE o.id = obra_id AND (is_team_visible(o.user_id) OR is_contrato_gestor(o.contrato_id))
  )
);

-- ═══ 2. ADITIVOS CONTRATUAIS ════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS aditivos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  contrato_id     UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  criado_por      UUID NOT NULL REFERENCES perfis(id),

  numero          INTEGER NOT NULL,
  tipo            TEXT NOT NULL CHECK (tipo IN ('ACRESCIMO','SUPRESSAO','PRAZO','REEQUILIBRIO','MISTO')),
  descricao       TEXT NOT NULL,
  data_assinatura DATE,
  data_publicacao DATE,

  valor_acrescimo NUMERIC(14,2) DEFAULT 0,
  valor_supressao NUMERIC(14,2) DEFAULT 0,
  dias_acrescimo  INTEGER DEFAULT 0,

  documento_path  TEXT,
  documento_nome  TEXT,
  observacoes     TEXT,

  ativo           BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_aditivos_contrato ON aditivos(contrato_id, numero);

ALTER TABLE aditivos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aditivos_admin" ON aditivos FOR ALL USING (is_admin());
CREATE POLICY "aditivos_select" ON aditivos FOR SELECT USING (is_ativo());
CREATE POLICY "aditivos_insert" ON aditivos FOR INSERT WITH CHECK (is_admin());

-- Storage bucket para documentos de aditivos
INSERT INTO storage.buckets (id, name, public) VALUES ('aditivos', 'aditivos', false)
ON CONFLICT (id) DO NOTHING;
CREATE POLICY "aditivos_storage_up" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'aditivos' AND auth.role() = 'authenticated');
CREATE POLICY "aditivos_storage_sel" ON storage.objects FOR SELECT
  USING (bucket_id = 'aditivos' AND auth.role() = 'authenticated');

-- ═══ 3. CRONOGRAMA / MARCOS ═════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS cronograma_marcos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  obra_id         UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  titulo          TEXT NOT NULL,
  descricao       TEXT,
  tipo            TEXT NOT NULL DEFAULT 'ETAPA' CHECK (tipo IN ('INICIO','ETAPA','MEDICAO','MARCO','CONCLUSAO')),
  data_prevista   DATE NOT NULL,
  data_realizada  DATE,
  percentual_previsto NUMERIC(5,2) DEFAULT 0,
  percentual_realizado NUMERIC(5,2) DEFAULT 0,
  cor             TEXT DEFAULT '#3B82F6',
  ordem           INTEGER DEFAULT 0
);

CREATE INDEX idx_cronograma_obra ON cronograma_marcos(obra_id, ordem);

ALTER TABLE cronograma_marcos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crono_admin" ON cronograma_marcos FOR ALL USING (is_admin());
CREATE POLICY "crono_select" ON cronograma_marcos FOR SELECT USING (is_ativo());
CREATE POLICY "crono_gestor" ON cronograma_marcos FOR ALL USING (
  EXISTS (SELECT 1 FROM obras o WHERE o.id = obra_id AND (is_team_visible(o.user_id) OR is_contrato_gestor(o.contrato_id)))
);

-- Campos de prazo na obra (se não existem)
DO $$ BEGIN
  ALTER TABLE obras ADD COLUMN IF NOT EXISTS data_inicio DATE;
  ALTER TABLE obras ADD COLUMN IF NOT EXISTS data_prevista_fim DATE;
  ALTER TABLE obras ADD COLUMN IF NOT EXISTS data_real_fim DATE;
  ALTER TABLE obras ADD COLUMN IF NOT EXISTS percentual_fisico NUMERIC(5,2) DEFAULT 0;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ═══ 4. CHECKLIST NR-18 ═════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS checklist_itens_modelo (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  categoria       TEXT NOT NULL,
  descricao       TEXT NOT NULL,
  norma_ref       TEXT DEFAULT 'NR-18',
  ativo           BOOLEAN DEFAULT TRUE,
  ordem           INTEGER DEFAULT 0
);

-- Itens padrão NR-18
INSERT INTO checklist_itens_modelo (categoria, descricao, ordem) VALUES
  ('EPI', 'Capacete de segurança', 1),
  ('EPI', 'Óculos de proteção', 2),
  ('EPI', 'Protetor auricular', 3),
  ('EPI', 'Luvas de proteção', 4),
  ('EPI', 'Calçado de segurança', 5),
  ('EPI', 'Cinto de segurança (trabalho em altura)', 6),
  ('Proteção Coletiva', 'Guarda-corpo instalado', 10),
  ('Proteção Coletiva', 'Linha de vida', 11),
  ('Proteção Coletiva', 'Tela de proteção', 12),
  ('Proteção Coletiva', 'Plataforma de proteção', 13),
  ('Sinalização', 'Placas de segurança visíveis', 20),
  ('Sinalização', 'Fitas de isolamento de área', 21),
  ('Sinalização', 'Cone/balizador de sinalização', 22),
  ('Ordem e Limpeza', 'Canteiro organizado', 30),
  ('Ordem e Limpeza', 'Entulho sendo removido', 31),
  ('Ordem e Limpeza', 'Passagens desobstruídas', 32),
  ('Instalações', 'Quadro elétrico protegido', 40),
  ('Instalações', 'Fiação sem exposição', 41),
  ('Instalações', 'Banheiro químico disponível', 42),
  ('Instalações', 'Área de vivência adequada', 43),
  ('Instalações', 'Água potável disponível', 44)
ON CONFLICT DO NOTHING;

ALTER TABLE checklist_itens_modelo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chk_modelo_select" ON checklist_itens_modelo FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "chk_modelo_admin" ON checklist_itens_modelo FOR ALL USING (is_admin());

CREATE TABLE IF NOT EXISTS checklist_preenchido (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  obra_id         UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  apontamento_id  UUID REFERENCES apontamentos(id) ON DELETE SET NULL,
  preenchido_por  UUID NOT NULL REFERENCES perfis(id),
  data            DATE NOT NULL,
  observacoes     TEXT,
  score_conformidade NUMERIC(5,2) DEFAULT 0
);

CREATE INDEX idx_checklist_obra ON checklist_preenchido(obra_id, data DESC);

CREATE TABLE IF NOT EXISTS checklist_respostas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  checklist_id    UUID NOT NULL REFERENCES checklist_preenchido(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES checklist_itens_modelo(id),
  conforme        BOOLEAN,
  observacao      TEXT,
  foto_path       TEXT
);

CREATE INDEX idx_checklist_resp ON checklist_respostas(checklist_id);

ALTER TABLE checklist_preenchido ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chk_admin" ON checklist_preenchido FOR ALL USING (is_admin());
CREATE POLICY "chk_select" ON checklist_preenchido FOR SELECT USING (is_ativo());
CREATE POLICY "chk_insert" ON checklist_preenchido FOR INSERT WITH CHECK (is_ativo());

ALTER TABLE checklist_respostas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chkr_admin" ON checklist_respostas FOR ALL USING (is_admin());
CREATE POLICY "chkr_select" ON checklist_respostas FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "chkr_insert" ON checklist_respostas FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Apontador pode preencher checklist
CREATE POLICY "chk_apontador" ON checklist_preenchido FOR INSERT WITH CHECK (is_apontador_obra(obra_id));
CREATE POLICY "chk_apontador_sel" ON checklist_preenchido FOR SELECT USING (is_apontador_obra(obra_id));

-- ═══ 5. SUBEMPREITEIROS ═════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS subempreiteiros (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  razao_social    TEXT NOT NULL,
  cnpj            TEXT,
  contato_nome    TEXT,
  contato_telefone TEXT,
  contato_email   TEXT,
  especialidade   TEXT,
  ativo           BOOLEAN DEFAULT TRUE,
  observacoes     TEXT
);

ALTER TABLE subempreiteiros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sub_admin" ON subempreiteiros FOR ALL USING (is_admin());
CREATE POLICY "sub_select" ON subempreiteiros FOR SELECT USING (is_ativo());

CREATE TABLE IF NOT EXISTS subempreiteiro_obras (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subempreiteiro_id UUID NOT NULL REFERENCES subempreiteiros(id) ON DELETE CASCADE,
  obra_id         UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  servico         TEXT,
  valor_contratado NUMERIC(14,2) DEFAULT 0,
  valor_medido    NUMERIC(14,2) DEFAULT 0,
  valor_pago      NUMERIC(14,2) DEFAULT 0,
  status          TEXT DEFAULT 'ATIVO' CHECK (status IN ('ATIVO','CONCLUIDO','CANCELADO')),
  UNIQUE(subempreiteiro_id, obra_id)
);

ALTER TABLE subempreiteiro_obras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subo_admin" ON subempreiteiro_obras FOR ALL USING (is_admin());
CREATE POLICY "subo_select" ON subempreiteiro_obras FOR SELECT USING (is_ativo());

CREATE TABLE IF NOT EXISTS subempreiteiro_medicoes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sub_obra_id     UUID NOT NULL REFERENCES subempreiteiro_obras(id) ON DELETE CASCADE,
  referencia      TEXT NOT NULL,
  valor           NUMERIC(14,2) NOT NULL,
  data_medicao    DATE,
  data_pagamento  DATE,
  status          TEXT DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE','APROVADO','PAGO','GLOSADO')),
  observacoes     TEXT
);

ALTER TABLE subempreiteiro_medicoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subm_admin" ON subempreiteiro_medicoes FOR ALL USING (is_admin());
CREATE POLICY "subm_select" ON subempreiteiro_medicoes FOR SELECT USING (is_ativo());

CREATE TABLE IF NOT EXISTS subempreiteiro_documentos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subempreiteiro_id UUID NOT NULL REFERENCES subempreiteiros(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL,
  nome            TEXT NOT NULL,
  path            TEXT NOT NULL,
  validade        DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE subempreiteiro_documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subd_admin" ON subempreiteiro_documentos FOR ALL USING (is_admin());
CREATE POLICY "subd_select" ON subempreiteiro_documentos FOR SELECT USING (is_ativo());

INSERT INTO storage.buckets (id, name, public) VALUES ('subempreiteiros', 'subempreiteiros', false)
ON CONFLICT (id) DO NOTHING;
CREATE POLICY "sub_storage_up" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'subempreiteiros' AND auth.role() = 'authenticated');
CREATE POLICY "sub_storage_sel" ON storage.objects FOR SELECT
  USING (bucket_id = 'subempreiteiros' AND auth.role() = 'authenticated');

-- ═══ 6. RDO — Relatório Diário de Obra ═══════════════════════════════════════
-- O RDO é gerado a partir do diário de obra + dados do apontamento
-- Tabela separada para controlar status de emissão e assinatura
CREATE TABLE IF NOT EXISTS rdo (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  diario_id       UUID NOT NULL REFERENCES diario_obra(id) ON DELETE CASCADE,
  obra_id         UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  data            DATE NOT NULL,

  -- Dados complementares do engenheiro
  parecer_tecnico TEXT,
  pendencias      TEXT,
  providencias    TEXT,

  -- Status
  status          TEXT DEFAULT 'RASCUNHO' CHECK (status IN ('RASCUNHO','EMITIDO','ASSINADO')),
  emitido_por     UUID REFERENCES perfis(id),
  emitido_em      TIMESTAMPTZ,
  assinado_por    UUID REFERENCES perfis(id),
  assinado_em     TIMESTAMPTZ,

  pdf_path        TEXT,

  UNIQUE(diario_id)
);

CREATE INDEX idx_rdo_obra ON rdo(obra_id, data DESC);

ALTER TABLE rdo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rdo_admin" ON rdo FOR ALL USING (is_admin());
CREATE POLICY "rdo_select" ON rdo FOR SELECT USING (is_ativo());
CREATE POLICY "rdo_gestor" ON rdo FOR ALL USING (
  EXISTS (SELECT 1 FROM obras o WHERE o.id = obra_id AND (is_team_visible(o.user_id) OR is_contrato_gestor(o.contrato_id)))
);

-- ═══ 7. CARGO DIRETOR (Dashboard Executivo) ═════════════════════════════════
ALTER TABLE perfis DROP CONSTRAINT IF EXISTS perfis_role_check;
ALTER TABLE perfis ADD CONSTRAINT perfis_role_check
  CHECK (role IN ('ADMIN','GESTOR','ENGENHEIRO','APONTADOR','ORCAMENTISTA','DIRETOR'));

-- Diretor pode ver tudo (leitura) mas não editar
CREATE OR REPLACE FUNCTION is_diretor()
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM perfis WHERE id = auth.uid() AND role = 'DIRETOR' AND ativo = TRUE);
$$;

-- Policies de leitura para diretor em todas as tabelas principais
CREATE POLICY "contratos_diretor" ON contratos FOR SELECT USING (is_diretor());
CREATE POLICY "obras_diretor" ON obras FOR SELECT USING (is_diretor());
CREATE POLICY "servicos_diretor" ON servicos FOR SELECT USING (is_diretor());
CREATE POLICY "medicoes_diretor" ON medicoes FOR SELECT USING (is_diretor());
CREATE POLICY "apontamentos_diretor" ON apontamentos FOR SELECT USING (is_diretor());
CREATE POLICY "diario_diretor" ON diario_obra FOR SELECT USING (is_diretor());
CREATE POLICY "aditivos_diretor" ON aditivos FOR SELECT USING (is_diretor());
CREATE POLICY "cronograma_diretor" ON cronograma_marcos FOR SELECT USING (is_diretor());
CREATE POLICY "checklist_diretor" ON checklist_preenchido FOR SELECT USING (is_diretor());
CREATE POLICY "sub_diretor" ON subempreiteiros FOR SELECT USING (is_diretor());
CREATE POLICY "subo_diretor" ON subempreiteiro_obras FOR SELECT USING (is_diretor());
CREATE POLICY "rdo_diretor" ON rdo FOR SELECT USING (is_diretor());

-- ═══ FIM ═════════════════════════════════════════════════════════════════════
SELECT 'OK! Todas as tabelas criadas.' AS status,
  (SELECT COUNT(*) FROM checklist_itens_modelo) AS itens_nr18;
