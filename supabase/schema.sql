-- ═══════════════════════════════════════════════════════════════════════════
-- SISTEMA DE MEDIÇÕES DE OBRAS PÚBLICAS
-- Schema Supabase / PostgreSQL
-- ═══════════════════════════════════════════════════════════════════════════

-- Habilitar extensões
create extension if not exists "uuid-ossp";

-- ─── CONTRATOS ───────────────────────────────────────────────────────────────

create table contratos (
  id                    uuid primary key default uuid_generate_v4(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- Identificação
  nome_obra             text not null,
  local_obra            text not null,
  numero_contrato       text,
  tipo                  text not null check (tipo in ('ESTADO','PREFEITURA')) default 'ESTADO',

  -- Órgão
  orgao_nome            text not null,
  orgao_subdivisao      text,

  -- Empresa
  empresa_executora     text not null,

  -- Financeiro
  desconto_percentual   numeric(8,6) not null default 0,
  bdi_percentual        numeric(8,6) not null default 0.30091,
  bdi_preco_unitario    numeric(8,6) default 1.2452,
  data_base_planilha    text,

  -- Prazos
  data_ordem_servico    date,
  prazo_execucao_dias   integer default 120,

  -- Controle
  status                text not null check (status in ('ATIVO','CONCLUIDO','SUSPENSO')) default 'ATIVO',
  user_id               uuid references auth.users(id) on delete cascade
);

-- ─── SERVIÇOS (itens do orçamento) ───────────────────────────────────────────

create table servicos (
  id              uuid primary key default uuid_generate_v4(),
  contrato_id     uuid not null references contratos(id) on delete cascade,
  created_at      timestamptz not null default now(),

  -- Identificação
  item            text not null,       -- "1.1", "2.3", "10.0"
  fonte           text not null,
  codigo          text,
  descricao       text not null,
  unidade         text not null,
  quantidade      numeric(14,4) not null default 0,
  preco_unitario  numeric(14,4) not null default 0,

  -- Organização
  is_grupo        boolean not null default false,
  grupo_item      text,                -- referência ao item pai "1.0"
  ordem           integer not null default 0,

  unique(contrato_id, item)
);

-- ─── MEDIÇÕES ────────────────────────────────────────────────────────────────

create table medicoes (
  id              uuid primary key default uuid_generate_v4(),
  contrato_id     uuid not null references contratos(id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  numero          integer not null,
  numero_extenso  text not null,        -- "1ª", "2ª", "3ª"...
  data_medicao    date not null,
  status          text not null check (status in ('RASCUNHO','ENVIADA','APROVADA')) default 'RASCUNHO',
  observacoes     text,

  unique(contrato_id, numero)
);

-- ─── LINHAS DA MEMÓRIA DE CÁLCULO ────────────────────────────────────────────

create table linhas_memoria (
  id                  uuid primary key default uuid_generate_v4(),
  medicao_id          uuid not null references medicoes(id) on delete cascade,
  servico_id          uuid not null references servicos(id) on delete cascade,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Sub-item
  sub_item            text not null,           -- "1.1.1", "1.1.2"
  descricao_calculo   text not null default '', -- descrição livre

  -- Campos dimensionais
  largura             numeric(14,4),
  comprimento         numeric(14,4),
  altura              numeric(14,4),
  perimetro           numeric(14,4),
  area                numeric(14,4),
  volume              numeric(14,4),
  kg                  numeric(14,4),
  outros              numeric(14,4),
  desconto_dim        numeric(14,4),
  quantidade          numeric(14,4),

  -- Resultado
  total               numeric(14,4) not null default 0,
  status              text not null check (status in ('A pagar','Pago','Não executado')) default 'A pagar',
  observacao          text
);

-- ─── ÍNDICES ─────────────────────────────────────────────────────────────────

create index idx_servicos_contrato    on servicos(contrato_id);
create index idx_servicos_item        on servicos(contrato_id, item);
create index idx_medicoes_contrato    on medicoes(contrato_id);
create index idx_linhas_medicao       on linhas_memoria(medicao_id);
create index idx_linhas_servico       on linhas_memoria(servico_id);

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────

alter table contratos      enable row level security;
alter table servicos       enable row level security;
alter table medicoes       enable row level security;
alter table linhas_memoria enable row level security;

-- Políticas: usuário só vê seus próprios contratos e dados relacionados
create policy "Contratos do usuário"
  on contratos for all
  using (auth.uid() = user_id);

create policy "Serviços do contrato do usuário"
  on servicos for all
  using (exists (
    select 1 from contratos c where c.id = contrato_id and c.user_id = auth.uid()
  ));

create policy "Medições do contrato do usuário"
  on medicoes for all
  using (exists (
    select 1 from contratos c where c.id = contrato_id and c.user_id = auth.uid()
  ));

create policy "Linhas de memória do usuário"
  on linhas_memoria for all
  using (exists (
    select 1 from medicoes m
    join contratos c on c.id = m.contrato_id
    where m.id = medicao_id and c.user_id = auth.uid()
  ));

-- ─── TRIGGER: updated_at automático ─────────────────────────────────────────

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_contratos_updated_at
  before update on contratos
  for each row execute function set_updated_at();

create trigger trg_medicoes_updated_at
  before update on medicoes
  for each row execute function set_updated_at();

create trigger trg_linhas_updated_at
  before update on linhas_memoria
  for each row execute function set_updated_at();

-- ─── VIEW: resumo por serviço por medição ────────────────────────────────────
-- Calcula acumulado anterior (status 'Pago') e período (status 'A pagar')

create or replace view vw_resumo_servicos as
select
  lm.medicao_id,
  lm.servico_id,
  s.item,
  s.descricao,
  s.unidade,
  s.quantidade                                                          as qtd_prevista,
  s.preco_unitario,

  -- Totais por status
  coalesce(sum(lm.total) filter (where lm.status = 'Pago'),          0) as qtd_anterior,
  coalesce(sum(lm.total) filter (where lm.status = 'A pagar'),       0) as qtd_periodo,
  coalesce(sum(lm.total) filter (where lm.status in ('Pago','A pagar')), 0) as qtd_acumulada

from linhas_memoria lm
join servicos s on s.id = lm.servico_id
group by lm.medicao_id, lm.servico_id, s.item, s.descricao, s.unidade, s.quantidade, s.preco_unitario;
