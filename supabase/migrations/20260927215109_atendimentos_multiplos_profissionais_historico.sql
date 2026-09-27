-- Atendimentos: vários profissionais, recorrência semanal/quinzenal/mensal,
-- exclusão lógica, observações (manuais e automáticas) e histórico de alterações.

-- 1. Vários profissionais por atendimento ----------------------------------------
-- Um atendimento (um valor, um status) pode ter mais de um profissional; o card
-- aparece na coluna de cada um.

create table atendimento_profissionais (
  atendimento_id uuid not null references atendimentos on delete cascade,
  profissional_id uuid not null references profissionais on delete restrict,
  primary key (atendimento_id, profissional_id)
);

create index on atendimento_profissionais (profissional_id);

insert into atendimento_profissionais (atendimento_id, profissional_id)
select id, profissional_id from atendimentos;

alter table atendimentos drop column profissional_id;

alter table atendimento_profissionais enable row level security;
create policy "autenticados: acesso total" on atendimento_profissionais
  for all to authenticated using (true) with check (true);

-- 2. Recorrência -----------------------------------------------------------------
-- A regra fica registrada; os atendimentos da série são gerados na criação e
-- apontam para ela (recorrencia_id). Mensal = mesmo dia da semana (ex.: 2ª terça).
-- A tabela anterior nunca foi usada, então é recriada.

drop table recorrencias cascade; -- remove também a FK de atendimentos.recorrencia_id

create type frequencia_recorrencia as enum ('semanal', 'quinzenal', 'mensal');

