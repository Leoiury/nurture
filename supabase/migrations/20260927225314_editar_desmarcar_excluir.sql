-- Editar, desmarcar e excluir atendimentos — avulsos ou em série.
-- Cada operação roda numa transação; histórico e observações automáticas saem
-- dos gatilhos já existentes.

-- Alcance numa série: só este, este e os próximos, ou a série toda.
create type alcance_serie as enum ('este', 'seguintes', 'todos');

-- Atendimentos (não excluídos) atingidos por uma operação.
create function atendimentos_do_alcance(p_id uuid, p_alcance alcance_serie) returns setof uuid
language sql stable security invoker set search_path = public, pg_temp as $$
  select a.id
  from atendimentos a
  join atendimentos base on base.id = p_id
  where a.excluido_em is null
    and (
      a.id = base.id
      or (
        p_alcance <> 'este'
        and base.recorrencia_id is not null
        and a.recorrencia_id = base.recorrencia_id
        and (p_alcance = 'todos' or a.inicio >= base.inicio)
      )
    )
$$;

-- Editar. Numa série, todos os atingidos são deslocados pelo mesmo número de
-- dias que o atendimento de referência e passam para o novo horário.
create function editar_atendimentos(
  p_id uuid,
  p_alcance alcance_serie,
  p_paciente_id uuid,
  p_profissionais uuid[],
  p_data date,
  p_hora time,
  p_duracao_min integer,
  p_plano_id uuid default null,
  p_tipo_id uuid default null,
  p_valor numeric default null
) returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  base atendimentos;
  deslocamento integer;
  alvo uuid;
  novo_inicio timestamptz;
  quantidade integer := 0;
begin
  if coalesce(cardinality(p_profissionais), 0) = 0 then
    raise exception 'Informe ao menos um profissional.';
  end if;
  if p_duracao_min is null or p_duracao_min <= 0 then
    raise exception 'Duração inválida.';
  end if;

  select * into base from atendimentos where id = p_id and excluido_em is null;
  if not found then
    raise exception 'Atendimento não encontrado.';
  end if;

  deslocamento := p_data - (base.inicio at time zone 'America/Sao_Paulo')::date;

  for alvo in select atendimentos_do_alcance(p_id, p_alcance) loop
    select (((a.inicio at time zone 'America/Sao_Paulo')::date + deslocamento) + p_hora) at time zone 'America/Sao_Paulo'
      into novo_inicio
    from atendimentos a where a.id = alvo;

    update atendimentos
       set paciente_id = p_paciente_id,
           plano_id = p_plano_id,
           tipo_id = p_tipo_id,
           valor = p_valor,
           inicio = novo_inicio,
           fim = novo_inicio + make_interval(mins => p_duracao_min)
     where id = alvo;

    delete from atendimento_profissionais
     where atendimento_id = alvo and profissional_id <> all (p_profissionais);
    insert into atendimento_profissionais (atendimento_id, profissional_id)
    select alvo, p from unnest(p_profissionais) as p
    on conflict do nothing;

    quantidade := quantidade + 1;
  end loop;

  return quantidade;
end;
$$;

-- Desmarcar com motivo. Numa série, só os ainda marcados/confirmados são
-- desmarcados: atendidos e faltas ficam como estão.
create function desmarcar_atendimentos(p_id uuid, p_alcance alcance_serie, p_motivo text) returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  quantidade integer;
begin
  if length(trim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Informe o motivo da desmarcação.';
  end if;

  update atendimentos
     set status = 'desmarcado', motivo_desmarcacao = trim(p_motivo)
   where id in (select atendimentos_do_alcance(p_id, p_alcance))
     and (id = p_id or status in ('marcado', 'confirmado'));
  get diagnostics quantidade = row_count;
  return quantidade;
end;
$$;

-- Excluir (lógico) com observação obrigatória: some da agenda, fica guardado.
create function excluir_atendimentos(p_id uuid, p_alcance alcance_serie, p_motivo text) returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  quantidade integer;
begin
  if length(trim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Informe o motivo da exclusão.';
  end if;

  update atendimentos
     set excluido_em = now(), excluido_por = auth.uid(), motivo_exclusao = trim(p_motivo)
   where id in (select atendimentos_do_alcance(p_id, p_alcance));
  get diagnostics quantidade = row_count;
  return quantidade;
end;
$$;
