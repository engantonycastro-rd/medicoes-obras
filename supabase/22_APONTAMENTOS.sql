-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Módulo de Apontamento de Obra — Fase 1
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Atualiza role para incluir APONTADOR
ALTER TABLE perfis DROP CONSTRAINT IF EXISTS perfis_role_check;
ALTER TABLE perfis ADD CONSTRAINT perfis_role_check
  CHECK (role IN ('ADMIN','GESTOR','ENGENHEIRO','APONTADOR'));

-- 2. Funções de mão de obra (configurável pelo admin)
CREATE TABLE IF NOT EXISTS funcoes_mao_obra (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome      TEXT NOT NULL UNIQUE,
  ativo     BOOLEAN NOT NULL DEFAULT TRUE,
  ordem     INTEGER NOT NULL DEFAULT 0
);

INSERT INTO funcoes_mao_obra (nome, ordem) VALUES
  ('Pedreiro', 1), ('Servente', 2), ('Eletricista', 3), ('Encanador', 4),
  ('Pintor', 5), ('Carpinteiro', 6), ('Armador', 7)
ON CONFLICT (nome) DO NOTHING;

ALTER TABLE funcoes_mao_obra ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fmo_select" ON funcoes_mao_obra FOR SELECT USING (is_ativo());
CREATE POLICY "fmo_admin"  ON funcoes_mao_obra FOR ALL USING (is_admin());

-- 3. Vínculo apontador ↔ obra (N:N)
CREATE TABLE IF NOT EXISTS apontador_obras (
  id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id  UUID NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
  obra_id  UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  UNIQUE(user_id, obra_id)
);

ALTER TABLE apontador_obras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ao_admin" ON apontador_obras FOR ALL USING (is_admin());
CREATE POLICY "ao_select" ON apontador_obras FOR SELECT USING (user_id = auth.uid());

-- 4. Apontamentos (registro principal)
CREATE TABLE IF NOT EXISTS apontamentos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  obra_id         UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  apontador_id    UUID NOT NULL REFERENCES perfis(id),

  data            DATE NOT NULL,
  hora            TIME NOT NULL DEFAULT NOW()::TIME,
  turno           TEXT NOT NULL DEFAULT 'INTEGRAL' CHECK (turno IN ('MANHA','TARDE','INTEGRAL')),
  clima           TEXT NOT NULL DEFAULT 'SOL' CHECK (clima IN ('SOL','NUBLADO','CHUVA','CHUVOSO')),

  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,

  atividades      TEXT,
  equipamentos    TEXT,
  ocorrencias     JSONB DEFAULT '[]'::jsonb,
  observacoes     TEXT,

  sync_id         TEXT UNIQUE,
  sincronizado    BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_apontamentos_obra ON apontamentos(obra_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_apontamentos_user ON apontamentos(apontador_id);

DROP TRIGGER IF EXISTS set_updated_apontamento ON apontamentos;
CREATE TRIGGER set_updated_apontamento BEFORE UPDATE ON apontamentos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE apontamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "apt_admin" ON apontamentos FOR ALL USING (is_admin());
CREATE POLICY "apt_apontador_select" ON apontamentos FOR SELECT USING (apontador_id = auth.uid());
CREATE POLICY "apt_apontador_insert" ON apontamentos FOR INSERT WITH CHECK (apontador_id = auth.uid());
CREATE POLICY "apt_apontador_update" ON apontamentos FOR UPDATE USING (apontador_id = auth.uid());
CREATE POLICY "apt_gestor_select" ON apontamentos FOR SELECT USING (
  EXISTS (SELECT 1 FROM obras o WHERE o.id = obra_id AND (is_team_visible(o.user_id) OR is_contrato_gestor(o.contrato_id)))
);

-- 5. Mão de obra por apontamento
CREATE TABLE IF NOT EXISTS apontamento_mao_obra (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  apontamento_id  UUID NOT NULL REFERENCES apontamentos(id) ON DELETE CASCADE,
  funcao_id       UUID NOT NULL REFERENCES funcoes_mao_obra(id),
  quantidade      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_apt_mo ON apontamento_mao_obra(apontamento_id);

ALTER TABLE apontamento_mao_obra ENABLE ROW LEVEL SECURITY;
CREATE POLICY "amo_admin" ON apontamento_mao_obra FOR ALL USING (is_admin());
CREATE POLICY "amo_select" ON apontamento_mao_obra FOR SELECT USING (
  EXISTS (SELECT 1 FROM apontamentos a WHERE a.id = apontamento_id AND (a.apontador_id = auth.uid() OR is_admin()))
);
CREATE POLICY "amo_insert" ON apontamento_mao_obra FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM apontamentos a WHERE a.id = apontamento_id AND a.apontador_id = auth.uid())
);

-- 6. Fotos por apontamento
CREATE TABLE IF NOT EXISTS apontamento_fotos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  apontamento_id  UUID NOT NULL REFERENCES apontamentos(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  path            TEXT NOT NULL,
  nome            TEXT,
  legenda         TEXT
);

CREATE INDEX IF NOT EXISTS idx_apt_fotos ON apontamento_fotos(apontamento_id);

ALTER TABLE apontamento_fotos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "af_admin" ON apontamento_fotos FOR ALL USING (is_admin());
CREATE POLICY "af_select" ON apontamento_fotos FOR SELECT USING (
  EXISTS (SELECT 1 FROM apontamentos a WHERE a.id = apontamento_id)
);
CREATE POLICY "af_insert" ON apontamento_fotos FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM apontamentos a WHERE a.id = apontamento_id AND a.apontador_id = auth.uid())
);

-- 7. Conferência PQE por apontamento
CREATE TABLE IF NOT EXISTS apontamento_pqe (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  apontamento_id  UUID NOT NULL REFERENCES apontamentos(id) ON DELETE CASCADE,
  kanban_item_id  UUID NOT NULL REFERENCES kanban_itens(id) ON DELETE CASCADE,
  status          TEXT NOT NULL CHECK (status IN ('CONFIRMADO','PROBLEMA')),
  observacao      TEXT
);

CREATE INDEX IF NOT EXISTS idx_apt_pqe ON apontamento_pqe(apontamento_id);

ALTER TABLE apontamento_pqe ENABLE ROW LEVEL SECURITY;
CREATE POLICY "apqe_admin" ON apontamento_pqe FOR ALL USING (is_admin());
CREATE POLICY "apqe_select" ON apontamento_pqe FOR SELECT USING (
  EXISTS (SELECT 1 FROM apontamentos a WHERE a.id = apontamento_id)
);
CREATE POLICY "apqe_insert" ON apontamento_pqe FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM apontamentos a WHERE a.id = apontamento_id AND a.apontador_id = auth.uid())
);

-- 8. Storage bucket para fotos de apontamento
INSERT INTO storage.buckets (id, name, public) VALUES ('apontamentos', 'apontamentos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "apt_storage_upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'apontamentos' AND auth.role() = 'authenticated');
CREATE POLICY "apt_storage_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'apontamentos' AND auth.role() = 'authenticated');
CREATE POLICY "apt_storage_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'apontamentos' AND is_admin());

-- Verifica
SELECT 'OK!' AS status,
  (SELECT COUNT(*) FROM funcoes_mao_obra) AS funcoes_cadastradas;
