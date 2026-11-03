-- Ações do perfil profissional: ele não altera as tabelas de atendimentos direto
-- (ver 20261102120100), só por estas funções, que conferem se o atendimento é dele
-- e cuidam dos valores sem mostrá-los. Excluir vira um pedido: ADM ou recepção confirma.

alter table atendimentos
  add column exclusao_solicitada_em timestamptz,
  add column exclusao_solicitada_por uuid,
  add column exclusao_motivo text;

-- Para o profissional, o atendimento com exclusão pedida já saiu de tudo.
create or replace view atendimentos_equipe as
  select id, id_legado, recorrencia_id, paciente_id, plano_id, tipo_id, inicio, fim, status, observacao,
         criado_em, atualizado_em, motivo_desmarcacao, excluido_em, excluido_por, motivo_exclusao, importado_em,
         exclusao_solicitada_em, exclusao_solicitada_por, exclusao_motivo
  from atendimentos
  where auth.uid() is not null
    and (exclusao_solicitada_em is null or not eh_profissional());

create function garantir_meus_atendimentos(p_id uuid, p_alcance alcance_serie) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if meu_profissional() is null then
    raise exception 'Este login não tem um profissional vinculado.';
  end if;
  if not exists (select 1 from atendimentos where id = p_id and excluido_em is null) then
    raise exception 'Atendimento não encontrado.';
  end if;
  if exists (
    select 1 from atendimentos_do_alcance(p_id, p_alcance) as alvo(id)
    where not exists (select 1 from atendimento_profissionais ap where ap.atendimento_id = alvo.id and ap.profissional_id = meu_profissional())
  ) then
    raise exception 'Você só pode alterar os próprios atendimentos.';
  end if;
end;
$$;

-- O valor vem do plano, como no formulário da recepção: o profissional não o informa.
create function profissional_criar_atendimentos(
  p_paciente_id uuid,
  p_profissionais uuid[],
  p_inicios timestamptz[],
  p_duracao_min integer,
  p_status status_atendimento default 'marcado',
  p_plano_id uuid default null,
  p_tipo_id uuid default null,
  p_observacao text default null,
  p_frequencia frequencia_recorrencia default null,
  p_data_fim date default null,
  p_sessoes integer default null
) returns setof uuid
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if meu_profissional() is null or not meu_profissional() = any (p_profissionais) then
    raise exception 'Você só pode marcar atendimentos dos quais participa.';
  end if;
  if p_status = 'desmarcado' then
    raise exception 'Status inválido.';
  end if;
  return query select criar_atendimentos(
    p_paciente_id => p_paciente_id,
    p_profissionais => p_profissionais,
    p_inicios => p_inicios,
    p_duracao_min => p_duracao_min,
    p_status => p_status,
    p_plano_id => p_plano_id,
    p_tipo_id => p_tipo_id,
    p_valor => valor_do_plano(p_plano_id, (select area from tipos_atendimento where id = p_tipo_id)),
    p_observacao => p_observacao,
    p_frequencia => p_frequencia,
    p_data_fim => p_data_fim,
    p_sessoes => p_sessoes
  );
end;
$$;

-- Plano ou tipo novo: o valor passa a ser o do plano. Senão, cada atendimento mantém o seu.
create function profissional_editar_atendimentos(
  p_id uuid,
  p_alcance alcance_serie,
  p_paciente_id uuid,
  p_profissionais uuid[],
  p_data date,
  p_hora time,
  p_duracao_min integer,
  p_plano_id uuid default null,
  p_tipo_id uuid default null
) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  base atendimentos;
  muda_cobranca boolean;
begin
  perform garantir_meus_atendimentos(p_id, p_alcance);
  if not meu_profissional() = any (p_profissionais) then
    raise exception 'Você precisa continuar neste atendimento.';
  end if;
  select * into base from atendimentos where id = p_id;
  muda_cobranca := p_plano_id is distinct from base.plano_id or p_tipo_id is distinct from base.tipo_id;
  return editar_atendimentos(
    p_id => p_id,
    p_alcance => p_alcance,
    p_paciente_id => p_paciente_id,
    p_profissionais => p_profissionais,
    p_data => p_data,
    p_hora => p_hora,
    p_duracao_min => p_duracao_min,
    p_plano_id => p_plano_id,
    p_tipo_id => p_tipo_id,
    p_valor => case when muda_cobranca then valor_do_plano(p_plano_id, (select area from tipos_atendimento where id = p_tipo_id)) else base.valor end,
    p_valor_so_neste => not muda_cobranca
  );
