-- Migration: Adiciona campo periodo_referencia na tabela medicoes
-- Rodar no Supabase SQL Editor

ALTER TABLE medicoes ADD COLUMN IF NOT EXISTS periodo_referencia TEXT;

COMMENT ON COLUMN medicoes.periodo_referencia IS 'Período de referência da medição, ex: 02/03/2026 à 10/03/2026';
