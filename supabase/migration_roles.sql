-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: Sistema de Perfis, Roles e Visibilidade de Equipe
-- Execute este script no SQL Editor do Supabase
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. TABELA DE PERFIS ─────────────────────────────────────────────────────
-- Estende auth.users com role e status de aprovação

create table if not exists perfis (
  id           uuid primary key references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  email        text not null,
  nome         text,
  role         text not null check (role in ('ADMIN','ENGENHEIRO')) default 'ENGENHEIRO',
  ativo        boolean not null default false,  -- false até o admin aprovar
  criado_por   uuid references auth.users(id)   -- quem criou/aprovou
);

alter table perfis enable row level security;

-- Trigger updated_at
create trigger trg_perfis_updated_at
  before update on perfis
  for each row execute function set_updated_at();

-- ─── 2. FUNÇÃO: verificar se usuário é ADMIN ─────────────────────────────────

create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from perfis
    where id = auth.uid()
    and role = 'ADMIN'
    and ativo = true
  );
$$;

-- ─── 3. FUNÇÃO: verificar se usuário está ativo ───────────────────────────────

create or replace function is_ativo()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from perfis
    where id = auth.uid()
    and ativo = true
  );
$$;

-- ─── 4. POLÍTICAS RLS DOS PERFIS ─────────────────────────────────────────────

-- Qualquer usuário autenticado vê seu próprio perfil
create policy "Perfil próprio"
  on perfis for select
  using (auth.uid() = id);

-- Admin vê todos os perfis
create policy "Admin vê todos os perfis"
  on perfis for select
  using (is_admin());

-- Admin pode inserir/atualizar/deletar perfis
create policy "Admin gerencia perfis"
  on perfis for all
  using (is_admin());

-- Permite inserção do próprio perfil no cadastro (antes de ser admin)
create policy "Auto-cadastro de perfil"
  on perfis for insert
  with check (auth.uid() = id);

-- ─── 5. REMOVER POLÍTICAS ANTIGAS DOS CONTRATOS ──────────────────────────────

drop policy if exists "Contratos do usuário"            on contratos;
drop policy if exists "Serviços do contrato do usuário" on servicos;
drop policy if exists "Medições do contrato do usuário" on medicoes;
drop policy if exists "Linhas de memória do usuário"    on linhas_memoria;

-- ─── 6. NOVAS POLÍTICAS RLS — VISIBILIDADE POR EQUIPE ────────────────────────
-- Admin vê TUDO | Engenheiro ativo vê apenas seus próprios dados

-- CONTRATOS
create policy "Contratos - admin vê todos"
  on contratos for select
  using (is_admin());

create policy "Contratos - engenheiro vê os seus"
  on contratos for select
  using (auth.uid() = user_id and is_ativo());

create policy "Contratos - engenheiro insere"
  on contratos for insert
  with check (auth.uid() = user_id and is_ativo());

create policy "Contratos - engenheiro atualiza os seus"
  on contratos for update
  using (auth.uid() = user_id and is_ativo());

create policy "Contratos - admin atualiza todos"
  on contratos for update
  using (is_admin());

create policy "Contratos - engenheiro deleta os seus"
  on contratos for delete
  using (auth.uid() = user_id and is_ativo());

create policy "Contratos - admin deleta todos"
  on contratos for delete
  using (is_admin());

-- SERVIÇOS
create policy "Serviços - visibilidade"
  on servicos for select
  using (
    is_admin()
    or exists (
      select 1 from contratos c
      where c.id = contrato_id
      and (c.user_id = auth.uid() or is_admin())
      and is_ativo()
    )
  );

create policy "Serviços - escrita"
  on servicos for insert
  with check (
    exists (
      select 1 from contratos c
      where c.id = contrato_id
      and (c.user_id = auth.uid() or is_admin())
      and is_ativo()
    )
  );

create policy "Serviços - update"
  on servicos for update
  using (
    exists (
      select 1 from contratos c
      where c.id = contrato_id
      and (c.user_id = auth.uid() or is_admin())
      and is_ativo()
    )
  );

create policy "Serviços - delete"
  on servicos for delete
  using (
    exists (
      select 1 from contratos c
      where c.id = contrato_id
      and (c.user_id = auth.uid() or is_admin())
      and is_ativo()
    )
  );

-- MEDIÇÕES
create policy "Medições - visibilidade"
  on medicoes for select
  using (
    is_admin()
    or exists (
      select 1 from contratos c
      where c.id = contrato_id
      and (c.user_id = auth.uid() or is_admin())
      and is_ativo()
    )
  );

