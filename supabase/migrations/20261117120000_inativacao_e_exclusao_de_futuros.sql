-- Inativar paciente pelo profissional e excluir os atendimentos futuros de um paciente.
--
-- O profissional não inativa direto: ele pede. O pedido também pede a exclusão de todos os
-- atendimentos dele com o paciente dali em diante, pelo fluxo de exclusão de sempre. A
-- recepção ou um ADM decide: inativar e excluir, manter o paciente e só excluir, ou recusar.
-- Para quem pediu, o paciente sai da lista na hora e fica entre os inativos.

create table inativacoes_pedidas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes on delete cascade,
  profissional_id uuid not null references profissionais,
  pedido_por uuid not null references usuarios,
  -- Quem pede fica no próprio registro: o profissional não lê a tabela de usuários.
  pedido_por_nome text not null,
  motivo text not null check (length(trim(motivo)) > 0),
  -- O mesmo instante marca os atendimentos com exclusão pedida junto.
  pedido_em timestamptz not null default now(),
  decisao text check (decisao in ('inativar', 'manter', 'recusar')),
  decidido_em timestamptz,
  decidido_por uuid references usuarios,
  -- O profissional voltou a ver o paciente (marcou "Ativo" de novo).
  reativado_em timestamptz
);

create index on inativacoes_pedidas (paciente_id);
create index on inativacoes_pedidas (profissional_id);
create unique index inativacoes_uma_em_aberto on inativacoes_pedidas (paciente_id, profissional_id) where decisao is null;

alter table inativacoes_pedidas enable row level security;
create policy "autenticados leem" on inativacoes_pedidas
  for select to authenticated using (true);

-- O profissional não inativa direto (só por pedido); reativar continua livre.
create function travar_inativacao_pelo_profissional() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if old.ativo and not new.ativo and eh_profissional() then
    raise exception 'Peça a inativação: a recepção ou um administrador confirma.';
  end if;
  return new;
end;
$$;

create trigger travar_inativacao_pelo_profissional before update of ativo on pacientes
  for each row execute function travar_inativacao_pelo_profissional();

