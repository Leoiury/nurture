-- Guias de autorização do convênio.
--
-- Uma guia autoriza um número de atendimentos de uma série (recorrência). As guias
-- de uma série formam uma cadeia (ordem 1, 2, 3…): a primeira começa num atendimento
-- e cada renovação continua de onde a anterior terminou.
--
-- Quais atendimentos cada guia cobre não fica gravado: é calculado (view
-- guias_dos_atendimentos) contando, a partir do início da cadeia, só os atendimentos
-- que gastam sessão — desmarcados e excluídos não gastam. Assim, desmarcar, mover ou
-- incluir atendimentos na série reorganiza a cobertura sozinho.
--
-- 1. planos.exige_guia (atendimento sem guia num plano desses ganha alerta).
-- 2. Tabela guias e a view de cobertura.
-- 3. gerar_guia / renovar_guia: se a série não tem atendimentos suficientes, os que
--    faltam são criados (datas calculadas na aplicação, como na criação de séries).
-- 4. excluir_guia: só a última da cadeia (desfaz um engano).
-- 5. relacionar_atendimentos: junta atendimentos do paciente à série de um
--    atendimento-base, com o mesmo plano e valor dele.
-- 6. Observação automática quando um atendimento passa para outra série.

-- 1. Plano exige guia --------------------------------------------------------------

alter table planos add column exige_guia boolean not null default false;

-- 2. Guias ---------------------------------------------------------------------------

create table guias (
  id uuid primary key default gen_random_uuid(),
  recorrencia_id uuid not null references recorrencias on delete cascade,
  ordem integer not null check (ordem > 0),
  numero text,
  quantidade integer not null check (quantidade between 1 and 120),
  -- Início do primeiro atendimento coberto (na ordem 1, é o início da cadeia).
  a_partir_de timestamptz not null,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references auth.users on delete set null,
  unique (recorrencia_id, ordem)
);

alter table guias enable row level security;
create policy "autenticados: acesso total" on guias
  for all to authenticated using (true) with check (true);

-- Que guia cobre cada atendimento, e em que posição (sessão 3 de 10).
-- renovada: a guia já tem a seguinte registrada.
create view guias_dos_atendimentos with (security_invoker = true) as
with faixas as (
  select g.id, g.recorrencia_id, g.numero, g.ordem, g.quantidade,
         coalesce(sum(g.quantidade) over (partition by g.recorrencia_id order by g.ordem
                                          rows between unbounded preceding and 1 preceding), 0) as antes,
         lead(g.id) over (partition by g.recorrencia_id order by g.ordem) is not null as renovada
  from guias g
),
cadeias as (
  select recorrencia_id, min(a_partir_de) as inicio from guias group by recorrencia_id
),
validos as (
  select a.id, a.recorrencia_id,
         row_number() over (partition by a.recorrencia_id order by a.inicio, a.id) as n
  from atendimentos a
  join cadeias c on c.recorrencia_id = a.recorrencia_id and a.inicio >= c.inicio
  where a.excluido_em is null and a.status <> 'desmarcado'
)
select v.id as atendimento_id, v.recorrencia_id, f.id as guia_id, f.numero, f.ordem,
       (v.n - f.antes)::integer as posicao, f.quantidade, f.renovada
from validos v
join faixas f on f.recorrencia_id = v.recorrencia_id and v.n > f.antes and v.n <= f.antes + f.quantidade;

-- 3. Gerar e renovar -----------------------------------------------------------------

-- Garante `necessarios` atendimentos que gastam sessão na série a partir de `desde`,
-- criando os que faltam nos instantes `novos` (copiados do último atendimento válido:
-- paciente, profissionais, plano, tipo, valor e duração).
create function completar_serie(p_serie uuid, p_desde timestamptz, p_necessarios integer, p_novos timestamptz[])
returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  disponiveis integer;
  modelo atendimentos;
  inicio timestamptz;
  novo uuid;
