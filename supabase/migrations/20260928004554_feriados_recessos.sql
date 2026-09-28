-- Feriados (estaduais/municipais) e recessos cadastrados pela clínica.
-- Os feriados nacionais são calculados na aplicação e não ficam aqui.

create type tipo_feriado as enum ('feriado', 'recesso');

create table feriados (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  tipo tipo_feriado not null,
  data_inicio date not null,
  data_fim date not null,
  -- Vazio = a clínica toda. Preenchido = ausência de um profissional (férias etc.),
  -- prevista para a próxima sprint (issue #1); a interface ainda não usa.
  profissional_id uuid references profissionais on delete cascade,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (data_fim >= data_inicio)
);

create index on feriados (data_inicio, data_fim);

create trigger set_atualizado_em before update on feriados
  for each row execute function set_atualizado_em();

alter table feriados enable row level security;
create policy "autenticados: acesso total" on feriados
  for all to authenticated using (true) with check (true);

-- Atendimentos ainda marcados/confirmados num período (datas no fuso da clínica).
create function atendimentos_ativos_no_periodo(p_inicio date, p_fim date) returns setof uuid
language sql stable security invoker set search_path = public, pg_temp as $$
  select id from atendimentos
  where excluido_em is null
    and status in ('marcado', 'confirmado')
    and (inicio at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
$$;

-- Desmarca de uma vez os atendimentos marcados/confirmados de um período
-- (ex.: ao cadastrar um recesso). Atendidos e faltas não mudam.
create function desmarcar_periodo(p_inicio date, p_fim date, p_motivo text) returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  quantidade integer;
begin
  if length(trim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Informe o motivo da desmarcação.';
  end if;
  update atendimentos
     set status = 'desmarcado', motivo_desmarcacao = trim(p_motivo)
   where id in (select atendimentos_ativos_no_periodo(p_inicio, p_fim));
  get diagnostics quantidade = row_count;
  return quantidade;
end;
$$;
