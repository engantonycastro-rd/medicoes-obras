-- ═══════════════════════════════════════════════════════════════════════════
-- FIX 33 — CONSTRAINT ROLE + EMPRESA_ID PARA NOVOS USUÁRIOS
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Dropar TODOS os check constraints da coluna role (inclusive inline sem nome)
DO $$ 
DECLARE r RECORD;
BEGIN
  FOR r IN 
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'perfis'
      AND nsp.nspname = 'public'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE perfis DROP CONSTRAINT IF EXISTS %I', r.conname);
    RAISE NOTICE 'Dropou constraint: %', r.conname;
  END LOOP;
END $$;

-- 2. Criar constraint correto com TODOS os 8 cargos
ALTER TABLE perfis ADD CONSTRAINT perfis_role_check 
  CHECK (role IN ('ADMIN','GESTOR','ENGENHEIRO','APONTADOR','ORCAMENTISTA','DIRETOR','SUPERADMIN','LICITANTE'));

-- 3. Atribuir empresa_id da RD para usuários que estão sem empresa
UPDATE perfis 
SET empresa_id = '00000000-0000-0000-0000-000000000001'
WHERE empresa_id IS NULL;

-- 4. Verificação
SELECT id, email, role, ativo, empresa_id FROM perfis ORDER BY created_at DESC LIMIT 10;