begin
  select count(*) into disponiveis
  from atendimentos
  where recorrencia_id = p_serie and excluido_em is null and status <> 'desmarcado' and atendimentos.inicio >= p_desde;

  if greatest(p_necessarios - disponiveis, 0) <> coalesce(cardinality(p_novos), 0) then
    raise exception 'A agenda mudou enquanto a guia era preenchida. Feche o atendimento e tente de novo.';
  end if;
  if coalesce(cardinality(p_novos), 0) = 0 then
    return 0;
  end if;

  select * into modelo
  from atendimentos
  where recorrencia_id = p_serie and excluido_em is null and status <> 'desmarcado'
  order by atendimentos.inicio desc
  limit 1;

  foreach inicio in array p_novos loop
    insert into atendimentos (recorrencia_id, paciente_id, plano_id, tipo_id, inicio, fim, valor)
    values (p_serie, modelo.paciente_id, modelo.plano_id, modelo.tipo_id, inicio, inicio + (modelo.fim - modelo.inicio), modelo.valor)
    returning id into novo;

    insert into atendimento_profissionais (atendimento_id, profissional_id)
    select novo, ap.profissional_id from atendimento_profissionais ap where ap.atendimento_id = modelo.id;
  end loop;

  -- A regra da série acompanha o novo tamanho.
  update recorrencias r
     set sessoes = case when r.sessoes is null then null
                        else (select count(*) from atendimentos a where a.recorrencia_id = p_serie and a.excluido_em is null) end,
         data_fim = case when r.data_fim is null then null
                         else greatest(r.data_fim, (select max(x at time zone 'America/Sao_Paulo')::date from unnest(p_novos) as x)) end
   where r.id = p_serie;

  return cardinality(p_novos);
end;
$$;

create function gerar_guia(
  p_atendimento uuid,
  p_quantidade integer,
  p_numero text default null,
  -- Só para atendimento avulso: vira uma série com esta frequência.
  p_frequencia frequencia_recorrencia default null,
  p_novos timestamptz[] default '{}'
) returns uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  base atendimentos;
  serie uuid;
  nova uuid;
begin
  if p_quantidade is null or p_quantidade not between 1 and 120 then
    raise exception 'A guia deve ter de 1 a 120 atendimentos.';
  end if;
  select * into base from atendimentos where id = p_atendimento and excluido_em is null;
  if not found then
    raise exception 'Atendimento não encontrado.';
  end if;
  if base.status = 'desmarcado' then
    raise exception 'Atendimento desmarcado não usa guia.';
  end if;

  serie := base.recorrencia_id;
  if serie is null then
    insert into recorrencias (frequencia, data_inicio, sessoes)
    values (coalesce(p_frequencia, 'semanal'), (base.inicio at time zone 'America/Sao_Paulo')::date, 1)
    returning id into serie;
    perform set_config('nurture.origem', 'guia', true);
    update atendimentos set recorrencia_id = serie where id = base.id;
    perform set_config('nurture.origem', '', true);
  elsif exists (select 1 from guias where recorrencia_id = serie) then
    raise exception 'Esta série já tem guia: use “Renovar guia”.';
  end if;

  perform completar_serie(serie, base.inicio, p_quantidade, p_novos);

  insert into guias (recorrencia_id, ordem, numero, quantidade, a_partir_de)
  values (serie, 1, nullif(trim(p_numero), ''), p_quantidade, base.inicio)
  returning id into nova;
  return nova;
end;
$$;

-- A nova guia começa no atendimento seguinte ao último coberto pela cadeia.
create function renovar_guia(p_guia uuid, p_quantidade integer, p_numero text default null, p_novos timestamptz[] default '{}')
returns uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  atual guias;
  inicio_da_cadeia timestamptz;
  cobertos integer;
  comeco timestamptz;
  nova uuid;
begin
  if p_quantidade is null or p_quantidade not between 1 and 120 then
    raise exception 'A guia deve ter de 1 a 120 atendimentos.';
  end if;
  select * into atual from guias where id = p_guia for update;
  if not found then
    raise exception 'Guia não encontrada.';
  end if;
  if exists (select 1 from guias where recorrencia_id = atual.recorrencia_id and ordem > atual.ordem) then
    raise exception 'Esta guia já foi renovada.';
  end if;

  select min(a_partir_de), sum(quantidade) into inicio_da_cadeia, cobertos from guias where recorrencia_id = atual.recorrencia_id;
  perform completar_serie(atual.recorrencia_id, inicio_da_cadeia, cobertos + p_quantidade, p_novos);

  select a.inicio into comeco
  from atendimentos a
  where a.recorrencia_id = atual.recorrencia_id and a.excluido_em is null and a.status <> 'desmarcado' and a.inicio >= inicio_da_cadeia
  order by a.inicio, a.id
  offset cobertos limit 1;

  insert into guias (recorrencia_id, ordem, numero, quantidade, a_partir_de)
  values (atual.recorrencia_id, atual.ordem + 1, nullif(trim(p_numero), ''), p_quantidade, comeco)
  returning id into nova;
  return nova;
