-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 40: Campos de geolocalização nas obras (Mapa de Obras)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE obras ADD COLUMN IF NOT EXISTS latitude  NUMERIC(10,7);
ALTER TABLE obras ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);
