-- Cada profissional tem o próprio atendimento: status, tipo, valor, registro, série e,
-- portanto, guia. Marcar com vários profissionais cria um atendimento (ou uma série)
-- para cada um, e o banco não aceita mais dois profissionais no mesmo atendimento.

-- 1. O que já existe ---------------------------------------------------------------
-- Separa os atendimentos conjuntos: o primeiro profissional fica no original, e cada
-- um dos outros ganha uma cópia, levando o que é dele.
create temporary table series_separadas (recorrencia_antiga uuid, profissional_id uuid, recorrencia_nova uuid, primary key (recorrencia_antiga, profissional_id)) on commit drop;

do $$
declare
  r record;
  novo uuid;
  serie uuid;
begin
  for r in
    select ap.atendimento_id, ap.profissional_id, a.*
    from (
      select atendimento_id, profissional_id, row_number() over (partition by atendimento_id order by profissional_id) as ordem
      from atendimento_profissionais
    ) ap
    join atendimentos a on a.id = ap.atendimento_id
    where ap.ordem > 1
  loop
    serie := null;
    if r.recorrencia_id is not null then
      select recorrencia_nova into serie from series_separadas where recorrencia_antiga = r.recorrencia_id and profissional_id = r.profissional_id;
      if serie is null then
        insert into recorrencias (frequencia, data_inicio, data_fim, sessoes)
        select frequencia, data_inicio, data_fim, sessoes from recorrencias where id = r.recorrencia_id
        returning id into serie;
        insert into series_separadas values (r.recorrencia_id, r.profissional_id, serie);
      end if;
    end if;

    insert into atendimentos (recorrencia_id, paciente_id, plano_id, tipo_id, inicio, fim, valor, status, observacao, motivo_desmarcacao, excluido_em, excluido_por, motivo_exclusao)
    values (serie, r.paciente_id, r.plano_id, r.tipo_id, r.inicio, r.fim, r.valor, r.status, r.observacao, r.motivo_desmarcacao, r.excluido_em, r.excluido_por, r.motivo_exclusao)
    returning id into novo;

    delete from atendimento_profissionais where atendimento_id = r.atendimento_id and profissional_id = r.profissional_id;
    insert into atendimento_profissionais (atendimento_id, profissional_id) values (novo, r.profissional_id);
    update registros_atendimento set atendimento_id = novo where atendimento_id = r.atendimento_id and profissional_id = r.profissional_id;
    update anamneses set atendimento_id = novo where atendimento_id = r.atendimento_id and profissional_id = r.profissional_id;
  end loop;
end;
$$;

create unique index atendimento_um_profissional on atendimento_profissionais (atendimento_id);

-- 2. Criar -------------------------------------------------------------------------
create or replace function criar_atendimentos(
  p_paciente_id uuid,
  p_profissionais uuid[],
  p_inicios timestamptz[],
  p_duracao_min integer,
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
  profissional uuid;
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

  foreach profissional in array p_profissionais loop
    recorrencia := null;
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

      insert into atendimento_profissionais (atendimento_id, profissional_id) values (novo, profissional);

      if length(trim(coalesce(p_observacao, ''))) > 0 then
        insert into atendimentos_observacoes (atendimento_id, texto) values (novo, trim(p_observacao));
      end if;

      return next novo;
    end loop;
  end loop;
end;
$$;

-- Vários atendimentos numa transação só, pelo profissional: cada um com o tipo do seu
-- profissional e o valor do plano. Quem marca precisa estar entre eles.
create function profissional_criar_em_lote(p_itens jsonb) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a jsonb;
  tipo uuid;
  plano uuid;
  quantidade integer := 0;
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) < 2 then
    raise exception 'Informe ao menos dois atendimentos.';
  end if;
  if meu_profissional() is null or not exists (
    select 1 from jsonb_array_elements(p_itens) i, jsonb_array_elements_text(i -> 'p_profissionais') x where x::uuid = meu_profissional()
  ) then
    raise exception 'Você só pode marcar atendimentos dos quais participa.';
  end if;

  for a in select * from jsonb_array_elements(p_itens) loop
    if coalesce(a ->> 'p_status', 'marcado') = 'desmarcado' then
      raise exception 'Status inválido.';
    end if;
    tipo := (a ->> 'p_tipo_id')::uuid;
    plano := (a ->> 'p_plano_id')::uuid;
    select quantidade + count(*) into quantidade
    from criar_atendimentos(
      p_paciente_id => (a ->> 'p_paciente_id')::uuid,
      p_profissionais => array(select x::uuid from jsonb_array_elements_text(a -> 'p_profissionais') as x),
      p_inicios => array(select x::timestamptz from jsonb_array_elements_text(a -> 'p_inicios') as x),
      p_duracao_min => (a ->> 'p_duracao_min')::integer,
      p_status => coalesce(a ->> 'p_status', 'marcado')::status_atendimento,
      p_plano_id => plano,
      p_tipo_id => tipo,
      p_valor => valor_do_plano(plano, (select area from tipos_atendimento where id = tipo)),
      p_observacao => a ->> 'p_observacao',
      p_frequencia => (a ->> 'p_frequencia')::frequencia_recorrencia,
      p_data_fim => (a ->> 'p_data_fim')::date,
      p_sessoes => (a ->> 'p_sessoes')::integer
    );
  end loop;
  return quantidade;
end;
$$;

revoke all on function profissional_criar_em_lote(jsonb) from public, anon;
grant execute on function profissional_criar_em_lote(jsonb) to authenticated;

-- 3. Cobrança ----------------------------------------------------------------------
-- Com um profissional por atendimento, o valor já é o total: o cálculo sai.
create or replace function saldo_do_atendimento(p_id uuid) returns numeric
language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce(a.valor, 0)
         - coalesce((select sum(pa.valor) from pagamentos_atendimentos pa where pa.atendimento_id = a.id), 0)
         - coalesce((select sum(b.valor) from baixas_atendimentos b where b.atendimento_id = a.id), 0)
    from atendimentos a
   where a.id = p_id
$$;

create or replace view atendimentos_em_aberto with (security_invoker = true) as
select a.id, a.inicio, a.status, a.valor, a.paciente_id, a.plano_id, a.tipo_id
  from atendimentos a
 where a.excluido_em is null
   and a.status in ('atendido', 'faltou')
   and a.valor > 0
   and saldo_do_atendimento(a.id) > 0.005;

drop function valor_cobrado(atendimentos);
