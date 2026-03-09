-- ═══════════════════════════════════════════════════════════════════════════
-- CORREÇÃO DE EMERGÊNCIA — Execute no SQL Editor do Supabase
-- Resolve o deadlock: perfil não existe → RLS bloqueia → perfil não pode ser criado
-- ═══════════════════════════════════════════════════════════════════════════

-- PASSO 1: Desabilita RLS temporariamente para poder inserir o admin
ALTER TABLE perfis DISABLE ROW LEVEL SECURITY;

-- PASSO 2: Remove qualquer registro antigo com problema
DELETE FROM perfis
WHERE id = (SELECT id FROM auth.users WHERE email = 'setordeorcamentos@rdconstrutora.com');

-- PASSO 3: Insere seu perfil diretamente como ADMIN ativo
INSERT INTO perfis (id, email, role, ativo, nome)
SELECT
  id,
  'setordeorcamentos@rdconstrutora.com',
  'ADMIN',
  true,
  'Adaylson Castro'
FROM auth.users
WHERE email = 'setordeorcamentos@rdconstrutora.com';

-- PASSO 4: Reabilita o RLS
ALTER TABLE perfis ENABLE ROW LEVEL SECURITY;

-- PASSO 5: Confirma que funcionou — deve retornar 1 linha com role=ADMIN e ativo=true
SELECT
  u.email,
  p.role,
  p.ativo,
  p.nome
FROM auth.users u
JOIN perfis p ON p.id = u.id
WHERE u.email = 'setordeorcamentos@rdconstrutora.com';