end;
$$;

create function profissional_mover_atendimento(p_id uuid, p_inicio timestamptz) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform garantir_meus_atendimentos(p_id, 'este');
  perform mover_atendimento(p_id, p_inicio);
end;
$$;

create function profissional_alterar_status(p_id uuid, p_status status_atendimento) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform garantir_meus_atendimentos(p_id, 'este');
  if p_status = 'desmarcado' then
    raise exception 'Para desmarcar, informe o motivo.';
  end if;
  update atendimentos set status = p_status, motivo_desmarcacao = null where id = p_id;
end;
$$;

create function profissional_desmarcar_atendimentos(p_id uuid, p_alcance alcance_serie, p_motivo text) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform garantir_meus_atendimentos(p_id, p_alcance);
  return desmarcar_atendimentos(p_id, p_alcance, p_motivo);
end;
$$;

create function profissional_solicitar_exclusao(p_id uuid, p_alcance alcance_serie, p_motivo text) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  quantidade integer;
begin
  perform garantir_meus_atendimentos(p_id, p_alcance);
  if length(trim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Informe o motivo da exclusão.';
  end if;

  update atendimentos
     set exclusao_solicitada_em = now(), exclusao_solicitada_por = auth.uid(), exclusao_motivo = trim(p_motivo)
   where id in (select atendimentos_do_alcance(p_id, p_alcance));
  get diagnostics quantidade = row_count;

  insert into atendimentos_observacoes (atendimento_id, texto, automatica)
  select alvo.id, 'Exclusão solicitada por ' || coalesce((select nome from usuarios where id = auth.uid()), 'profissional') || ': ' || trim(p_motivo), true
  from atendimentos_do_alcance(p_id, p_alcance) as alvo(id);
  return quantidade;
end;
$$;

-- Os atendimentos do mesmo pedido: este e os da série pedidos na mesma hora.
create function atendimentos_do_pedido(p_id uuid) returns setof uuid
language sql stable set search_path = public, pg_temp as $$
  select a.id
  from atendimentos a
  join atendimentos base on base.id = p_id
  where a.excluido_em is null
    and base.exclusao_solicitada_em is not null
    and a.exclusao_solicitada_em = base.exclusao_solicitada_em
    and (a.id = base.id or a.recorrencia_id = base.recorrencia_id)
$$;

-- Com RLS (sem security definer): valem as permissões de ADM e recepção.
create function confirmar_exclusao(p_id uuid) returns integer
language plpgsql set search_path = public, pg_temp as $$
declare
  quantidade integer;
begin
  update atendimentos
     set excluido_em = now(), excluido_por = auth.uid(), motivo_exclusao = exclusao_motivo
   where id in (select atendimentos_do_pedido(p_id));
  get diagnostics quantidade = row_count;
  return quantidade;
end;
$$;

-- security definer: a observação é automática, e a política de inclusão não aceita isso.
create function recusar_exclusao(p_id uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  alvos uuid[];
begin
  if auth.uid() is null or eh_profissional() then
    raise exception 'Sem permissão.';
  end if;
  alvos := array(select atendimentos_do_pedido(p_id));
  update atendimentos
     set exclusao_solicitada_em = null, exclusao_solicitada_por = null, exclusao_motivo = null
   where id = any (alvos);
  insert into atendimentos_observacoes (atendimento_id, texto, automatica)
  select x, 'Pedido de exclusão recusado', true from unnest(alvos) as x;
  return cardinality(alvos);
end;
$$;

do $$
declare
  funcao text;
begin
  foreach funcao in array array[
    'garantir_meus_atendimentos(uuid, alcance_serie)',
    'profissional_criar_atendimentos(uuid, uuid[], timestamptz[], integer, status_atendimento, uuid, uuid, text, frequencia_recorrencia, date, integer)',
    'profissional_editar_atendimentos(uuid, alcance_serie, uuid, uuid[], date, time, integer, uuid, uuid)',
    'profissional_mover_atendimento(uuid, timestamptz)',
    'profissional_alterar_status(uuid, status_atendimento)',
    'profissional_desmarcar_atendimentos(uuid, alcance_serie, text)',
    'profissional_solicitar_exclusao(uuid, alcance_serie, text)',
    'atendimentos_do_pedido(uuid)',
    'confirmar_exclusao(uuid)',
    'recusar_exclusao(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', funcao);
    execute format('grant execute on function %s to authenticated', funcao);
  end loop;
end;
$$;