-- Pede a exclusão dos atendimentos do próprio profissional com o paciente, de agora em diante.
create function pedir_exclusao_dos_futuros(p_paciente uuid, p_motivo text) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  alvos uuid[];
begin
  if not eh_profissional() or meu_profissional() is null then
    raise exception 'Este login não tem um profissional vinculado.';
  end if;
  if length(trim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Informe o motivo da exclusão.';
  end if;
  alvos := array(
    select a.id from atendimentos a
     where a.paciente_id = p_paciente
       and a.inicio >= now()
       and a.excluido_em is null
       and a.exclusao_solicitada_em is null
       and exists (select 1 from atendimento_profissionais ap where ap.atendimento_id = a.id and ap.profissional_id = meu_profissional())
  );
  update atendimentos
     set exclusao_solicitada_em = now(), exclusao_solicitada_por = auth.uid(), exclusao_motivo = trim(p_motivo)
   where id = any (alvos);
  insert into atendimentos_observacoes (atendimento_id, texto, automatica)
  select x, 'Exclusão solicitada por ' || coalesce((select nome from usuarios where id = auth.uid()), 'profissional') || ': ' || trim(p_motivo), true
    from unnest(alvos) as x;
  return cardinality(alvos);
end;
$$;

-- O pedido de inativação: o paciente sai da lista de quem pediu, e os atendimentos futuros
-- dele entram no fluxo de exclusão. Devolve quantos atendimentos tiveram a exclusão pedida.
create function pedir_inativacao(p_paciente uuid, p_motivo text) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not eh_profissional() or meu_profissional() is null then
    raise exception 'Este login não tem um profissional vinculado.';
  end if;
  if length(trim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Informe o motivo da inativação.';
  end if;
  if exists (select 1 from inativacoes_pedidas where paciente_id = p_paciente and profissional_id = meu_profissional() and decisao is null) then
    raise exception 'A inativação deste paciente já foi pedida.';
  end if;
  if not exists (select 1 from pacientes where id = p_paciente) then
    raise exception 'Paciente não encontrado.';
  end if;

  insert into inativacoes_pedidas (paciente_id, profissional_id, pedido_por, pedido_por_nome, motivo)
  select p_paciente, meu_profissional(), u.id, u.nome, trim(p_motivo)
    from usuarios u where u.id = auth.uid();
  return pedir_exclusao_dos_futuros(p_paciente, 'Paciente inativado: ' || trim(p_motivo));
end;
$$;

-- Recepção ou ADM decide. Os atendimentos do pedido são os que tiveram a exclusão pedida
-- no mesmo instante e ainda esperam: os já decididos na agenda ficam como estão.
create function decidir_inativacao(p_id uuid, p_decisao text) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  pedido inativacoes_pedidas;
  alvos uuid[];
begin
  if auth.uid() is null or eh_profissional() then
    raise exception 'Sem permissão.';
  end if;
  if p_decisao not in ('inativar', 'manter', 'recusar') then
    raise exception 'Decisão inválida.';
  end if;
  select * into pedido from inativacoes_pedidas where id = p_id and decisao is null for update;
  if not found then
    raise exception 'Este pedido já foi decidido.';
  end if;

  alvos := array(
    select id from atendimentos
     where paciente_id = pedido.paciente_id
       and exclusao_solicitada_em = pedido.pedido_em
       and exclusao_solicitada_por = pedido.pedido_por
       and excluido_em is null
  );
  if p_decisao = 'recusar' then
    update atendimentos
       set exclusao_solicitada_em = null, exclusao_solicitada_por = null, exclusao_motivo = null
     where id = any (alvos);
    insert into atendimentos_observacoes (atendimento_id, texto, automatica)
    select x, 'Pedido de exclusão recusado', true from unnest(alvos) as x;
  else
    update atendimentos
       set excluido_em = now(), excluido_por = auth.uid(), motivo_exclusao = exclusao_motivo
     where id = any (alvos);
  end if;
  if p_decisao = 'inativar' then
    update pacientes set ativo = false where id = pedido.paciente_id;
  end if;

  update inativacoes_pedidas set decisao = p_decisao, decidido_em = now(), decidido_por = auth.uid() where id = p_id;
  return cardinality(alvos);
end;
$$;

-- O profissional volta a ver o paciente. Se ele estiver inativo para todos, reativa.
create function reativar_paciente_para_mim(p_paciente uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not eh_profissional() or meu_profissional() is null then
    raise exception 'Este login não tem um profissional vinculado.';
  end if;
  if exists (select 1 from inativacoes_pedidas where paciente_id = p_paciente and profissional_id = meu_profissional() and decisao is null) then
    raise exception 'A inativação ainda espera a confirmação da recepção.';
  end if;
  update inativacoes_pedidas set reativado_em = now()
   where paciente_id = p_paciente and profissional_id = meu_profissional() and reativado_em is null;
  update pacientes set ativo = true where id = p_paciente and not ativo;
end;
$$;

-- Recepção ou ADM: exclui direto os atendimentos de agora em diante, de todos os
-- profissionais (p_profissionais nulo) ou só dos escolhidos. Com RLS: o profissional não passa.
create function excluir_futuros_do_paciente(p_paciente uuid, p_profissionais uuid[], p_motivo text) returns integer
language plpgsql set search_path = public, pg_temp as $$
declare
  quantidade integer;
begin
  if auth.uid() is null or eh_profissional() then
    raise exception 'Sem permissão.';
  end if;
  if length(trim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Informe o motivo da exclusão.';
  end if;
  update atendimentos a
     set excluido_em = now(), excluido_por = auth.uid(), motivo_exclusao = trim(p_motivo)
   where a.paciente_id = p_paciente
     and a.inicio >= now()
     and a.excluido_em is null
     and (p_profissionais is null or exists (
       select 1 from atendimento_profissionais ap where ap.atendimento_id = a.id and ap.profissional_id = any (p_profissionais)
     ));
  get diagnostics quantidade = row_count;
  return quantidade;
end;
$$;

do $$
declare
  funcao text;
begin
  foreach funcao in array array[
    'pedir_exclusao_dos_futuros(uuid, text)',
    'pedir_inativacao(uuid, text)',
    'decidir_inativacao(uuid, text)',
    'reativar_paciente_para_mim(uuid)',
    'excluir_futuros_do_paciente(uuid, uuid[], text)'
  ] loop
    execute format('revoke all on function %s from public, anon', funcao);
    execute format('grant execute on function %s to authenticated', funcao);
  end loop;
end;
$$;
