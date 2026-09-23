-- Schema inicial da agenda.
-- Horários são armazenados em timestamptz; a clínica opera em America/Sao_Paulo.

create type status_atendimento as enum (
  'marcado',
  'confirmado',
  'atendido',
  'faltou',
  'desmarcado'
);

-- Atualiza automaticamente a coluna atualizado_em.
create function set_atualizado_em() returns trigger
language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

-- Profissionais ---------------------------------------------------------------

create table profissionais (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  especialidade text,
  cor text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Jornada semanal de trabalho. Um profissional pode ter vários intervalos
-- no mesmo dia (ex.: 08:00–12:00 e 13:00–18:00).
create table jornadas (
  id uuid primary key default gen_random_uuid(),
  profissional_id uuid not null references profissionais on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6), -- 0 = domingo
  hora_inicio time not null,
  hora_fim time not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (hora_fim > hora_inicio)
);

create index on jornadas (profissional_id, dia_semana);

-- Planos / convênios ----------------------------------------------------------
-- Definem a cor do card e os padrões de duração e valor do atendimento.

create table planos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  cor text not null,
  duracao_padrao_min integer not null default 45 check (duracao_padrao_min > 0),
  valor_padrao numeric(10, 2) check (valor_padrao >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table tipos_atendimento (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Pacientes -------------------------------------------------------------------

create table pacientes (
  id uuid primary key default gen_random_uuid(),
  id_legado integer unique, -- ID no sistema anterior
  nome text not null,
  responsavel text,
  data_nascimento date,
  cpf text,
  celular text,
  email text,
  endereco text,
  bairro text,
  cidade text,
  uf char(2),
  cep text,
  plano_id uuid references planos on delete set null,
  profissional_responsavel_id uuid references profissionais on delete set null,
  observacoes text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index on pacientes (nome);

-- Recorrências ----------------------------------------------------------------
-- Regra que gera atendimentos repetidos num período. Cada ocorrência gerada
-- é um atendimento independente, que pode ser movido ou cancelado sozinho.

create table recorrencias (
  id uuid primary key default gen_random_uuid(),
  profissional_id uuid not null references profissionais on delete cascade,
  paciente_id uuid references pacientes on delete cascade,
  plano_id uuid references planos on delete set null,
  tipo_id uuid references tipos_atendimento on delete set null,
  dias_semana smallint[] not null check (dias_semana <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  hora_inicio time not null,
  duracao_min integer not null check (duracao_min > 0),
  intervalo_semanas integer not null default 1 check (intervalo_semanas > 0),
  data_inicio date not null,
  data_fim date not null,
  valor numeric(10, 2) check (valor >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (data_fim >= data_inicio)
);

-- Atendimentos ----------------------------------------------------------------
-- Atendimentos paralelos do mesmo profissional são permitidos (a interface
-- apenas avisa), por isso não há restrição de sobreposição.

create table atendimentos (
  id uuid primary key default gen_random_uuid(),
  id_legado integer unique, -- ID no sistema anterior
  recorrencia_id uuid references recorrencias on delete set null,
  profissional_id uuid not null references profissionais on delete restrict,
  paciente_id uuid references pacientes on delete restrict,
  plano_id uuid references planos on delete set null,
  tipo_id uuid references tipos_atendimento on delete set null,
  inicio timestamptz not null,
  fim timestamptz not null,
  valor numeric(10, 2) check (valor >= 0),
  status status_atendimento not null default 'marcado',
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (fim > inicio)
);

create index on atendimentos (inicio);
create index on atendimentos (profissional_id, inicio);
create index on atendimentos (paciente_id, inicio);
create index on atendimentos (recorrencia_id);

-- Triggers de atualizado_em ---------------------------------------------------

create trigger set_atualizado_em before update on profissionais
  for each row execute function set_atualizado_em();
create trigger set_atualizado_em before update on jornadas
  for each row execute function set_atualizado_em();
create trigger set_atualizado_em before update on planos
  for each row execute function set_atualizado_em();
create trigger set_atualizado_em before update on tipos_atendimento
  for each row execute function set_atualizado_em();
create trigger set_atualizado_em before update on pacientes
  for each row execute function set_atualizado_em();
create trigger set_atualizado_em before update on recorrencias
  for each row execute function set_atualizado_em();
create trigger set_atualizado_em before update on atendimentos
  for each row execute function set_atualizado_em();

-- RLS -------------------------------------------------------------------------
-- Nesta sprint só a direção usa o sistema: qualquer usuário autenticado tem
-- acesso total. Perfis com acesso limitado (profissionais) virão depois.
-- Visitantes anônimos não têm acesso a nada.

alter table profissionais enable row level security;
alter table jornadas enable row level security;
alter table planos enable row level security;
alter table tipos_atendimento enable row level security;
alter table pacientes enable row level security;
alter table recorrencias enable row level security;
alter table atendimentos enable row level security;

create policy "autenticados: acesso total" on profissionais
  for all to authenticated using (true) with check (true);
create policy "autenticados: acesso total" on jornadas
  for all to authenticated using (true) with check (true);
create policy "autenticados: acesso total" on planos
  for all to authenticated using (true) with check (true);
create policy "autenticados: acesso total" on tipos_atendimento
  for all to authenticated using (true) with check (true);
create policy "autenticados: acesso total" on pacientes
  for all to authenticated using (true) with check (true);
create policy "autenticados: acesso total" on recorrencias
  for all to authenticated using (true) with check (true);
create policy "autenticados: acesso total" on atendimentos
  for all to authenticated using (true) with check (true);