create table recorrencias (
  id uuid primary key default gen_random_uuid(),
  frequencia frequencia_recorrencia not null,
  data_inicio date not null,
  -- Fim por data OU por número de sessões (exatamente um dos dois).
  data_fim date,
  sessoes integer check (sessoes > 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check ((data_fim is null) <> (sessoes is null)),
  check (data_fim is null or data_fim >= data_inicio)
);

alter table atendimentos
  add constraint atendimentos_recorrencia_id_fkey
  foreign key (recorrencia_id) references recorrencias on delete set null;

create trigger set_atualizado_em before update on recorrencias
  for each row execute function set_atualizado_em();

alter table recorrencias enable row level security;
create policy "autenticados: acesso total" on recorrencias
  for all to authenticated using (true) with check (true);

-- 3. Desmarcação e exclusão lógica -------------------------------------------------

alter table atendimentos
  add column motivo_desmarcacao text,
  add column excluido_em timestamptz,
  add column excluido_por uuid references auth.users on delete set null,
  add column motivo_exclusao text,
  add constraint exclusao_com_motivo
    check (excluido_em is null or length(trim(coalesce(motivo_exclusao, ''))) > 0);

-- A agenda só lê atendimentos não excluídos.
create index atendimentos_ativos_inicio on atendimentos (inicio) where excluido_em is null;

-- 4. Observações -------------------------------------------------------------------
-- Registro com data, hora e autor. As automáticas são geradas pelos gatilhos
-- abaixo (mudança de horário, status, profissionais, exclusão). Não se editam.

create table atendimentos_observacoes (
  id uuid primary key default gen_random_uuid(),
  atendimento_id uuid not null references atendimentos on delete cascade,
  criado_em timestamptz not null default now(),
  autor_id uuid default auth.uid() references auth.users on delete set null,
  texto text not null check (length(trim(texto)) > 0),
  automatica boolean not null default false
);

create index on atendimentos_observacoes (atendimento_id, criado_em);

alter table atendimentos_observacoes enable row level security;
create policy "autenticados: leem" on atendimentos_observacoes
  for select to authenticated using (true);
create policy "autenticados: incluem" on atendimentos_observacoes
  for insert to authenticated with check (automatica = false);

-- 5. Histórico de alterações ("delta") --------------------------------------------
-- Antes/depois de cada mudança, com data e autor. Oculto da interface; gravado
-- só pelos gatilhos (security definer), nunca direto pela aplicação.

create table atendimentos_alteracoes (
  id bigint generated always as identity primary key,
  atendimento_id uuid not null, -- sem FK: o registro sobrevive ao atendimento
  alterado_em timestamptz not null default now(),
  alterado_por uuid default auth.uid(),
  operacao text not null check (operacao in ('criacao', 'alteracao', 'profissionais')),
  antes jsonb,
  depois jsonb
);

create index on atendimentos_alteracoes (atendimento_id, alterado_em);

alter table atendimentos_alteracoes enable row level security;
create policy "autenticados: leem" on atendimentos_alteracoes
  for select to authenticated using (true);

-- "22/09/2026 10:30–11:15" no fuso da clínica.
create function formatar_periodo(inicio timestamptz, fim timestamptz) returns text
language sql immutable as $$
  select to_char(inicio at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
      || '–' || to_char(fim at time zone 'America/Sao_Paulo', 'HH24:MI')
$$;

create function registrar_alteracao_atendimento() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  antes jsonb;
  depois jsonb;
begin
  if tg_op = 'INSERT' then
    insert into atendimentos_alteracoes (atendimento_id, operacao, depois)
    values (new.id, 'criacao', to_jsonb(new));
    return new;
  end if;

  -- Só os campos que mudaram (atualizado_em não conta).
  select jsonb_object_agg(o.key, o.value), jsonb_object_agg(o.key, to_jsonb(new) -> o.key)
    into antes, depois
  from jsonb_each(to_jsonb(old)) o
  where o.key <> 'atualizado_em' and o.value is distinct from to_jsonb(new) -> o.key;

  if antes is null then
    return new;
  end if;

  insert into atendimentos_alteracoes (atendimento_id, operacao, antes, depois)
  values (new.id, 'alteracao', antes, depois);

  -- Observações automáticas.
  if old.inicio is distinct from new.inicio or old.fim is distinct from new.fim then
    insert into atendimentos_observacoes (atendimento_id, texto, automatica)
    values (new.id, 'Horário alterado de ' || formatar_periodo(old.inicio, old.fim)
                    || ' para ' || formatar_periodo(new.inicio, new.fim), true);
  end if;

  if old.status is distinct from new.status then
    insert into atendimentos_observacoes (atendimento_id, texto, automatica)
    values (new.id, 'Status: ' || old.status || ' → ' || new.status
                    || case when new.status = 'desmarcado' and new.motivo_desmarcacao is not null
                            then ' (' || new.motivo_desmarcacao || ')' else '' end, true);
  end if;

  if old.excluido_em is null and new.excluido_em is not null then
    insert into atendimentos_observacoes (atendimento_id, texto, automatica)
    values (new.id, 'Excluído: ' || new.motivo_exclusao, true);
  elsif old.excluido_em is not null and new.excluido_em is null then
    insert into atendimentos_observacoes (atendimento_id, texto, automatica)
    values (new.id, 'Exclusão desfeita', true);
  end if;

  return new;
end;
$$;

create trigger registrar_alteracao after insert or update on atendimentos
  for each row execute function registrar_alteracao_atendimento();

create function registrar_alteracao_profissionais() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  registro atendimento_profissionais;
  criado timestamptz;
  nome_profissional text;
begin
  if tg_op = 'INSERT' then
    registro := new;
  else
    registro := old;
  end if;
  select criado_em into criado from atendimentos where id = registro.atendimento_id;

  -- Atendimento criado nesta mesma transação (profissionais iniciais) ou sendo
  -- apagado (cascata): não é uma alteração.
  if criado is null or criado = now() then
    return registro;
  end if;

  select nome into nome_profissional from profissionais where id = registro.profissional_id;

  insert into atendimentos_alteracoes (atendimento_id, operacao, antes, depois)
  values (
    registro.atendimento_id,
    'profissionais',
    case when tg_op = 'DELETE' then jsonb_build_object('profissional_id', registro.profissional_id) end,
    case when tg_op = 'INSERT' then jsonb_build_object('profissional_id', registro.profissional_id) end
  );

  insert into atendimentos_observacoes (atendimento_id, texto, automatica)
  values (
    registro.atendimento_id,
    case when tg_op = 'INSERT' then 'Profissional adicionado: ' else 'Profissional removido: ' end || nome_profissional,
    true
  );

  return registro;
end;
$$;

create trigger registrar_alteracao after insert or delete on atendimento_profissionais
  for each row execute function registrar_alteracao_profissionais();

-- 6. Criação de atendimentos (com ou sem recorrência) ----------------------------
-- Grava tudo numa transação: se uma data da série falhar, nenhuma é criada.
-- As datas vêm prontas da aplicação (mesma regra usada na prévia do formulário).

create function criar_atendimentos(
  p_paciente_id uuid,
  p_profissionais uuid[],
  p_inicios timestamptz[],
  p_duracao_min integer,
  -- Opcionais: plano, tipo e valor podem ficar em branco (ex.: APAE sem valor).
  p_status status_atendimento default 'marcado',
  p_plano_id uuid default null,
  p_tipo_id uuid default null,
  p_valor numeric default null,
  p_observacao text default null,
  p_frequencia frequencia_recorrencia default null,
  p_data_fim date default null,
  p_sessoes integer default null
) returns setof uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  recorrencia uuid;
  novo uuid;
  inicio timestamptz;
begin
  if coalesce(cardinality(p_profissionais), 0) = 0 then
    raise exception 'Informe ao menos um profissional.';
  end if;
  if coalesce(cardinality(p_inicios), 0) = 0 then
    raise exception 'Informe ao menos uma data.';
  end if;
  if cardinality(p_inicios) > 120 then
    raise exception 'Uma série pode ter no máximo 120 atendimentos.';
  end if;
  if p_duracao_min is null or p_duracao_min <= 0 then
    raise exception 'Duração inválida.';
  end if;

  if p_frequencia is not null then
    insert into recorrencias (frequencia, data_inicio, data_fim, sessoes)
    values (p_frequencia, (p_inicios[1] at time zone 'America/Sao_Paulo')::date, p_data_fim, p_sessoes)
    returning id into recorrencia;
  end if;

  foreach inicio in array p_inicios loop
    insert into atendimentos (recorrencia_id, paciente_id, plano_id, tipo_id, inicio, fim, valor, status)
    values (recorrencia, p_paciente_id, p_plano_id, p_tipo_id, inicio,
            inicio + make_interval(mins => p_duracao_min), p_valor, coalesce(p_status, 'marcado'))
    returning id into novo;

    insert into atendimento_profissionais (atendimento_id, profissional_id)
    select novo, p from unnest(p_profissionais) as p;

    if length(trim(coalesce(p_observacao, ''))) > 0 then
      insert into atendimentos_observacoes (atendimento_id, texto) values (novo, trim(p_observacao));
    end if;

    return next novo;
  end loop;
end;
$$;
