-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX: Remove constraint errada (contrato_id, item) e garante apenas (obra_id, item)
-- Rodar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- Remove a constraint que bloqueia segunda obra
ALTER TABLE servicos DROP CONSTRAINT IF EXISTS servicos_contrato_id_item_key;
ALTER TABLE servicos DROP CONSTRAINT IF EXISTS servicos_contrato_id_item_key1;

-- Garante que a constraint correta existe
ALTER TABLE servicos DROP CONSTRAINT IF EXISTS servicos_obra_id_item_key;
ALTER TABLE servicos ADD CONSTRAINT servicos_obra_id_item_key UNIQUE (obra_id, item);

-- Verifica
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'servicos'::regclass AND contype = 'u';