create policy "Medições - escrita"
  on medicoes for insert
  with check (
    exists (
      select 1 from contratos c
      where c.id = contrato_id
      and (c.user_id = auth.uid() or is_admin())
      and is_ativo()
    )
  );

create policy "Medições - update"
  on medicoes for update
  using (
    exists (
      select 1 from contratos c
      where c.id = contrato_id
      and (c.user_id = auth.uid() or is_admin())
      and is_ativo()
    )
  );

create policy "Medições - delete"
  on medicoes for delete
  using (
    exists (
      select 1 from contratos c
      where c.id = contrato_id
      and (c.user_id = auth.uid() or is_admin())
      and is_ativo()
    )
  );

-- LINHAS MEMÓRIA
create policy "Linhas - visibilidade"
  on linhas_memoria for select
  using (
    is_admin()
    or exists (
      select 1 from medicoes m
      join contratos c on c.id = m.contrato_id
      where m.id = medicao_id
      and (c.user_id = auth.uid() or is_admin())
      and is_ativo()
    )
  );

create policy "Linhas - escrita"
  on linhas_memoria for insert
  with check (
    exists (
      select 1 from medicoes m
      join contratos c on c.id = m.contrato_id
      where m.id = medicao_id
      and (c.user_id = auth.uid() or is_admin())
      and is_ativo()
    )
  );

create policy "Linhas - update"
  on linhas_memoria for update
  using (
    exists (
      select 1 from medicoes m
      join contratos c on c.id = m.contrato_id
      where m.id = medicao_id
      and (c.user_id = auth.uid() or is_admin())
      and is_ativo()
    )
  );

create policy "Linhas - delete"
  on linhas_memoria for delete
  using (
    exists (
      select 1 from medicoes m
      join contratos c on c.id = m.contrato_id
      where m.id = medicao_id
      and (c.user_id = auth.uid() or is_admin())
      and is_ativo()
    )
  );

-- ─── 7. INSERIR SEU USUÁRIO ADMIN ────────────────────────────────────────────
-- Substitua o UUID abaixo pelo seu user ID (veja em Authentication > Users no Supabase)

-- PASSO: vá em Authentication > Users, copie o UUID do setordeorcamentos@rdconstrutora.com
-- e substitua 'SEU-UUID-AQUI' abaixo:

insert into perfis (id, email, role, ativo, nome)
values (
  (select id from auth.users where email = 'setordeorcamentos@rdconstrutora.com'),
  'setordeorcamentos@rdconstrutora.com',
  'ADMIN',
  true,
  'Adaylson Castro'
)
on conflict (id) do update
  set role = 'ADMIN', ativo = true, nome = 'Adaylson Castro';

-- ─── 8. TRIGGER: criar perfil pendente ao se cadastrar ───────────────────────
-- Quando qualquer usuário se cadastra, cria um perfil com ativo=false automaticamente

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into perfis (id, email, role, ativo)
  values (
    new.id,
    new.email,
    'ENGENHEIRO',
    false  -- pendente de aprovação do admin
  )
  on conflict (id) do nothing;  -- não sobrescreve o admin
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─── 9. FUNÇÃO ADMIN: criar usuário via invite ───────────────────────────────
-- Usada pelo painel admin para criar usuários diretamente

create or replace function admin_criar_usuario(
  p_email text,
  p_nome  text,
  p_role  text default 'ENGENHEIRO'
)
returns json
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
begin
  -- Verifica se quem chama é admin
  if not is_admin() then
    raise exception 'Acesso negado: apenas administradores podem criar usuários';
  end if;

  -- Busca ou cria o usuário em auth.users via invite
  -- (O convite será enviado pelo Supabase Auth)
  select id into v_user_id from auth.users where email = p_email;

  if v_user_id is null then
    -- Usuário não existe ainda — insere perfil pendente para quando se cadastrar
    -- O admin deve usar o painel Supabase ou enviar convite manualmente
    return json_build_object(
      'success', false,
      'message', 'Usuário não encontrado. Peça para ele se cadastrar primeiro, depois ative-o aqui.'
    );
  end if;

  -- Atualiza/cria o perfil
  insert into perfis (id, email, nome, role, ativo, criado_por)
  values (v_user_id, p_email, p_nome, p_role, true, auth.uid())
  on conflict (id) do update
    set nome = p_nome, role = p_role, ativo = true, criado_por = auth.uid(), updated_at = now();

  return json_build_object(
    'success', true,
    'user_id', v_user_id,
    'message', 'Usuário ativado com sucesso'
  );
end;
$$;
