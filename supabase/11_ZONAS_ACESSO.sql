-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Zonas de Acesso por Localização
-- Rodar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- Zonas de acesso (cadastradas pelo admin)
CREATE TABLE IF NOT EXISTS zonas_acesso (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por      UUID REFERENCES auth.users(id),

  nome            TEXT NOT NULL,                        -- "Escritório RD", "Natal-RN", etc.
  tipo            TEXT NOT NULL CHECK (tipo IN ('ESCRITORIO','CIDADE')),

  -- ESCRITORIO: ponto + raio
  latitude        NUMERIC(10,7),
  longitude       NUMERIC(10,7),
  raio_metros     INTEGER DEFAULT 500,                  -- raio em metros

  -- CIDADE: estado + cidade
  estado          TEXT,                                  -- "RN", "PB", etc.
  cidade          TEXT,                                  -- "Natal", "João Pessoa"

  ativo           BOOLEAN NOT NULL DEFAULT TRUE
);

-- Vínculo usuário ↔ zona (N:N)
CREATE TABLE IF NOT EXISTS usuario_zonas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
  zona_id         UUID NOT NULL REFERENCES zonas_acesso(id) ON DELETE CASCADE,
  UNIQUE(user_id, zona_id)
);

CREATE INDEX IF NOT EXISTS idx_usuario_zonas_user ON usuario_zonas(user_id);
CREATE INDEX IF NOT EXISTS idx_usuario_zonas_zona ON usuario_zonas(zona_id);

-- RLS
ALTER TABLE zonas_acesso ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuario_zonas ENABLE ROW LEVEL SECURITY;

-- Zonas: todos veem, admin CRUD
CREATE POLICY "zonas_select" ON zonas_acesso FOR SELECT USING (is_ativo());
CREATE POLICY "zonas_insert" ON zonas_acesso FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "zonas_update" ON zonas_acesso FOR UPDATE USING (is_admin());
CREATE POLICY "zonas_delete" ON zonas_acesso FOR DELETE USING (is_admin());

-- Vínculos: todos veem, admin CRUD
CREATE POLICY "uz_select" ON usuario_zonas FOR SELECT USING (is_ativo());
CREATE POLICY "uz_insert" ON usuario_zonas FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "uz_delete" ON usuario_zonas FOR DELETE USING (is_admin());

-- Função para verificar se usuário está em zona permitida
-- Recebe lat/lng do browser, retorna true se dentro de alguma zona
CREATE OR REPLACE FUNCTION verificar_zona_acesso(
  p_user_id UUID,
  p_latitude NUMERIC,
  p_longitude NUMERIC
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
  v_zona RECORD;
  v_distancia NUMERIC;
  v_is_admin BOOLEAN;
BEGIN
  -- Admins sempre passam
  SELECT role = 'ADMIN' INTO v_is_admin FROM perfis WHERE id = p_user_id;
  IF v_is_admin THEN RETURN TRUE; END IF;

  -- Se não tem zonas atribuídas, acesso livre
  SELECT COUNT(*) INTO v_count
  FROM usuario_zonas uz
  JOIN zonas_acesso z ON z.id = uz.zona_id AND z.ativo = TRUE
  WHERE uz.user_id = p_user_id;

  IF v_count = 0 THEN RETURN TRUE; END IF;

  -- Verifica cada zona atribuída
  FOR v_zona IN
    SELECT z.*
    FROM usuario_zonas uz
    JOIN zonas_acesso z ON z.id = uz.zona_id AND z.ativo = TRUE
    WHERE uz.user_id = p_user_id
  LOOP
    IF v_zona.tipo = 'ESCRITORIO' AND v_zona.latitude IS NOT NULL THEN
      -- Fórmula de Haversine simplificada (distância em metros)
      v_distancia := 6371000 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(p_latitude - v_zona.latitude) / 2), 2) +
        COS(RADIANS(v_zona.latitude)) * COS(RADIANS(p_latitude)) *
        POWER(SIN(RADIANS(p_longitude - v_zona.longitude) / 2), 2)
      ));
      IF v_distancia <= v_zona.raio_metros THEN RETURN TRUE; END IF;
    END IF;

    IF v_zona.tipo = 'CIDADE' AND v_zona.estado IS NOT NULL THEN
      -- Para zona de cidade, usamos geocoding reverso no frontend
      -- Aqui apenas verificamos se a zona existe (a validação real é no frontend)
      RETURN TRUE;
    END IF;
  END LOOP;

  RETURN FALSE;
END;
$$;