end;
$$;

-- 4. Excluir a última guia da cadeia --------------------------------------------------

create function excluir_guia(p_guia uuid) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  delete from guias g
   where g.id = p_guia
     and not exists (select 1 from guias s where s.recorrencia_id = g.recorrencia_id and s.ordem > g.ordem);
  if not found then
    raise exception 'Só a última guia da série pode ser excluída.';
  end if;
end;
$$;

-- 5. Relacionar atendimentos ----------------------------------------------------------

-- Os atendimentos escolhidos passam para a série do atendimento-base, com o plano e o
-- valor dele. p_frequencia: só se o base for avulso (ele vira o início de uma série).
create function relacionar_atendimentos(p_base uuid, p_ids uuid[], p_frequencia frequencia_recorrencia default null)
returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  base atendimentos;
  serie uuid;
  quantidade integer;
begin
  if coalesce(cardinality(p_ids), 0) = 0 then
    raise exception 'Escolha ao menos um atendimento.';
  end if;
  select * into base from atendimentos where id = p_base and excluido_em is null;
  if not found then
    raise exception 'Atendimento não encontrado.';
  end if;
  if exists (
    select 1 from atendimentos a
    where a.id = any (p_ids) and a.recorrencia_id is distinct from base.recorrencia_id
      and exists (select 1 from guias g where g.recorrencia_id = a.recorrencia_id)
  ) then
    raise exception 'Um dos atendimentos está em outra série com guia.';
  end if;

  perform set_config('nurture.origem', 'relacionamento de atendimentos', true);

  serie := base.recorrencia_id;
  if serie is null then
    insert into recorrencias (frequencia, data_inicio, sessoes)
    values (coalesce(p_frequencia, 'semanal'), (base.inicio at time zone 'America/Sao_Paulo')::date, 1)
    returning id into serie;
    update atendimentos set recorrencia_id = serie where id = base.id;
  end if;

  update atendimentos a
     set recorrencia_id = serie, plano_id = base.plano_id, valor = base.valor
   where a.id = any (p_ids)
     and a.id <> base.id
     and a.excluido_em is null
     and a.paciente_id = base.paciente_id;
  get diagnostics quantidade = row_count;

  update recorrencias r
     set sessoes = (select count(*) from atendimentos a where a.recorrencia_id = serie and a.excluido_em is null)
   where r.id = serie and r.sessoes is not null;

  perform set_config('nurture.origem', '', true);
  return quantidade;
end;
$$;

-- 6. Observação ao mudar de série -------------------------------------------------------
-- Igual à versão anterior (20261001011757), mais a mudança de série quando ela tem
-- origem (guia ou relacionamento).

create or replace function registrar_alteracao_atendimento() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  antes jsonb;
  depois jsonb;
  origem text := nullif(current_setting('nurture.origem', true), '');
  sufixo text := case when origem is null then '' else ' (' || origem || ')' end;
  moeda constant text := 'FM999999990.00'; -- vírgula decimal: replace abaixo
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

  if old.plano_id is distinct from new.plano_id then
    insert into atendimentos_observacoes (atendimento_id, texto, automatica)
    values (new.id, 'Plano alterado de ' || coalesce((select nome from planos where id = old.plano_id), 'nenhum')
                    || ' para ' || coalesce((select nome from planos where id = new.plano_id), 'nenhum') || sufixo, true);
  end if;

  if old.valor is distinct from new.valor then
    insert into atendimentos_observacoes (atendimento_id, texto, automatica)
    values (new.id, 'Valor alterado de '
                    || coalesce('R$ ' || replace(to_char(old.valor, moeda), '.', ','), 'sem valor') || ' para '
                    || coalesce('R$ ' || replace(to_char(new.valor, moeda), '.', ','), 'sem valor') || sufixo, true);
  end if;

  if old.recorrencia_id is distinct from new.recorrencia_id and new.recorrencia_id is not null and origem is not null then
    insert into atendimentos_observacoes (atendimento_id, texto, automatica)
    values (new.id, 'Incluído numa série de atendimentos' || sufixo, true);
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
