-- ═══════════════════════════════════════════════════════════════════════════
-- CORREÇÃO: Garante que seu perfil ADMIN está correto
-- Execute este script no SQL Editor do Supabase
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Verifica se seu perfil existe
SELECT id, email, role, ativo FROM perfis
WHERE email = 'setordeorcamentos@rdconstrutora.com';

-- Se retornou vazio ou role/ativo errado, rode o bloco abaixo:

-- 2. Insere/corrige seu perfil como ADMIN ativo
INSERT INTO perfis (id, email, role, ativo, nome)
SELECT
  id,
  email,
  'ADMIN',
  true,
  'Adaylson Castro'
FROM auth.users
WHERE email = 'setordeorcamentos@rdconstrutora.com'
ON CONFLICT (id) DO UPDATE
  SET role  = 'ADMIN',
      ativo = true,
      nome  = COALESCE(perfis.nome, 'Adaylson Castro');

-- 3. Verifica se a tabela perfis existe e tem RLS correto
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename = 'perfis';

-- 4. Confirma as políticas RLS ativas
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'perfis';

-- 5. Garante política de leitura do próprio perfil (caso não exista)
DO $$
BEGIN
  -- Remove duplicatas se existirem
  DROP POLICY IF EXISTS "Perfil próprio"       ON perfis;
  DROP POLICY IF EXISTS "Admin vê todos os perfis" ON perfis;
  DROP POLICY IF EXISTS "Admin gerencia perfis" ON perfis;
  DROP POLICY IF EXISTS "Auto-cadastro de perfil" ON perfis;

  -- Recria limpas
  CREATE POLICY "Perfil próprio"
    ON perfis FOR SELECT
    USING (auth.uid() = id);

  CREATE POLICY "Admin vê todos os perfis"
    ON perfis FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM perfis p2
        WHERE p2.id = auth.uid()
        AND p2.role = 'ADMIN'
        AND p2.ativo = true
      )
    );

  CREATE POLICY "Admin gerencia perfis"
    ON perfis FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM perfis p2
        WHERE p2.id = auth.uid()
        AND p2.role = 'ADMIN'
        AND p2.ativo = true
      )
    );

  CREATE POLICY "Auto-cadastro de perfil"
    ON perfis FOR INSERT
    WITH CHECK (auth.uid() = id);

END $$;

-- 6. Verifica todos os usuários cadastrados
SELECT
  u.email,
  p.role,
  p.ativo,
  p.nome,
  p.created_at
FROM auth.users u
LEFT JOIN perfis p ON p.id = u.id
ORDER BY u.created_at;
