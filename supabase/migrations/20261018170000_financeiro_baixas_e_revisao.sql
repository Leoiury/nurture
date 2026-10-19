-- Financeiro: baixa do saldo que não será recebido (glosa do convênio, desconto,
-- perdão), total em aberto de todos os meses e quitações a revisar (atendimento
-- pago que depois foi excluído, desmarcado ou teve o valor reduzido).

create table baixas_atendimentos (
  id uuid primary key default gen_random_uuid(),
  atendimento_id uuid not null references atendimentos on delete restrict,
  data date not null,
  valor numeric(10, 2) not null check (valor > 0),
  motivo text not null check (motivo in ('glosa', 'desconto', 'perdao', 'outro')),
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references auth.users on delete set null
);
create index on baixas_atendimentos (atendimento_id);
create index on baixas_atendimentos (data);

alter table baixas_atendimentos enable row level security;
create policy "adm: acesso total" on baixas_atendimentos for all to authenticated using (eh_adm()) with check (eh_adm());

-- O que falta receber de um atendimento: valor − quitado − baixado.
create function saldo_do_atendimento(p_id uuid) returns numeric
language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce(a.valor, 0)
         - coalesce((select sum(pa.valor) from pagamentos_atendimentos pa where pa.atendimento_id = a.id), 0)
         - coalesce((select sum(b.valor) from baixas_atendimentos b where b.atendimento_id = a.id), 0)
    from atendimentos a
   where a.id = p_id
$$;

-- registrar_pagamento passa a descontar também as baixas do que falta pagar.
create or replace function registrar_pagamento(
  p_data date,
  p_valor numeric,
  p_forma text,
  p_paciente uuid default null,
  p_plano uuid default null,
  p_observacao text default null,
  p_itens jsonb default '[]'
) returns uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  novo uuid;
  item jsonb;
  quitar numeric;
  total numeric := 0;
begin
  if not eh_adm() then
    raise exception 'Apenas a direção pode registrar pagamentos.';
  end if;
  insert into pagamentos (data, valor, forma, paciente_id, plano_id, observacao)
  values (p_data, p_valor, p_forma, p_paciente, p_plano, nullif(trim(coalesce(p_observacao, '')), ''))
  returning id into novo;

  for item in select value from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    quitar := (item ->> 'valor')::numeric;
    perform 1 from atendimentos where id = (item ->> 'atendimento_id')::uuid and excluido_em is null for update;
    if not found then
      raise exception 'Um dos atendimentos não existe mais.';
    end if;
    if quitar > saldo_do_atendimento((item ->> 'atendimento_id')::uuid) then
      raise exception 'O valor quitado passa do que falta pagar num dos atendimentos.';
    end if;
    insert into pagamentos_atendimentos (pagamento_id, atendimento_id, valor)
    values (novo, (item ->> 'atendimento_id')::uuid, quitar);
    total := total + quitar;
  end loop;

  if total > p_valor then
    raise exception 'A soma dos atendimentos passa do valor do pagamento.';
  end if;
  return novo;
end;
$$;

-- Dá baixa em vários atendimentos de uma vez. p_itens: [{ "atendimento_id", "valor" }].
create function dar_baixa(p_data date, p_motivo text, p_observacao text, p_itens jsonb) returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  item jsonb;
  n integer := 0;
begin
  if not eh_adm() then
    raise exception 'Apenas a direção pode dar baixa.';
  end if;
  for item in select value from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    perform 1 from atendimentos where id = (item ->> 'atendimento_id')::uuid and excluido_em is null for update;
    if not found then
      raise exception 'Um dos atendimentos não existe mais.';
    end if;
    if (item ->> 'valor')::numeric > saldo_do_atendimento((item ->> 'atendimento_id')::uuid) then
      raise exception 'A baixa passa do que falta receber num dos atendimentos.';
    end if;
    insert into baixas_atendimentos (atendimento_id, data, valor, motivo, observacao)
    values ((item ->> 'atendimento_id')::uuid, p_data, (item ->> 'valor')::numeric, p_motivo, nullif(trim(coalesce(p_observacao, '')), ''));
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Realizados com saldo em aberto, de todos os meses.
create function total_em_aberto() returns table (valor numeric, quantidade integer)
language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce(sum(s), 0), count(*)::integer
    from (select saldo_do_atendimento(a.id) as s
            from atendimentos a
           where a.excluido_em is null and a.status = 'atendido' and a.valor > 0) x
   where s > 0.005
$$;

-- Quitações que precisam de revisão: o atendimento foi excluído, não está mais
-- como realizado/falta, ou recebeu mais do que vale.
create view quitacoes_a_revisar with (security_invoker = true) as
select pa.pagamento_id, pa.atendimento_id, pa.valor,
       case
         when a.excluido_em is not null then 'excluido'
         when a.status not in ('atendido', 'faltou') then 'status'
         else 'valor'
       end as motivo
  from pagamentos_atendimentos pa
  join atendimentos a on a.id = pa.atendimento_id
 where a.excluido_em is not null
    or a.status not in ('atendido', 'faltou')
    or saldo_do_atendimento(a.id) < -0.005;

-- Realizados e faltas com saldo em aberto (de todos os meses), com as mesmas
-- colunas de atendimentos usadas pelo financeiro (permite as mesmas junções).
create view atendimentos_em_aberto with (security_invoker = true) as
select a.id, a.inicio, a.status, a.valor, a.paciente_id, a.plano_id, a.tipo_id
  from atendimentos a
 where a.excluido_em is null
   and a.status in ('atendido', 'faltou')
   and a.valor > 0
   and saldo_do_atendimento(a.id) > 0.005;
