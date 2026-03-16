-- ═══════════════════════════════════════════════════════════════════════════
-- PASSO 1: APAGA TUDO — Execute primeiro, espere terminar
-- ═══════════════════════════════════════════════════════════════════════════

-- Remove triggers
DROP TRIGGER IF EXISTS on_auth_user_created    ON auth.users;
DROP TRIGGER IF EXISTS trg_contratos_updated_at ON contratos;
DROP TRIGGER IF EXISTS trg_medicoes_updated_at  ON medicoes;
DROP TRIGGER IF EXISTS trg_linhas_updated_at    ON linhas_memoria;
DROP TRIGGER IF EXISTS trg_perfis_updated_at    ON perfis;

-- Remove funções
DROP FUNCTION IF EXISTS handle_new_user()        CASCADE;
DROP FUNCTION IF EXISTS set_updated_at()         CASCADE;
DROP FUNCTION IF EXISTS is_admin()               CASCADE;
DROP FUNCTION IF EXISTS is_ativo()               CASCADE;
DROP FUNCTION IF EXISTS admin_criar_usuario(text, text, text) CASCADE;

-- Remove views
DROP VIEW IF EXISTS vw_resumo_servicos CASCADE;

-- Remove tabelas (ordem importa por causa das FKs)
DROP TABLE IF EXISTS linhas_memoria CASCADE;
DROP TABLE IF EXISTS medicoes       CASCADE;
DROP TABLE IF EXISTS servicos       CASCADE;
DROP TABLE IF EXISTS contratos      CASCADE;
DROP TABLE IF EXISTS perfis         CASCADE;

-- Confirma que está tudo limpo
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
-- Deve retornar vazio (0 rows)
